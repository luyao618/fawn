from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Conversation, Message, User


async def _create_conversation_with_messages(
    db: AsyncSession,
    test_user: User,
    count: int,
    *,
    base_time: datetime | None = None,
    step_seconds: int = 60,
) -> Conversation:
    conv = Conversation(family_id=test_user.family_id, user_id=test_user.id)
    db.add(conv)
    await db.flush()
    base = base_time or datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
    for i in range(count):
        ts = base + timedelta(seconds=i * step_seconds)
        msg = Message(
            conversation_id=conv.id,
            sender_user_id=test_user.id if i % 2 == 0 else None,
            role="user" if i % 2 == 0 else "assistant",
            content=f"message {i}",
            message_type="text",
            created_at=ts,
        )
        db.add(msg)
    await db.commit()
    await db.refresh(conv)
    return conv


@pytest.mark.asyncio
async def test_default_no_params_returns_latest_50(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = await _create_conversation_with_messages(db, test_user, 75)
    response = await client.get(
        f"/api/chat/conversations/{conv.id}", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["messages"]) == 50
    assert body["has_more"] is True
    assert body["next_before"] is not None
    # asc order: first returned is older than last returned
    first_ts = body["messages"][0]["created_at"]
    last_ts = body["messages"][-1]["created_at"]
    assert first_ts < last_ts
    # latest 50 of 75 => content[-1] is "message 74"
    assert body["messages"][-1]["content"] == "message 74"
    assert body["messages"][0]["content"] == "message 25"


@pytest.mark.asyncio
async def test_default_with_300_messages_has_more_true(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = await _create_conversation_with_messages(db, test_user, 300)
    response = await client.get(
        f"/api/chat/conversations/{conv.id}", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["messages"]) == 50
    assert body["has_more"] is True
    assert body["next_before"] == body["messages"][0]["id"]


@pytest.mark.asyncio
async def test_before_earliest_returns_empty_has_more_false(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = await _create_conversation_with_messages(db, test_user, 10)
    full = await client.get(
        f"/api/chat/conversations/{conv.id}", headers=auth_headers
    )
    earliest_id = full.json()["messages"][0]["id"]
    response = await client.get(
        f"/api/chat/conversations/{conv.id}",
        params={"before": earliest_id},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["messages"] == []
    assert body["has_more"] is False
    assert body["next_before"] is None


@pytest.mark.asyncio
async def test_limit_10_returns_10(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = await _create_conversation_with_messages(db, test_user, 30)
    response = await client.get(
        f"/api/chat/conversations/{conv.id}",
        params={"limit": 10},
        headers=auth_headers,
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["messages"]) == 10
    assert body["has_more"] is True


@pytest.mark.asyncio
async def test_limit_200_returns_422(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = await _create_conversation_with_messages(db, test_user, 5)
    response = await client.get(
        f"/api/chat/conversations/{conv.id}",
        params={"limit": 200},
        headers=auth_headers,
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_before_nonexistent_returns_400(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = await _create_conversation_with_messages(db, test_user, 5)
    response = await client.get(
        f"/api/chat/conversations/{conv.id}",
        params={"before": str(uuid.uuid4())},
        headers=auth_headers,
    )
    assert response.status_code == 400
    assert "cursor message" in response.json()["detail"]


@pytest.mark.asyncio
async def test_tie_breaker_same_created_at(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = Conversation(family_id=test_user.family_id, user_id=test_user.id)
    db.add(conv)
    await db.flush()
    same_ts = datetime(2026, 5, 1, 12, 0, 0, tzinfo=timezone.utc)
    # Create 6 messages: 3 share same_ts (in middle), others spread out.
    timestamps = [
        same_ts - timedelta(seconds=120),
        same_ts - timedelta(seconds=60),
        same_ts,
        same_ts,
        same_ts,
        same_ts + timedelta(seconds=60),
    ]
    ids = []
    for i, ts in enumerate(timestamps):
        msg = Message(
            conversation_id=conv.id,
            sender_user_id=test_user.id,
            role="user",
            content=f"tie{i}",
            message_type="text",
            created_at=ts,
        )
        db.add(msg)
        await db.flush()
        ids.append(str(msg.id))
    await db.commit()

    # Page 1: limit=3 -> get latest 3 (indices 5,4,3 in time order: 5 is newest)
    page1 = await client.get(
        f"/api/chat/conversations/{conv.id}",
        params={"limit": 3},
        headers=auth_headers,
    )
    assert page1.status_code == 200
    p1 = page1.json()
    assert len(p1["messages"]) == 3
    assert p1["has_more"] is True

    # Page 2: page1 returned messages in asc order, earliest = p1["messages"][0]
    cursor = p1["next_before"]
    page2 = await client.get(
        f"/api/chat/conversations/{conv.id}",
        params={"before": cursor, "limit": 3},
        headers=auth_headers,
    )
    assert page2.status_code == 200
    p2 = page2.json()
    assert len(p2["messages"]) == 3
    assert p2["has_more"] is False

    # No duplicates between pages, no missing
    page1_ids = {m["id"] for m in p1["messages"]}
    page2_ids = {m["id"] for m in p2["messages"]}
    assert page1_ids.isdisjoint(page2_ids)
    assert page1_ids | page2_ids == set(ids)


@pytest.mark.asyncio
async def test_first_page_size_bounded(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conv = await _create_conversation_with_messages(db, test_user, 500)
    response = await client.get(
        f"/api/chat/conversations/{conv.id}", headers=auth_headers
    )
    assert response.status_code == 200
    body = response.json()
    assert len(body["messages"]) == 50
    assert len(json.dumps(body)) < 200 * 1024
