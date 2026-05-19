"""Doubao (火山引擎) 大模型 ASR 极速版客户端。

Submit + poll 异步接口。鉴权用单一 ``x-api-key`` header（无 AppID/Cluster）。
类风格与 :mod:`fawn.services.push` 一致 — 注入式 ``httpx.AsyncClient`` 方便测试用
``httpx.MockTransport`` 替换。
"""

from __future__ import annotations

import asyncio
import base64
import logging
import uuid

import httpx

logger = logging.getLogger(__name__)

DOUBAO_BASE = "https://openspeech.bytedance.com/api/v3/auc/bigmodel"
DOUBAO_RESOURCE_ID = "volc.seedasr.auc"

# 状态码语义（X-Api-Status-Code header）：
#   20000000        成功（submit 已接收 / query 出结果）
#   20000001/2      处理中，继续轮询
#   其它非 OK       终态错误，立即抛出豆包 X-Api-Message
_OK = "20000000"
_IN_PROGRESS = {"20000001", "20000002"}

_PER_REQUEST_TIMEOUT = 10.0  # per HTTP call; outer asyncio.timeout caps total


class DoubaoASRError(Exception):
    """ASR 错误，message 一定是面向用户的中文文案。"""


class DoubaoASRService:
    """豆包大模型 ASR 极速版 (`volc.seedasr.auc`)。

    Usage::

        service = DoubaoASRService(api_key=settings.doubao_api_key)
        text = await service.transcribe(audio_bytes)

    Tests can inject an ``httpx.AsyncClient(transport=MockTransport(...))``.
    """

    def __init__(
        self,
        *,
        api_key: str,
        client: httpx.AsyncClient | None = None,
        timeout_s: float = 30.0,
        poll_interval_s: float = 1.0,
    ) -> None:
        self._api_key = api_key
        self._client = client
        self._timeout_s = timeout_s
        self._poll_interval_s = poll_interval_s

    async def transcribe(self, audio_bytes: bytes) -> str:
        """Submit an m4a/aac (16kHz mono) audio blob and return recognized text.

        Raises :class:`DoubaoASRError` with a Chinese user-facing message on any
        failure (network, submit refusal, query terminal error, total timeout).
        """
        request_id = str(uuid.uuid4())
        headers = {
            "Content-Type": "application/json",
            "x-api-key": self._api_key,
            "X-Api-Resource-Id": DOUBAO_RESOURCE_ID,
            "X-Api-Request-Id": request_id,
            "X-Api-Sequence": "-1",
        }
        submit_body = {
            "user": {"uid": "fawn-mobile"},
            "audio": {
                "format": "m4a",
                "codec": "raw",
                "rate": 16000,
                "bits": 16,
                "channel": 1,
                "data": base64.b64encode(audio_bytes).decode(),
            },
            "request": {
                "model_name": "bigmodel",
                "enable_itn": True,
                "enable_punc": True,
            },
        }

        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=_PER_REQUEST_TIMEOUT)
        try:
            try:
                async with asyncio.timeout(self._timeout_s):
                    return await self._submit_and_poll(client, headers, submit_body)
            except TimeoutError as exc:
                raise DoubaoASRError("语音识别超时，请稍后重试") from exc
        finally:
            if owns_client:
                await client.aclose()

    async def _submit_and_poll(
        self,
        client: httpx.AsyncClient,
        headers: dict[str, str],
        submit_body: dict,
    ) -> str:
        try:
            submit_resp = await client.post(
                f"{DOUBAO_BASE}/submit", headers=headers, json=submit_body
            )
        except (httpx.HTTPError, TimeoutError) as exc:
            raise DoubaoASRError("语音服务网络异常，请稍后再试") from exc

        if submit_resp.headers.get("X-Api-Status-Code") != _OK:
            msg = submit_resp.headers.get("X-Api-Message", "未知错误")
            raise DoubaoASRError(f"豆包提交失败：{msg}")

        # Poll query until result.text appears or the outer asyncio.timeout fires.
        while True:
            await asyncio.sleep(self._poll_interval_s)
            try:
                query_resp = await client.post(
                    f"{DOUBAO_BASE}/query", headers=headers, json={}
                )
            except (httpx.HTTPError, TimeoutError) as exc:
                raise DoubaoASRError("语音服务网络异常，请稍后再试") from exc

            code = query_resp.headers.get("X-Api-Status-Code", "")
            if code == _OK:
                body = query_resp.json()
                result = body.get("result") or {}
                if "text" in result:
                    return result["text"]
                # OK status but no text yet — keep polling (defensive).
                continue
            if code in _IN_PROGRESS:
                continue
            # Any other non-OK code is a terminal error from Doubao. Surface
            # the vendor message instead of burning the full poll budget.
            msg = query_resp.headers.get("X-Api-Message", "未知错误")
            raise DoubaoASRError(f"豆包识别失败：{msg}")
