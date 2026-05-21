from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Conversation, Family, Message, User
from fawn.services.auth import hash_password
from fawn.services.family import normalize_family_name

APP_TZ = ZoneInfo("Asia/Shanghai")


def _local_dt(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=APP_TZ).astimezone(UTC)


async def _other_family_user(db: AsyncSession) -> User:
    family = Family(
        id=uuid.uuid4(),
        name="Other History Family",
        name_key=normalize_family_name("Other History Family"),
    )
    user = User(
        id=uuid.uuid4(),
        family=family,
        username=f"other-history-{uuid.uuid4().hex[:8]}",
        display_name="Other History Parent",
        access_type="parent",
        role="妈妈",
        password_hash=hash_password("secret123"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    db.add_all([family, user])
    await db.flush()
    return user


async def _conversation(db: AsyncSession, user: User, *, started_at: datetime | None = None):
    conversation = Conversation(
        family_id=user.family_id,
        user_id=user.id,
        started_at=started_at or _local_dt(2026, 5, 1, 8),
    )
    db.add(conversation)
    await db.flush()
    return conversation


async def _message(
    db: AsyncSession,
    conversation: Conversation,
    user: User,
    *,
    content: str,
    created_at: datetime,
    role: str = "user",
) -> Message:
    message = Message(
        conversation_id=conversation.id,
        sender_user_id=user.id if role == "user" else None,
        role=role,
        content=content,
        message_type="text",
        created_at=created_at,
    )
    db.add(message)
    await db.flush()
    return message


@pytest.mark.asyncio
async def test_month_activity_groups_by_asia_shanghai_date_and_family(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    own = await _conversation(db, test_user)
    other_user = await _other_family_user(db)
    other = await _conversation(db, other_user)
    await _message(
        db,
        own,
        test_user,
        content="late may first",
        created_at=_local_dt(2026, 5, 1, 23, 30),
    )
    await _message(
        db,
        own,
        test_user,
        content="early may second same utc day",
        created_at=_local_dt(2026, 5, 2, 0, 30),
    )
    await _message(
        db,
        other,
        other_user,
        content="other family ignored",
        created_at=_local_dt(2026, 5, 2, 8),
    )
    await db.commit()

    response = await client.get(
        "/api/chat/history/activity",
        params={"year": 2026, "month": 5},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert response.json() == {
        "year": 2026,
        "month": 5,
        "days": [
            {"date": "2026-05-01", "day": 1, "message_count": 1},
            {"date": "2026-05-02", "day": 2, "message_count": 1},
        ],
    }


@pytest.mark.asyncio
async def test_day_target_returns_earliest_family_message_or_null(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    own = await _conversation(db, test_user, started_at=_local_dt(2026, 5, 21, 7))
    other_user = await _other_family_user(db)
    other = await _conversation(db, other_user, started_at=_local_dt(2026, 5, 21, 6))
    ignored = await _message(
        db,
        other,
        other_user,
        content="other family earlier",
        created_at=_local_dt(2026, 5, 21, 7),
    )
    assert ignored is not None
    earliest = await _message(
        db,
        own,
        test_user,
        content="own earliest",
        created_at=_local_dt(2026, 5, 21, 8),
    )
    await _message(
        db,
        own,
        test_user,
        content="own later",
        created_at=_local_dt(2026, 5, 21, 9),
    )
    await db.commit()

    response = await client.get(
        "/api/chat/history/day-target",
        params={"date": "2026-05-21"},
        headers=auth_headers,
    )
    empty_response = await client.get(
        "/api/chat/history/day-target",
        params={"date": "2026-05-22"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    target = response.json()["target"]
    assert target["message_id"] == str(earliest.id)
    assert target["conversation_id"] == str(own.id)
    assert target["content"] == "own earliest"
    assert "conversation_started_at" in target
    assert empty_response.status_code == 200
    assert empty_response.json() == {"date": "2026-05-22", "target": None}


@pytest.mark.asyncio
async def test_message_search_is_family_scoped_and_stably_paginated(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    own = await _conversation(db, test_user)
    other_user = await _other_family_user(db)
    other = await _conversation(db, other_user)
    older = await _message(
        db,
        own,
        test_user,
        content="banana breakfast",
        created_at=_local_dt(2026, 5, 1, 8),
    )
    newer = await _message(
        db,
        own,
        test_user,
        content="banana dinner",
        created_at=_local_dt(2026, 5, 1, 18),
    )
    await _message(
        db,
        other,
        other_user,
        content="banana should be private",
        created_at=_local_dt(2026, 5, 1, 19),
    )
    await db.commit()

    page1 = await client.get(
        "/api/chat/messages/search",
        params={"q": "banana", "page_size": 1},
        headers=auth_headers,
    )
    empty_query = await client.get(
        "/api/chat/messages/search",
        params={"q": ""},
        headers=auth_headers,
    )

    assert page1.status_code == 200
    body = page1.json()
    assert body["total"] == 2
    assert [item["id"] for item in body["items"]] == [str(newer.id)]
    assert body["items"][0]["conversation_id"] == str(own.id)
    assert body["items"][0]["conversation_started_at"] is not None
    assert str(older.id) not in [item["id"] for item in body["items"]]
    assert empty_query.status_code == 422


@pytest.mark.asyncio
async def test_target_message_window_returns_bounded_ascending_slice(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
) -> None:
    conversation = await _conversation(db, test_user)
    messages: list[Message] = []
    start = _local_dt(2026, 5, 1, 8)
    for index in range(61):
        messages.append(
            await _message(
                db,
                conversation,
                test_user,
                content=f"window message {index}",
                created_at=start + timedelta(minutes=index),
            )
        )
    other_conversation = await _conversation(db, test_user)
    other_message = await _message(
        db,
        other_conversation,
        test_user,
        content="other conversation target",
        created_at=start,
    )
    await db.commit()
    target = messages[30]

    response = await client.get(
        f"/api/chat/conversations/{conversation.id}",
        params={"target_message_id": str(target.id), "around_limit": 2},
        headers=auth_headers,
    )
    other_target_response = await client.get(
        f"/api/chat/conversations/{conversation.id}",
        params={"target_message_id": str(other_message.id), "around_limit": 2},
        headers=auth_headers,
    )
    invalid_limit_response = await client.get(
        f"/api/chat/conversations/{conversation.id}",
        params={"target_message_id": str(target.id), "around_limit": 99},
        headers=auth_headers,
    )

    assert response.status_code == 200
    body = response.json()
    assert [item["content"] for item in body["messages"]] == [
        "window message 28",
        "window message 29",
        "window message 30",
        "window message 31",
        "window message 32",
    ]
    assert body["target"] == {
        "target_message_id": str(target.id),
        "target_index": 2,
        "around_limit": 2,
    }
    assert [item["created_at"] for item in body["messages"]] == sorted(
        item["created_at"] for item in body["messages"]
    )
    assert other_target_response.status_code == 400
    assert invalid_limit_response.status_code == 422
