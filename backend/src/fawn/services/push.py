"""Expo Push delivery + push_token registry.

The service intentionally keeps the transport pluggable so tests can swap in
an in-memory recorder. The default sender posts to Expo's public push API
via httpx; delivery failures (DeviceNotRegistered) revoke the offending
token so subsequent events stop hitting it.
"""
from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Protocol

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import PushToken

logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
_REQUEST_TIMEOUT_SECONDS = 10.0


def utc_now() -> datetime:
    return datetime.now(UTC)


@dataclass
class PushMessage:
    to: str
    title: str
    body: str
    data: dict[str, Any] = field(default_factory=dict)

    def to_expo_payload(self) -> dict[str, Any]:
        return {
            "to": self.to,
            "title": self.title,
            "body": self.body,
            "data": self.data,
            "sound": "default",
            "priority": "high",
        }


@dataclass
class PushReceipt:
    token: str
    ok: bool
    error_code: str | None = None
    message: str | None = None


class PushSender(Protocol):
    async def send(self, messages: list[PushMessage]) -> list[PushReceipt]: ...


class ExpoPushSender:
    """Default sender that talks to Expo's public push API."""

    def __init__(self, *, client: httpx.AsyncClient | None = None) -> None:
        self._client = client

    async def send(self, messages: list[PushMessage]) -> list[PushReceipt]:
        if not messages:
            return []
        payload = [m.to_expo_payload() for m in messages]
        owns_client = self._client is None
        client = self._client or httpx.AsyncClient(timeout=_REQUEST_TIMEOUT_SECONDS)
        try:
            response = await client.post(
                EXPO_PUSH_URL,
                json=payload,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                },
            )
        finally:
            if owns_client:
                await client.aclose()

        receipts: list[PushReceipt] = []
        try:
            response.raise_for_status()
            body = response.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("expo push HTTP error: %s", exc)
            return [
                PushReceipt(
                    token=m.to, ok=False, error_code="transport_error", message=str(exc)
                )
                for m in messages
            ]

        tickets = body.get("data") or []
        # Expo returns one ticket per submitted message in order.
        for message, ticket in zip(messages, tickets, strict=False):
            status = (ticket or {}).get("status")
            if status == "ok":
                receipts.append(PushReceipt(token=message.to, ok=True))
            else:
                details = (ticket or {}).get("details") or {}
                receipts.append(
                    PushReceipt(
                        token=message.to,
                        ok=False,
                        error_code=details.get("error") or status or "error",
                        message=(ticket or {}).get("message"),
                    )
                )
        # If Expo returned fewer tickets than submitted, mark the trailing
        # ones as unknown errors so callers can react.
        for message in messages[len(receipts):]:
            receipts.append(
                PushReceipt(
                    token=message.to, ok=False, error_code="no_ticket"
                )
            )
        return receipts


_sender: PushSender | None = None


def set_sender(sender: PushSender | None) -> None:
    global _sender
    _sender = sender


def get_sender() -> PushSender:
    global _sender
    if _sender is None:
        _sender = ExpoPushSender()
    return _sender


# ---------------------------------------------------------------------------
# Token registry.
# ---------------------------------------------------------------------------


async def register_token(
    db: AsyncSession,
    *,
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    token: str,
    platform: str,
    device_id: str | None = None,
) -> PushToken:
    """Upsert a token. Re-registration rebinds to the latest (user, family)."""
    if platform not in ("android", "ios"):
        raise ValueError(f"unsupported platform: {platform}")
    cleaned = token.strip()
    if not cleaned:
        raise ValueError("token is required")

    now = utc_now()
    existing = await db.scalar(select(PushToken).where(PushToken.token == cleaned))
    if existing is not None:
        existing.family_id = family_id
        existing.user_id = user_id
        existing.platform = platform
        existing.device_id = device_id
        existing.last_seen_at = now
        existing.revoked_at = None
        await db.commit()
        await db.refresh(existing)
        return existing

    record = PushToken(
        family_id=family_id,
        user_id=user_id,
        token=cleaned,
        platform=platform,
        device_id=device_id,
        last_seen_at=now,
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


async def unregister_token(
    db: AsyncSession,
    *,
    token: str,
    family_id: uuid.UUID | None = None,
    user_id: uuid.UUID | None = None,
) -> bool:
    """Soft-revoke a token.

    When ``family_id`` / ``user_id`` are provided, the token must belong to
    that scope or the call is a no-op. This prevents any authenticated user
    from revoking another family's push token simply by guessing/obtaining
    the raw token string.
    """
    record = await db.scalar(select(PushToken).where(PushToken.token == token.strip()))
    if record is None or record.revoked_at is not None:
        return False
    if family_id is not None and record.family_id != family_id:
        return False
    if user_id is not None and record.user_id != user_id:
        return False
    record.revoked_at = utc_now()
    await db.commit()
    return True


async def _active_family_tokens(
    db: AsyncSession, family_id: uuid.UUID
) -> list[PushToken]:
    result = await db.execute(
        select(PushToken).where(
            PushToken.family_id == family_id,
            PushToken.revoked_at.is_(None),
        )
    )
    return list(result.scalars())


async def _handle_receipts(
    db: AsyncSession, receipts: list[PushReceipt]
) -> None:
    """Revoke tokens that Expo reported as permanently device-invalid.

    Only ``DeviceNotRegistered`` (token-specific) triggers a soft revoke.
    Credential-level failures such as ``InvalidCredentials`` indicate an
    app/push credential incident and would wipe otherwise valid tokens on
    fan-out, so we log them instead of mutating token state.
    """
    revoked: list[PushToken] = []
    for receipt in receipts:
        if receipt.ok:
            continue
        if receipt.error_code == "InvalidCredentials":
            logger.warning(
                "expo push credential failure for token %s: %s",
                receipt.token,
                receipt.message,
            )
            continue
        if receipt.error_code != "DeviceNotRegistered":
            continue
        record = await db.scalar(
            select(PushToken).where(PushToken.token == receipt.token)
        )
        if record is not None and record.revoked_at is None:
            record.revoked_at = utc_now()
            revoked.append(record)
    if revoked:
        await db.commit()


async def send_to_family(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    title: str,
    body: str,
    data: dict[str, Any] | None = None,
) -> list[PushReceipt]:
    tokens = await _active_family_tokens(db, family_id)
    if not tokens:
        return []
    messages = [
        PushMessage(to=t.token, title=title, body=body, data=dict(data or {}))
        for t in tokens
    ]
    try:
        receipts = await get_sender().send(messages)
    except Exception:  # noqa: BLE001
        logger.exception("push sender raised for family %s", family_id)
        return []
    await _handle_receipts(db, receipts)
    return receipts
