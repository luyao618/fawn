from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.config import get_settings
from fawn.models import Conversation, Family, Message, User
from fawn.services.auth import hash_password
from fawn.services.family import normalize_family_name
from fawn.services.voice_tts import DoubaoTTSError, DoubaoTTSResult


async def _create_message(
    db: AsyncSession,
    user: User,
    *,
    role: str = "assistant",
    content: str = "**你好**，我是管家",
    message_type: str = "text",
    created_at: datetime | None = None,
) -> tuple[Conversation, Message]:
    conversation = Conversation(family_id=user.family_id, user_id=user.id)
    db.add(conversation)
    await db.flush()
    message = Message(
        conversation_id=conversation.id,
        sender_user_id=user.id if role == "user" else None,
        role=role,
        content=content,
        message_type=message_type,
        created_at=created_at or datetime.now(UTC),
    )
    db.add(message)
    await db.commit()
    await db.refresh(conversation)
    await db.refresh(message)
    return conversation, message


def _enable_tts(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DOUBAO_API_KEY", "test-key")
    get_settings.cache_clear()


class FakeTTSService:
    calls: list[dict[str, Any]] = []

    def __init__(self, **kwargs: Any) -> None:
        self.kwargs = kwargs

    async def synthesize(self, text: str, *, uid: str = "fawn-mobile") -> DoubaoTTSResult:
        self.calls.append({"kwargs": self.kwargs, "text": text, "uid": uid})
        return DoubaoTTSResult(audio=b"fake-mp3", media_type="audio/mpeg")


async def test_get_message_tts_success(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_tts(monkeypatch)
    FakeTTSService.calls.clear()
    monkeypatch.setattr("fawn.api.chat.DoubaoTTSService", FakeTTSService)
    _, message = await _create_message(db, test_user)

    try:
        response = await client.get(f"/api/chat/messages/{message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 200
    assert response.content == b"fake-mp3"
    assert response.headers["content-type"] == "audio/mpeg"
    assert FakeTTSService.calls == [
        {
            "kwargs": {
                "api_key": "test-key",
                "timeout_s": 30.0,
                "resource_id": "seed-tts-2.0",
                "speaker": "zh_female_vv_uranus_bigtts",
                "audio_format": "mp3",
                "sample_rate": 24000,
            },
            "text": "你好，我是管家",
            "uid": str(test_user.id),
        }
    ]


async def test_get_message_tts_missing_api_key_returns_503(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DOUBAO_API_KEY", raising=False)
    get_settings.cache_clear()
    _, message = await _create_message(db, test_user)

    try:
        response = await client.get(f"/api/chat/messages/{message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 503
    assert "未配置" in response.json()["detail"]


async def test_get_message_tts_other_family_returns_404(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_tts(monkeypatch)
    other_family = Family(
        id=uuid.uuid4(),
        name="Other Family",
        name_key=normalize_family_name("Other Family"),
    )
    other_user = User(
        id=uuid.uuid4(),
        family=other_family,
        username="other-tts-parent",
        display_name="Other Parent",
        access_type="parent",
        role="妈妈",
        password_hash=hash_password("secret123"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    db.add_all([other_family, other_user])
    await db.flush()
    _, message = await _create_message(db, other_user)

    try:
        response = await client.get(f"/api/chat/messages/{message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 404


async def test_get_message_tts_user_message_returns_409(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_tts(monkeypatch)
    _, message = await _create_message(db, test_user, role="user")

    try:
        response = await client.get(f"/api/chat/messages/{message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 409
    assert "管家回复" in response.json()["detail"]


async def test_get_message_tts_unsupported_message_type_returns_409(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_tts(monkeypatch)
    _, message = await _create_message(db, test_user, message_type="image")

    try:
        response = await client.get(f"/api/chat/messages/{message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 409
    assert "消息类型" in response.json()["detail"]


async def test_get_message_tts_older_assistant_message_returns_409(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_tts(monkeypatch)
    conversation, old_message = await _create_message(
        db,
        test_user,
        created_at=datetime(2026, 1, 1, tzinfo=UTC),
    )
    db.add(
        Message(
            conversation_id=conversation.id,
            role="assistant",
            content="新的回复",
            message_type="text",
            created_at=datetime(2026, 1, 1, tzinfo=UTC) + timedelta(seconds=1),
        )
    )
    await db.commit()

    try:
        response = await client.get(f"/api/chat/messages/{old_message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 409
    assert "最新" in response.json()["detail"]


async def test_get_message_tts_empty_normalized_text_returns_409(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_tts(monkeypatch)
    _, message = await _create_message(db, test_user, content="***")

    try:
        response = await client.get(f"/api/chat/messages/{message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 409
    assert "没有可播放" in response.json()["detail"]


async def test_get_message_tts_service_error_returns_502(
    client: AsyncClient,
    db: AsyncSession,
    auth_headers: dict[str, str],
    test_user: User,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _enable_tts(monkeypatch)

    class ErrorTTSService(FakeTTSService):
        async def synthesize(self, text: str, *, uid: str = "fawn-mobile") -> DoubaoTTSResult:
            raise DoubaoTTSError("语音服务繁忙，请稍后再试")

    monkeypatch.setattr("fawn.api.chat.DoubaoTTSService", ErrorTTSService)
    _, message = await _create_message(db, test_user)

    try:
        response = await client.get(f"/api/chat/messages/{message.id}/tts", headers=auth_headers)
    finally:
        get_settings.cache_clear()

    assert response.status_code == 502
    assert "繁忙" in response.json()["detail"]
