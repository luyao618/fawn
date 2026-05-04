from __future__ import annotations

import json
import uuid
from datetime import UTC, date, datetime, timedelta

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.agent.intent import TrackerIntent, TrackerIntentSlots
from fawn.models import AgentTask, Baby, Conversation, FeedingRecord, Message, SleepRecord


def _events(payload: str) -> list[dict]:
    events = []
    for block in payload.strip().split("\n\n"):
        if block.startswith("data: "):
            events.append(json.loads(block.removeprefix("data: ")))
    return events


async def _create_conversation(client: AsyncClient, headers: dict) -> str:
    response = await client.post("/api/chat/conversations", headers=headers)
    assert response.status_code == 200
    return response.json()["id"]


async def test_chat_deterministic_route_creates_feeding_record(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    async def fake_classifier(message: str) -> TrackerIntent:
        return TrackerIntent(
            intent="record_feeding",
            confidence=0.96,
            slots=TrackerIntentSlots(
                feed_time="2026-05-02T08:30:00+00:00",
                feed_type="formula",
                amount_ml=90,
            ),
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "今天早上喝了90ml配方奶"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    events = _events(response.text)
    assert any(
        event["type"] == "tool_call" and event["name"] == "record_feeding"
        for event in events
    )
    assert any(event["type"] == "token" and "已记录" in event["content"] for event in events)

    records = list((await db.execute(select(FeedingRecord))).scalars())
    assert len(records) == 1
    assert records[0].feed_type == "formula"
    assert records[0].amount_ml == 90


async def test_chat_deterministic_route_rejects_friend_write(
    client: AsyncClient,
    friend_auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    async def fake_classifier(message: str) -> TrackerIntent:
        return TrackerIntent(
            intent="record_feeding",
            confidence=0.96,
            slots=TrackerIntentSlots(
                feed_time="2026-05-02T08:30:00+00:00",
                feed_type="breast",
                duration_min=12,
            ),
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, friend_auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "刚刚母乳12分钟"},
        headers=friend_auth_headers,
    )

    assert response.status_code == 200
    events = _events(response.text)
    assert any("只有查看权限" in event.get("content", "") for event in events)
    assert list((await db.execute(select(FeedingRecord))).scalars()) == []


async def test_chat_deterministic_route_asks_for_missing_slots(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    async def fake_classifier(message: str) -> TrackerIntent:
        return TrackerIntent(
            intent="record_feeding",
            confidence=0.93,
            slots=TrackerIntentSlots(
                feed_time="2026-05-02T08:30:00+00:00",
                feed_type="formula",
            ),
            missing_slots=["amount_ml"],
            user_facing_question="这次配方奶喝了多少 ml？",
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "刚刚喝了配方奶"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    events = _events(response.text)
    assert any("多少 ml" in event.get("content", "") for event in events)
    assert list((await db.execute(select(FeedingRecord))).scalars()) == []


async def test_chat_deterministic_route_reports_empty_sleep_query(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    monkeypatch,
) -> None:
    async def fake_classifier(message: str) -> TrackerIntent:
        return TrackerIntent(
            intent="query_sleep",
            confidence=0.91,
            slots=TrackerIntentSlots(query_date="2026-05-02"),
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "今天睡了多久？"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    events = _events(response.text)
    assert any("还没有睡眠记录" in event.get("content", "") for event in events)


async def test_chat_falls_back_to_langgraph_for_unknown_tracker_intent(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    monkeypatch,
) -> None:
    async def fake_classifier(message: str) -> TrackerIntent:
        return TrackerIntent(intent="unknown", confidence=0.2)

    class Chunk:
        content = "普通回复"

    class FakeGraph:
        async def astream_events(self, input_state, config, version):
            yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}

    async def fake_get_agent_graph():
        return FakeGraph()

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    monkeypatch.setattr("fawn.api.chat.get_agent_graph", fake_get_agent_graph)
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "你好"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    events = _events(response.text)
    assert any(event["type"] == "token" and event["content"] == "普通回复" for event in events)


async def test_chat_fallback_receives_recent_context(
    client: AsyncClient,
    auth_headers: dict,
    test_user,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return TrackerIntent(intent="unknown", confidence=0.2)

    captured: dict = {}

    class Chunk:
        content = "记得上下文"

    class FakeGraph:
        async def astream_events(self, input_state, config, version):
            captured["input_state"] = input_state
            yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}

    async def fake_get_agent_graph():
        return FakeGraph()

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    monkeypatch.setattr("fawn.api.chat.get_agent_graph", fake_get_agent_graph)
    conversation_id = uuid.UUID(await _create_conversation(client, auth_headers))
    db.add_all(
        [
            Message(
                conversation_id=conversation_id,
                sender_user_id=test_user.id,
                role="user",
                content="宝宝昨晚睡得不错",
            ),
            Message(
                conversation_id=conversation_id,
                role="assistant",
                content="我记住了，昨晚睡得不错。",
            ),
        ]
    )
    await db.commit()

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "那今天呢？"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    human_message = captured["input_state"]["messages"][1]
    assert "<recent-context>" in human_message.content
    assert "宝宝昨晚睡得不错" in human_message.content
    assert "当前用户消息" in human_message.content


async def test_chat_pending_sleep_task_collects_slots_and_confirms(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    intents = [
        TrackerIntent(
            intent="record_sleep",
            confidence=0.96,
            slots=TrackerIntentSlots(sleep_type="night"),
            missing_slots=["sleep_start", "sleep_end", "night_wakings"],
        ),
        TrackerIntent(
            intent="record_sleep",
            confidence=0.96,
            slots=TrackerIntentSlots(night_wakings=1),
            missing_slots=["sleep_start", "sleep_end"],
        ),
        TrackerIntent(
            intent="record_sleep",
            confidence=0.96,
            slots=TrackerIntentSlots(
                sleep_start="2026-05-03T20:00:00+08:00",
                sleep_end="2026-05-04T03:00:00+08:00",
                sleep_type="night",
            ),
        ),
    ]

    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return intents.pop(0)

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    first = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "昨晚睡眠7个小时"},
        headers=auth_headers,
    )
    assert first.status_code == 200
    assert any("睡眠" in event.get("content", "") for event in _events(first.text))

    second = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "差不多，醒1次"},
        headers=auth_headers,
    )
    assert second.status_code == 200

    third = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "8点到3点"},
        headers=auth_headers,
    )
    assert third.status_code == 200
    assert any("确认" in event.get("content", "") for event in _events(third.text))
    assert list((await db.execute(select(SleepRecord))).scalars()) == []

    confirm = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "确认"},
        headers=auth_headers,
    )
    assert confirm.status_code == 200
    events = _events(confirm.text)
    assert any(
        event.get("type") == "tool_call" and event.get("name") == "record_sleep"
        for event in events
    )

    records = list((await db.execute(select(SleepRecord))).scalars())
    assert len(records) == 1
    assert records[0].sleep_start.date() == date(2026, 5, 3)
    assert records[0].sleep_start.hour == 20
    assert records[0].sleep_end.date() == date(2026, 5, 4)
    assert records[0].sleep_end.hour == 3
    assert records[0].night_wakings == 1
    task = await db.scalar(select(AgentTask))
    assert task is not None
    assert task.status == "completed"


async def test_recent_record_question_uses_context_before_classifier(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    classifier_calls = 0

    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        nonlocal classifier_calls
        classifier_calls += 1
        return TrackerIntent(
            intent="record_sleep",
            confidence=0.96,
            slots=TrackerIntentSlots(
                sleep_start="2026-05-03T22:00:00+08:00",
                sleep_end="2026-05-04T06:00:00+08:00",
                sleep_type="night",
                night_wakings=1,
            ),
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    initial = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "记录昨晚夜睡，晚上10点到早上6点，醒1次"},
        headers=auth_headers,
    )
    assert initial.status_code == 200
    assert any("确认" in event.get("content", "") for event in _events(initial.text))

    confirm = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "确认"},
        headers=auth_headers,
    )
    assert confirm.status_code == 200

    question = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "你刚刚记录了什么 完整告诉我"},
        headers=auth_headers,
    )

    assert question.status_code == 200
    events = _events(question.text)
    response_text = "".join(event.get("content", "") for event in events)
    assert classifier_calls == 1
    assert not any(event.get("name") == "query_sleep" for event in events)
    assert "刚刚记录的是睡眠" in response_text
    assert "2026-05-03 22:00" in response_text
    assert "2026-05-04 06:00" in response_text
    assert "夜醒 1 次" in response_text


async def test_context_question_without_recent_record_falls_back_with_recent_context(
    client: AsyncClient,
    auth_headers: dict,
    test_user,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    captured: dict = {}

    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return TrackerIntent(intent="query_sleep", confidence=0.96)

    class Chunk:
        content = "你刚刚说宝宝昨晚睡得不错"

    class FakeGraph:
        async def astream_events(self, input_state, config, version):
            captured["input_state"] = input_state
            yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}

    async def fake_get_agent_graph():
        return FakeGraph()

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    monkeypatch.setattr("fawn.api.chat.get_agent_graph", fake_get_agent_graph)
    conversation_id = uuid.UUID(await _create_conversation(client, auth_headers))
    db.add(
        Message(
            conversation_id=conversation_id,
            sender_user_id=test_user.id,
            role="user",
            content="宝宝昨晚睡得不错",
        )
    )
    await db.commit()

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "我刚刚说了什么"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    events = _events(response.text)
    assert any("宝宝昨晚睡得不错" in event.get("content", "") for event in events)
    human_message = captured["input_state"]["messages"][1]
    assert "宝宝昨晚睡得不错" in human_message.content


async def test_sleep_query_includes_overnight_record_that_ends_on_query_date(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    test_user,
    db: AsyncSession,
    monkeypatch,
) -> None:
    db.add(
        SleepRecord(
            baby_id=test_baby.id,
            recorded_by=test_user.id,
            sleep_start=datetime(2026, 5, 3, 14, 0, tzinfo=UTC),
            sleep_end=datetime(2026, 5, 3, 22, 0, tzinfo=UTC),
            sleep_type="night",
            night_wakings=1,
        )
    )
    await db.commit()

    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return TrackerIntent(
            intent="query_sleep",
            confidence=0.96,
            slots=TrackerIntentSlots(query_date="2026-05-04"),
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "查一下今天睡眠"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    response_text = "".join(event.get("content", "") for event in _events(response.text))
    assert "2026-05-04共有 1 条睡眠记录" in response_text
    assert "8.0 小时" in response_text
    assert "夜醒 1 次" in response_text


async def test_chat_bounded_correction_requires_confirmation(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    intents = [
        TrackerIntent(
            intent="record_feeding",
            confidence=0.96,
            slots=TrackerIntentSlots(
                feed_time="2026-05-02T08:30:00+08:00",
                feed_type="formula",
                amount_ml=80,
            ),
        ),
        TrackerIntent(
            intent="update_tracker_record",
            confidence=0.91,
            slots=TrackerIntentSlots(
                tracker_type="feeding",
                latest_in_conversation=True,
                amount_ml=90,
            ),
        ),
    ]

    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return intents.pop(0)

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "刚刚喝了80ml配方奶"},
        headers=auth_headers,
    )
    record = await db.scalar(select(FeedingRecord))
    assert record is not None
    assert record.amount_ml == 80

    correction = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "不对，是90ml"},
        headers=auth_headers,
    )
    assert correction.status_code == 200
    assert any("确认" in event.get("content", "") for event in _events(correction.text))
    await db.refresh(record)
    assert record.amount_ml == 80

    confirm = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "确认"},
        headers=auth_headers,
    )
    assert confirm.status_code == 200
    await db.refresh(record)
    assert record.amount_ml == 90


async def test_friend_write_does_not_create_agent_task(
    client: AsyncClient,
    friend_auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return TrackerIntent(
            intent="record_feeding",
            confidence=0.96,
            slots=TrackerIntentSlots(
                feed_time="2026-05-02T08:30:00+08:00",
                feed_type="formula",
                amount_ml=90,
            ),
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, friend_auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "帮我记录90ml配方奶"},
        headers=friend_auth_headers,
    )

    assert response.status_code == 200
    assert list((await db.execute(select(AgentTask))).scalars()) == []
    assert list((await db.execute(select(FeedingRecord))).scalars()) == []


async def test_expired_task_is_not_confirmed(
    client: AsyncClient,
    auth_headers: dict,
    test_user,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return TrackerIntent(intent="unknown", confidence=0.2)

    class Chunk:
        content = "请重新说明要记录什么"

    class FakeGraph:
        async def astream_events(self, input_state, config, version):
            yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}

    async def fake_get_agent_graph():
        return FakeGraph()

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    monkeypatch.setattr("fawn.api.chat.get_agent_graph", fake_get_agent_graph)
    conversation_id = uuid.UUID(await _create_conversation(client, auth_headers))
    task = AgentTask(
        family_id=test_user.family_id,
        conversation_id=conversation_id,
        task_type="tracker_create",
        status="awaiting_confirmation",
        payload={
            "intent": "record_feeding",
            "slots": {
                "feed_time": "2026-05-02T08:30:00+08:00",
                "feed_type": "formula",
                "amount_ml": 90,
            },
        },
        missing_slots=[],
        risk_level="low",
        initiated_by_user_id=test_user.id,
        last_updated_by_user_id=test_user.id,
        expires_at=datetime.now(UTC) - timedelta(minutes=1),
    )
    db.add(task)
    await db.commit()

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "确认"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    await db.refresh(task)
    assert task.status == "expired"
    assert list((await db.execute(select(FeedingRecord))).scalars()) == []


async def test_baby_profile_high_risk_update_requires_confirmation(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    db: AsyncSession,
    monkeypatch,
) -> None:
    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return TrackerIntent(
            intent="update_baby_profile",
            confidence=0.95,
            slots=TrackerIntentSlots(birth_date="2026-04-08"),
        )

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent", fake_classifier
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "宝宝生日改成2026-04-08"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert any("确认" in event.get("content", "") for event in _events(response.text))
    await db.refresh(test_baby)
    assert test_baby.birth_date != date(2026, 4, 8)

    confirm = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "确认"},
        headers=auth_headers,
    )

    assert confirm.status_code == 200
    await db.refresh(test_baby)
    assert test_baby.birth_date == date(2026, 4, 8)
