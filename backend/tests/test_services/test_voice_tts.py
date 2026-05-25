from __future__ import annotations

import asyncio
import base64
import json
from typing import Any, Callable

import httpx
import pytest
from httpx import AsyncClient

from fawn.services.voice_tts import (
    DOUBAO_TTS_URL,
    DoubaoTTSError,
    DoubaoTTSService,
    normalize_tts_text,
)


def _json_stream(*payloads: dict[str, Any]) -> bytes:
    return "".join(json.dumps(payload, ensure_ascii=False) for payload in payloads).encode()


def _audio_payload(content: bytes) -> dict[str, Any]:
    return {
        "code": 0,
        "message": "",
        "data": base64.b64encode(content).decode("ascii"),
    }


def _service_with(
    handler: Callable[[httpx.Request], httpx.Response],
    *,
    timeout_s: float = 1.0,
) -> tuple[DoubaoTTSService, AsyncClient]:
    client = AsyncClient(transport=httpx.MockTransport(handler))
    service = DoubaoTTSService(api_key="test-key", client=client, timeout_s=timeout_s)
    return service, client


async def test_doubao_tts_success_sends_official_request_and_concatenates_audio() -> None:
    seen: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["headers"] = request.headers
        seen["body"] = json.loads(request.content.decode("utf-8"))
        return httpx.Response(
            200,
            content=_json_stream(
                _audio_payload(b"first-"),
                {
                    "code": 0,
                    "message": "",
                    "data": None,
                    "sentence": {"text": "你好。"},
                },
                _audio_payload(b"second"),
                {
                    "code": 20000000,
                    "message": "ok",
                    "data": None,
                    "usage": {"text_words": 2},
                },
            ),
        )

    service, client = _service_with(handler)
    try:
        result = await service.synthesize("**你好**，[链接](https://example.com)", uid="user-1")
    finally:
        await client.aclose()

    assert seen["url"] == DOUBAO_TTS_URL
    assert seen["headers"].get("X-Api-Key") == "test-key"
    assert seen["headers"].get("X-Api-Resource-Id") == "seed-tts-2.0"
    assert seen["headers"].get("X-Api-Request-Id")
    assert seen["body"] == {
        "user": {"uid": "user-1"},
        "namespace": "BidirectionalTTS",
        "req_params": {
            "text": "你好，链接",
            "speaker": "zh_female_vv_uranus_bigtts",
            "audio_params": {"format": "mp3", "sample_rate": 24000},
            "additions": '{"disable_markdown_filter":true}',
        },
    }
    assert result.audio == b"first-second"
    assert result.media_type == "audio/mpeg"


def test_normalize_tts_text_removes_markdown_noise() -> None:
    content = """
    # 今日建议
    - 请看 [喂养记录](https://example.com/feed)
    ```python
    print("skip markers")
    ```
    **保持观察**。
    """

    assert normalize_tts_text(content) == '今日建议 请看 喂养记录 print("skip markers") 保持观察。'


async def test_doubao_tts_vendor_text_limit_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=_json_stream(
                {
                    "code": 40402003,
                    "message": "TTSExceededTextLimit:exceed max limit",
                    "data": None,
                }
            ),
        )

    service, client = _service_with(handler)
    try:
        with pytest.raises(DoubaoTTSError, match="文本过长"):
            await service.synthesize("x")
    finally:
        await client.aclose()


async def test_doubao_tts_speaker_permission_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=_json_stream(
                {
                    "code": 45000000,
                    "message": "speaker permission denied: get resource id: access denied",
                    "data": None,
                }
            ),
        )

    service, client = _service_with(handler)
    try:
        with pytest.raises(DoubaoTTSError, match="音色未授权"):
            await service.synthesize("x")
    finally:
        await client.aclose()


async def test_doubao_tts_malformed_base64_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=_json_stream({"code": 0, "message": "", "data": "@@@"}),
        )

    service, client = _service_with(handler)
    try:
        with pytest.raises(DoubaoTTSError, match="音频格式异常"):
            await service.synthesize("x")
    finally:
        await client.aclose()


async def test_doubao_tts_success_finish_without_audio_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            content=_json_stream(
                {"code": 0, "message": "", "data": None, "sentence": {"text": "x"}},
                {"code": 20000000, "message": "ok", "data": None},
            ),
        )

    service, client = _service_with(handler)
    try:
        with pytest.raises(DoubaoTTSError, match="未返回音频"):
            await service.synthesize("x")
    finally:
        await client.aclose()


async def test_doubao_tts_malformed_json_errors() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b'{"code":0')

    service, client = _service_with(handler)
    try:
        with pytest.raises(DoubaoTTSError, match="响应格式异常"):
            await service.synthesize("x")
    finally:
        await client.aclose()


async def test_doubao_tts_network_error_maps_to_chinese_message() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("dns down")

    service, client = _service_with(handler)
    try:
        with pytest.raises(DoubaoTTSError, match="网络异常"):
            await service.synthesize("x")
    finally:
        await client.aclose()


async def test_doubao_tts_timeout_maps_to_chinese_message() -> None:
    async def handler(request: httpx.Request) -> httpx.Response:
        await asyncio.sleep(0.05)
        return httpx.Response(200, content=_json_stream(_audio_payload(b"x")))

    client = AsyncClient(transport=httpx.MockTransport(handler))
    service = DoubaoTTSService(api_key="test-key", client=client, timeout_s=0.01)
    try:
        with pytest.raises(DoubaoTTSError, match="超时"):
            await service.synthesize("x")
    finally:
        await client.aclose()
