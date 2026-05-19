"""Tests for ``POST /api/chat/voice/transcribe`` and DoubaoASRService.

External Doubao calls are stubbed via ``httpx.MockTransport`` injected into the
service's optional ``client`` parameter — matches the injectable-client
pattern in ``services/push.py``. No new dev dependency (no respx /
pytest-httpx).
"""

from __future__ import annotations

import io
from typing import Any, Callable

import httpx
import pytest
from httpx import AsyncClient

from fawn.config import get_settings
from fawn.services.voice_asr import (
    DOUBAO_BASE,
    DoubaoASRError,
    DoubaoASRService,
)


# ---------------------------------------------------------------------------
# MockTransport handler builder.
# ---------------------------------------------------------------------------


def make_handler(
    *,
    submit_status: str = "20000000",
    submit_message: str | None = None,
    query_sequence: list[tuple[str, dict | None, str | None]] | None = None,
    raise_on_submit: Exception | None = None,
    raise_on_query: Exception | None = None,
) -> tuple[Callable[[httpx.Request], httpx.Response], dict[str, Any]]:
    """Build a MockTransport handler and a counter dict.

    ``query_sequence`` entries are ``(status, body, message)`` tuples consumed in
    order; the last entry is reused if queries outrun the list.
    """
    state: dict[str, Any] = {
        "submit_calls": 0,
        "query_calls": 0,
        "submit_request_id": None,
        "query_request_ids": [],
    }
    seq = list(query_sequence or [("20000000", {"result": {"text": "你好"}}, None)])

    def handler(request: httpx.Request) -> httpx.Response:
        rid = request.headers.get("X-Api-Request-Id")
        if request.url.path.endswith("/submit"):
            state["submit_calls"] += 1
            state["submit_request_id"] = rid
            if raise_on_submit is not None:
                raise raise_on_submit
            headers = [(b"X-Api-Status-Code", submit_status.encode())]
            if submit_message:
                headers.append((b"X-Api-Message", submit_message.encode("utf-8")))
            return httpx.Response(200, headers=headers, json={})
        if request.url.path.endswith("/query"):
            state["query_calls"] += 1
            state["query_request_ids"].append(rid)
            if raise_on_query is not None:
                raise raise_on_query
            idx = min(state["query_calls"] - 1, len(seq) - 1)
            status, body, message = seq[idx]
            headers = [(b"X-Api-Status-Code", status.encode())]
            if message:
                headers.append((b"X-Api-Message", message.encode("utf-8")))
            return httpx.Response(200, headers=headers, json=body or {})
        return httpx.Response(404)

    return handler, state


def make_service_with(handler) -> tuple[DoubaoASRService, AsyncClient]:
    transport = httpx.MockTransport(handler)
    client = AsyncClient(transport=transport, base_url=DOUBAO_BASE)
    service = DoubaoASRService(
        api_key="test-key",
        client=client,
        timeout_s=0.5,
        poll_interval_s=0.01,
    )
    return service, client


# ---------------------------------------------------------------------------
# Service-level unit tests (cases 1-5, 9, 10, 11).
# ---------------------------------------------------------------------------


async def test_happy_path() -> None:
    """Case 1: submit OK → query returns text → text returned."""
    handler, state = make_handler(
        query_sequence=[("20000000", {"result": {"text": "今天天气真好"}}, None)]
    )
    service, client = make_service_with(handler)
    try:
        text = await service.transcribe(b"fake-wav-bytes")
    finally:
        await client.aclose()
    assert text == "今天天气真好"
    assert state["submit_calls"] == 1
    assert state["query_calls"] == 1


async def test_submit_non_ok() -> None:
    """Case 2: submit returns non-OK → DoubaoASRError with vendor message."""
    handler, _ = make_handler(submit_status="45000001", submit_message="参数错误")
    service, client = make_service_with(handler)
    try:
        with pytest.raises(DoubaoASRError, match="参数错误"):
            await service.transcribe(b"x")
    finally:
        await client.aclose()


async def test_query_timeout() -> None:
    """Case 3: query never returns text within budget → 超时."""
    # In-progress status forever; outer asyncio.timeout fires.
    handler, _ = make_handler(query_sequence=[("20000001", None, None)])
    service, client = make_service_with(handler)
    try:
        with pytest.raises(DoubaoASRError, match="超时"):
            await service.transcribe(b"x")
    finally:
        await client.aclose()


async def test_query_transient_then_ok() -> None:
    """Case 4: first 2 queries 'in-progress', 3rd returns text."""
    handler, state = make_handler(
        query_sequence=[
            ("20000001", None, None),
            ("20000002", None, None),
            ("20000000", {"result": {"text": "三次重试"}}, None),
        ]
    )
    service, client = make_service_with(handler)
    try:
        text = await service.transcribe(b"x")
    finally:
        await client.aclose()
    assert text == "三次重试"
    assert state["query_calls"] == 3


async def test_empty_text() -> None:
    """Case 5: query returns empty result.text → returns empty string."""
    handler, _ = make_handler(
        query_sequence=[("20000000", {"result": {"text": ""}}, None)]
    )
    service, client = make_service_with(handler)
    try:
        text = await service.transcribe(b"x")
    finally:
        await client.aclose()
    assert text == ""


async def test_same_request_id_for_submit_and_query() -> None:
    """Case 9: submit and query must share the same X-Api-Request-Id."""
    handler, state = make_handler(
        query_sequence=[
            ("20000001", None, None),
            ("20000000", {"result": {"text": "ok"}}, None),
        ]
    )
    service, client = make_service_with(handler)
    try:
        await service.transcribe(b"x")
    finally:
        await client.aclose()
    submit_rid = state["submit_request_id"]
    assert submit_rid is not None
    assert all(qid == submit_rid for qid in state["query_request_ids"])


async def test_network_error_to_chinese_message() -> None:
    """Case 10: httpx.ConnectError → DoubaoASRError with Chinese text."""
    handler, _ = make_handler(raise_on_submit=httpx.ConnectError("dns down"))
    service, client = make_service_with(handler)
    try:
        with pytest.raises(DoubaoASRError, match="网络异常"):
            await service.transcribe(b"x")
    finally:
        await client.aclose()


async def test_query_terminal_error_short_circuits() -> None:
    """Case 11: first query returns a terminal error code → ≤2 query calls,
    DoubaoASRError carries vendor X-Api-Message (does NOT spin until timeout).
    """
    handler, state = make_handler(
        query_sequence=[("45000001", None, "音频解码失败")]
    )
    # Generous timeout to prove the short-circuit, not the timeout, ends it.
    transport = httpx.MockTransport(handler)
    client = AsyncClient(transport=transport, base_url=DOUBAO_BASE)
    service = DoubaoASRService(
        api_key="test-key",
        client=client,
        timeout_s=10.0,
        poll_interval_s=0.01,
    )
    try:
        with pytest.raises(DoubaoASRError, match="音频解码失败"):
            await service.transcribe(b"x")
    finally:
        await client.aclose()
    assert state["query_calls"] <= 2


# ---------------------------------------------------------------------------
# Endpoint integration tests (cases 6, 7, 8).
# ---------------------------------------------------------------------------


def _audio_bytes(n_bytes: int) -> bytes:
    """Opaque blob of the given size; content does not matter for endpoint tests."""
    return b"R" * n_bytes


async def test_unauthorized(client: AsyncClient) -> None:
    """Case 6: missing auth → 401."""
    response = await client.post(
        "/api/chat/voice/transcribe",
        files={"file": ("a.wav", io.BytesIO(_audio_bytes(1024)), "audio/wav")},
    )
    assert response.status_code == 401


async def test_missing_api_key(
    client: AsyncClient,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Case 7: settings.doubao_api_key=None → 503 with Chinese detail."""
    monkeypatch.delenv("DOUBAO_API_KEY", raising=False)
    get_settings.cache_clear()
    try:
        response = await client.post(
            "/api/chat/voice/transcribe",
            files={"file": ("a.wav", io.BytesIO(_audio_bytes(1024)), "audio/wav")},
            headers=auth_headers,
        )
    finally:
        get_settings.cache_clear()
    assert response.status_code == 503
    assert "未配置" in response.json()["detail"]


async def test_file_too_large(
    client: AsyncClient,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Case 8: >2MB payload → 413; ASR must NOT be called."""
    monkeypatch.setenv("DOUBAO_API_KEY", "test-key")
    get_settings.cache_clear()

    asr_invocations = {"count": 0}

    class _FakeService:
        def __init__(self, *, api_key: str) -> None:
            self._api_key = api_key

        async def transcribe(self, audio_bytes: bytes) -> str:
            asr_invocations["count"] += 1
            return ""

    monkeypatch.setattr("fawn.api.chat.DoubaoASRService", _FakeService)
    try:
        response = await client.post(
            "/api/chat/voice/transcribe",
            files={
                "file": ("big.wav", io.BytesIO(_audio_bytes(3 * 1024 * 1024)), "audio/wav")
            },
            headers=auth_headers,
        )
    finally:
        get_settings.cache_clear()
    assert response.status_code == 413
    assert "过大" in response.json()["detail"]
    assert asr_invocations["count"] == 0
