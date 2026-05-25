"""Doubao (火山引擎) TTS V3 client for backend-proxied playback."""

from __future__ import annotations

import asyncio
import base64
import binascii
import json
import logging
import re
import uuid
from dataclasses import dataclass
from typing import Any, AsyncIterator

import httpx

logger = logging.getLogger(__name__)

DOUBAO_TTS_URL = "https://openspeech.bytedance.com/api/v3/tts/unidirectional"
DOUBAO_TTS_RESOURCE_ID = "seed-tts-2.0"
DOUBAO_TTS_SPEAKER = "zh_female_vv_uranus_bigtts"
DOUBAO_TTS_FORMAT = "mp3"
DOUBAO_TTS_SAMPLE_RATE = 24000
DOUBAO_TTS_NAMESPACE = "BidirectionalTTS"

_PER_REQUEST_TIMEOUT = 10.0
_FINISH_CODE = "20000000"
_AUDIO_CODE = "0"
_MEDIA_TYPES = {
    "mp3": "audio/mpeg",
    "ogg_opus": "audio/ogg",
    "pcm": "audio/L16",
}


class DoubaoTTSError(Exception):
    """TTS 错误，message 一定是面向用户的中文文案。"""


@dataclass(frozen=True)
class DoubaoTTSResult:
    audio: bytes
    media_type: str


def normalize_tts_text(content: str) -> str:
    """Convert stored assistant markdown into a compact speech-friendly string."""
    text = content.strip()
    if not text:
        return ""

    text = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1", text)
    text = re.sub(r"```[a-zA-Z0-9_-]*\n?", "", text)
    text = text.replace("```", "")
    text = re.sub(r"^\s{0,3}#{1,6}\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*+]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+[.)]\s+", "", text, flags=re.MULTILINE)
    text = re.sub(r"[*_~`>#|]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


class DoubaoTTSService:
    """豆包 V3 HTTP Chunked 单向流式 TTS 客户端。

    Tests can inject an ``httpx.AsyncClient(transport=MockTransport(...))``.
    """

    def __init__(
        self,
        *,
        api_key: str,
        client: httpx.AsyncClient | None = None,
        timeout_s: float = 30.0,
        resource_id: str = DOUBAO_TTS_RESOURCE_ID,
        speaker: str = DOUBAO_TTS_SPEAKER,
        audio_format: str = DOUBAO_TTS_FORMAT,
        sample_rate: int = DOUBAO_TTS_SAMPLE_RATE,
    ) -> None:
        self._api_key = api_key
        self._client = client
        self._timeout_s = timeout_s
        self._resource_id = resource_id
        self._speaker = speaker
        self._audio_format = audio_format
        self._sample_rate = sample_rate

    async def synthesize(self, text: str, *, uid: str = "fawn-mobile") -> DoubaoTTSResult:
        normalized = normalize_tts_text(text)
        if not normalized:
            raise DoubaoTTSError("没有可播放的文字内容")

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=_PER_REQUEST_TIMEOUT)
        try:
            try:
                async with asyncio.timeout(self._timeout_s):
                    return await self._synthesize_with_client(client, normalized, uid=uid)
            except TimeoutError as exc:
                raise DoubaoTTSError("语音合成超时，请稍后重试") from exc
        finally:
            if owns_client:
                await client.aclose()

    async def _synthesize_with_client(
        self,
        client: httpx.AsyncClient,
        text: str,
        *,
        uid: str,
    ) -> DoubaoTTSResult:
        request_id = str(uuid.uuid4())
        headers = {
            "Content-Type": "application/json",
            "X-Api-Key": self._api_key,
            "X-Api-Resource-Id": self._resource_id,
            "X-Api-Request-Id": request_id,
        }
        body = {
            "user": {"uid": uid},
            "namespace": DOUBAO_TTS_NAMESPACE,
            "req_params": {
                "text": text,
                "speaker": self._speaker,
                "audio_params": {
                    "format": self._audio_format,
                    "sample_rate": self._sample_rate,
                },
                "additions": json.dumps(
                    {"disable_markdown_filter": True},
                    separators=(",", ":"),
                ),
            },
        }

        audio_chunks: list[bytes] = []
        finished = False
        try:
            async with client.stream(
                "POST",
                DOUBAO_TTS_URL,
                headers=headers,
                json=body,
            ) as response:
                if response.status_code < 200 or response.status_code >= 300:
                    await response.aread()
                    raise DoubaoTTSError("语音合成服务异常，请稍后重试")

                async for payload in _iter_json_objects(response):
                    chunk_audio, chunk_finished = _parse_response_payload(payload)
                    if chunk_audio:
                        audio_chunks.append(chunk_audio)
                    if chunk_finished:
                        finished = True
                        break
        except DoubaoTTSError:
            raise
        except (httpx.HTTPError, TimeoutError) as exc:
            raise DoubaoTTSError("语音服务网络异常，请稍后再试") from exc

        audio = b"".join(audio_chunks)
        if not finished:
            raise DoubaoTTSError("语音合成响应未正常结束，请稍后重试")
        if not audio:
            raise DoubaoTTSError("语音合成未返回音频，请稍后重试")
        return DoubaoTTSResult(
            audio=audio,
            media_type=_MEDIA_TYPES.get(self._audio_format, "application/octet-stream"),
        )


async def _iter_json_objects(response: httpx.Response) -> AsyncIterator[dict[str, Any]]:
    decoder = json.JSONDecoder()
    buffer = ""
    async for text_chunk in response.aiter_text():
        buffer += text_chunk
        while True:
            stripped = buffer.lstrip()
            if not stripped:
                buffer = ""
                break
            try:
                payload, end = decoder.raw_decode(stripped)
            except json.JSONDecodeError:
                buffer = stripped
                break
            if not isinstance(payload, dict):
                raise DoubaoTTSError("语音合成响应格式异常")
            yield payload
            buffer = stripped[end:]

    if buffer.strip():
        raise DoubaoTTSError("语音合成响应格式异常")


def _parse_response_payload(payload: dict[str, Any]) -> tuple[bytes | None, bool]:
    code = str(payload.get("code", ""))
    if code == _FINISH_CODE:
        return None, True
    if code != _AUDIO_CODE:
        raise DoubaoTTSError(_vendor_error_message(payload))

    data = payload.get("data")
    if data is None:
        return None, False
    if not isinstance(data, str) or not data:
        raise DoubaoTTSError("语音合成响应格式异常")
    try:
        return base64.b64decode(data, validate=True), False
    except (ValueError, binascii.Error) as exc:
        raise DoubaoTTSError("语音合成音频格式异常") from exc


def _vendor_error_message(payload: dict[str, Any]) -> str:
    code = str(payload.get("code", ""))
    message = str(payload.get("message") or "")
    lower_message = message.lower()
    if code == "40402003" or "exceed max limit" in lower_message:
        return "文本过长，无法生成语音"
    if code == "45000000" or "speaker permission denied" in lower_message:
        return "语音服务音色未授权或配置错误"
    if "quota exceeded" in lower_message or "concurrency" in lower_message:
        return "语音服务繁忙，请稍后再试"
    if code == "55000000":
        return "语音合成服务异常，请稍后再试"
    if message:
        return f"豆包语音合成失败：{message}"
    return "豆包语音合成失败，请稍后重试"
