from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Conversation, ConversationSummary, Family, Message, User
from fawn.services.auth import hash_password
from fawn.services.family import normalize_family_name

APP_TZ = ZoneInfo("Asia/Shanghai")


def _events(payload: str) -> list[dict]:
    events = []
    for block in payload.strip().split("\n\n"):
        if block.startswith("data: "):
            events.append(json.loads(block.removeprefix("data: ")))
    return events


def _local_dt(year: int, month: int, day: int, hour: int, minute: int = 0) -> datetime:
    return datetime(year, month, day, hour, minute, tzinfo=APP_TZ).astimezone(UTC)


@pytest.fixture
def deterministic_finalization(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_summary(messages: list[Message]) -> tuple[str, list[str]]:
        return ("deterministic summary", ["deterministic"])

    async def fake_profile_items(messages: list[Message]) -> list[str]:
        return []

    monkeypatch.setattr("fawn.services.memory._generate_summary", fake_summary)
    monkeypatch.setattr("fawn.services.memory._extract_profile_items", fake_profile_items)


async def _active_conversation(
    db: AsyncSession,
    user: User,
    *,
    last_message_at: datetime,
) -> Conversation:
    conversation = Conversation(
        family_id=user.family_id,
        user_id=user.id,
        started_at=last_message_at - timedelta(minutes=5),
        is_active=True,
    )
    db.add(conversation)
    await db.flush()
    db.add(
        Message(
            conversation_id=conversation.id,
            sender_user_id=user.id,
            role="user",
            content="previous message",
            message_type="text",
            created_at=last_message_at,
        )
    )
    await db.commit()
    await db.refresh(conversation)
    return conversation


async def _other_family_user(db: AsyncSession) -> User:
    family = Family(
        name="Other Lifecycle Family",
        name_key=normalize_family_name("Other Lifecycle Family"),
    )
    user = User(
        family=family,
        username="other-lifecycle",
        display_name="Other Lifecycle Parent",
        access_type="parent",
        role="妈妈",
        password_hash=hash_password("secret123"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    db.add_all([family, user])
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_timeout_stale_send_emits_session_expired_without_persisting_attempt(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    deterministic_finalization: None,
) -> None:
    now = _local_dt(2026, 5, 21, 12)
    monkeypatch.setattr("fawn.services.memory._utc_now", lambda: now)
    conversation = await _active_conversation(
        db,
        test_user,
        last_message_at=now - timedelta(minutes=31),
    )

    response = await client.post(
        f"/api/chat/conversations/{conversation.id}/messages",
        json={"content": "late attempt"},
        headers=auth_headers,
    )

    assert response.status_code == 200
    assert _events(response.text) == [
        {
            "type": "session_expired",
            "expired_conversation_id": str(conversation.id),
        }
    ]
    await db.refresh(conversation)
    assert conversation.is_active is False
    assert conversation.ended_at.replace(tzinfo=UTC) == now
    summary = await db.scalar(
        select(ConversationSummary).where(
            ConversationSummary.conversation_id == conversation.id
        )
    )
    assert summary is not None
    assert summary.summary == "deterministic summary"
    active = await db.scalar(
        select(Conversation).where(
            Conversation.family_id == test_user.family_id,
            Conversation.is_active.is_(True),
        )
    )
    assert active is not None
    assert active.id != conversation.id
    attempted_count = await db.scalar(
        select(func.count())
        .select_from(Message)
        .where(
            Message.conversation_id == conversation.id,
            Message.content == "late attempt",
        )
    )
    assert attempted_count == 0


@pytest.mark.asyncio
async def test_cross_day_rollover_precedes_timeout(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    deterministic_finalization: None,
) -> None:
    now = _local_dt(2026, 5, 22, 0, 5)
    monkeypatch.setattr("fawn.services.memory._utc_now", lambda: now)
    conversation = await _active_conversation(
        db,
        test_user,
        last_message_at=_local_dt(2026, 5, 21, 23, 50),
    )

    response = await client.post("/api/chat/conversations", headers=auth_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["id"] != str(conversation.id)
    await db.refresh(conversation)
    assert conversation.is_active is False
    summary = await db.scalar(
        select(ConversationSummary).where(
            ConversationSummary.conversation_id == conversation.id
        )
    )
    assert summary is not None


@pytest.mark.asyncio
async def test_same_day_recent_activity_reuses_current_conversation(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    deterministic_finalization: None,
) -> None:
    now = _local_dt(2026, 5, 22, 12)
    monkeypatch.setattr("fawn.services.memory._utc_now", lambda: now)
    conversation = await _active_conversation(
        db,
        test_user,
        last_message_at=now - timedelta(minutes=10),
    )

    response = await client.post("/api/chat/conversations", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] == str(conversation.id)
    await db.refresh(conversation)
    assert conversation.is_active is True
    summary_count = await db.scalar(select(func.count()).select_from(ConversationSummary))
    assert summary_count == 0


@pytest.mark.asyncio
async def test_rollover_keeps_other_family_active_conversation_unchanged(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
    deterministic_finalization: None,
) -> None:
    now = _local_dt(2026, 5, 21, 12)
    monkeypatch.setattr("fawn.services.memory._utc_now", lambda: now)
    own = await _active_conversation(
        db,
        test_user,
        last_message_at=now - timedelta(minutes=31),
    )
    other_user = await _other_family_user(db)
    other = await _active_conversation(
        db,
        other_user,
        last_message_at=now - timedelta(minutes=31),
    )

    response = await client.post("/api/chat/conversations", headers=auth_headers)

    assert response.status_code == 200
    assert response.json()["id"] != str(own.id)
    await db.refresh(own)
    await db.refresh(other)
    assert own.is_active is False
    assert other.is_active is True
