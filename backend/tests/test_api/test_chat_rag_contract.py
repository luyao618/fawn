from __future__ import annotations

import json

from httpx import AsyncClient

from fawn.agent.intent import TrackerIntent


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


class Chunk:
    def __init__(self, content: str) -> None:
        self.content = content


async def _install_fake_rag_graph(monkeypatch, *, tool_output: dict, response_text: str) -> None:
    async def fake_classifier(*args, **kwargs) -> TrackerIntent:
        return TrackerIntent(intent="unknown", confidence=0.2)

    class FakeGraph:
        async def astream_events(self, input_state, config, version):
            yield {
                "event": "on_tool_end",
                "name": "search_knowledge",
                "data": {"output": tool_output},
            }
            yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk(response_text)}}

    async def fake_get_agent_graph():
        return FakeGraph()

    monkeypatch.setattr(
        "fawn.agent.tracker_orchestrator.classify_tracker_intent",
        fake_classifier,
    )
    monkeypatch.setattr("fawn.api.chat.get_agent_graph", fake_get_agent_graph)
    monkeypatch.setattr("fawn.api.chat.schedule_post_turn_memory_hook", lambda *args, **kwargs: None)


async def test_chat_api_rag_hit_appends_missing_source(
    client: AsyncClient,
    auth_headers: dict,
    test_baby,
    monkeypatch,
) -> None:
    await _install_fake_rag_graph(
        monkeypatch,
        tool_output={
            "results": [
                {
                    "document_title": "Baby Care",
                    "chapter_title": "Feeding",
                    "content": "Feed responsively.",
                    "similarity": 0.9,
                }
            ],
            "low_confidence": False,
        },
        response_text="可以按需喂养。",
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "宝宝多久喂一次奶？"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    response_text = "".join(event.get("content", "") for event in _events(response.text))
    assert "来源：Baby Care（Feeding）" in response_text


async def test_chat_api_non_medical_miss_appends_no_source_disclosure(
    client: AsyncClient,
    auth_headers: dict,
    test_baby,
    monkeypatch,
) -> None:
    await _install_fake_rag_graph(
        monkeypatch,
        tool_output={"results": [], "low_confidence": True},
        response_text="可以根据宝宝状态调整。",
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "宝宝喜欢什么睡前仪式？"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    response_text = "".join(event.get("content", "") for event in _events(response.text))
    assert "未检索到权威来源" in response_text
    assert "一般性建议" in response_text


async def test_chat_api_medical_miss_appends_conservative_caution(
    client: AsyncClient,
    auth_headers: dict,
    test_baby,
    monkeypatch,
) -> None:
    await _install_fake_rag_graph(
        monkeypatch,
        tool_output={"results": [], "low_confidence": True},
        response_text="可以先观察。",
    )
    conversation_id = await _create_conversation(client, auth_headers)

    response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "宝宝发烧怎么办？"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    response_text = "".join(event.get("content", "") for event in _events(response.text))
    assert "未检索到权威来源" in response_text
    assert "以医生意见为准" in response_text
    assert "咨询医生或就医" in response_text
