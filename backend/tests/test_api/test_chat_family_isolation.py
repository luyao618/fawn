from __future__ import annotations

import json
import uuid

from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Conversation, Family, Message, User
from fawn.services.auth import hash_password
from fawn.services.family import normalize_family_name


def _events(payload: str) -> list[dict]:
    events = []
    for block in payload.strip().split("\n\n"):
        if block.startswith("data: "):
            events.append(json.loads(block.removeprefix("data: ")))
    return events


async def test_chat_conversations_are_scoped_to_authenticated_family(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    other_family = Family(
        id=uuid.uuid4(),
        name="Other Family",
        name_key=normalize_family_name("Other Family"),
    )
    other_user = User(
        id=uuid.uuid4(),
        family=other_family,
        username="other-parent",
        display_name="Other Parent",
        access_type="parent",
        role="妈妈",
        password_hash=hash_password("secret123"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    own_conversation = Conversation(family_id=test_user.family_id, user_id=test_user.id)
    other_conversation = Conversation(family_id=other_family.id, user_id=other_user.id)
    db.add_all([other_family, other_user, own_conversation, other_conversation])
    await db.flush()
    db.add(
        Message(
            conversation_id=other_conversation.id,
            role="assistant",
            content="Other family message",
            message_type="text",
        )
    )
    await db.commit()

    list_response = await client.get("/api/chat/conversations", headers=auth_headers)
    get_other_response = await client.get(
        f"/api/chat/conversations/{other_conversation.id}",
        headers=auth_headers,
    )
    send_other_response = await client.post(
        f"/api/chat/conversations/{other_conversation.id}/messages",
        json={"content": "hello"},
        headers=auth_headers,
    )

    assert list_response.status_code == 200
    ids = [item["id"] for item in list_response.json()["items"]]
    assert str(own_conversation.id) in ids
    assert str(other_conversation.id) not in ids
    assert get_other_response.status_code == 404
    assert send_other_response.status_code == 404


async def test_registered_family_can_start_chat_without_baby(
    client: AsyncClient,
    db: AsyncSession,
    monkeypatch,
) -> None:
    class Chunk:
        content = "你好，我在。"

    class FakeGraph:
        async def astream_events(self, input_state, config, version):
            yield {"event": "on_chat_model_stream", "data": {"chunk": Chunk()}}

    async def no_tracker_route(*args, **kwargs):
        return None

    async def fake_get_agent_graph():
        return FakeGraph()

    monkeypatch.setattr("fawn.api.chat.route_tracker_message", no_tracker_route)
    monkeypatch.setattr("fawn.api.chat.get_agent_graph", fake_get_agent_graph)
    monkeypatch.setattr("fawn.api.chat.schedule_post_turn_memory_hook", lambda **kwargs: None)

    register_response = await client.post(
        "/api/auth/register",
        json={
            "invite_code": "2026",
            "family_name": "管家空家庭",
            "username": "chatparent",
            "password": "secret123",
            "display_name": "新妈妈",
            "role": "妈妈",
        },
    )
    login_response = await client.post(
        "/api/auth/login",
        json={"username": "chatparent", "password": "secret123"},
    )
    headers = {"Authorization": f"Bearer {login_response.json()['access_token']}"}

    baby_response = await client.get("/api/baby", headers=headers)
    conversation_response = await client.post("/api/chat/conversations", headers=headers)
    conversation_id = conversation_response.json()["id"]
    message_response = await client.post(
        f"/api/chat/conversations/{conversation_id}/messages",
        json={"content": "你好"},
        headers=headers,
    )

    assert register_response.status_code == 201
    assert login_response.status_code == 200
    assert baby_response.status_code == 200
    assert baby_response.json() is None
    assert conversation_response.status_code == 200
    assert message_response.status_code == 200
    events = _events(message_response.text)
    assert any(event["type"] == "token" and "你好" in event["content"] for event in events)
    assert any(event["type"] == "done" for event in events)

    messages = list(
        (
            await db.execute(
                select(Message).where(Message.conversation_id == uuid.UUID(conversation_id))
            )
        ).scalars()
    )
    assert [message.role for message in messages] == ["user", "assistant"]
