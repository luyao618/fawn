from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, FeedingRecord, PushToken, User
from fawn.services import agent_task_runs as task_svc
from fawn.services import push as push_svc


class _RecordingSender:
    def __init__(self, *, failures: dict[str, str] | None = None) -> None:
        self.sent: list[list[push_svc.PushMessage]] = []
        self._failures = failures or {}

    async def send(
        self, messages: list[push_svc.PushMessage]
    ) -> list[push_svc.PushReceipt]:
        self.sent.append(list(messages))
        receipts: list[push_svc.PushReceipt] = []
        for m in messages:
            err = self._failures.get(m.to)
            if err is None:
                receipts.append(push_svc.PushReceipt(token=m.to, ok=True))
            else:
                receipts.append(
                    push_svc.PushReceipt(token=m.to, ok=False, error_code=err)
                )
        return receipts


class _InlineRunner:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def submit(self, run_id: uuid.UUID, definition) -> None:
        await task_svc.execute_run(self._session, run_id, definition)


@pytest.fixture
def recording_sender():
    sender = _RecordingSender()
    push_svc.set_sender(sender)
    yield sender
    push_svc.set_sender(None)


async def test_register_token_endpoint(
    client: AsyncClient, auth_headers: dict, db: AsyncSession, test_user: User
) -> None:
    response = await client.post(
        "/api/push/tokens",
        json={
            "token": "ExponentPushToken[xxxx-1]",
            "platform": "android",
            "device_id": "pixel-7",
        },
        headers=auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["token"] == "ExponentPushToken[xxxx-1]"
    assert body["platform"] == "android"

    # Re-registering the same token rebinds without duplicating rows.
    response2 = await client.post(
        "/api/push/tokens",
        json={
            "token": "ExponentPushToken[xxxx-1]",
            "platform": "android",
        },
        headers=auth_headers,
    )
    assert response2.status_code == 201
    assert response2.json()["id"] == body["id"]


async def test_unregister_token_endpoint(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_user: User,
) -> None:
    await push_svc.register_token(
        db,
        family_id=test_user.family_id,
        user_id=test_user.id,
        token="ExponentPushToken[bye]",
        platform="android",
    )

    response = await client.request(
        "DELETE",
        "/api/push/tokens",
        json={"token": "ExponentPushToken[bye]"},
        headers=auth_headers,
    )
    assert response.status_code == 204

    record = await db.scalar(
        select(PushToken).where(PushToken.token == "ExponentPushToken[bye]")
    )
    assert record is not None and record.revoked_at is not None


async def test_weekly_report_success_emits_push(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_baby: Baby,
    test_user: User,
    recording_sender: _RecordingSender,
) -> None:
    await push_svc.register_token(
        db,
        family_id=test_user.family_id,
        user_id=test_user.id,
        token="ExponentPushToken[ok]",
        platform="android",
    )
    db.add(
        FeedingRecord(
            baby_id=test_baby.id,
            recorded_by=test_user.id,
            feed_time=datetime.now(timezone.utc) - timedelta(days=1),
            feed_type="formula",
            amount_ml=100,
        )
    )
    await db.commit()

    task_svc.set_runner(_InlineRunner(db))
    try:
        response = await client.post(
            "/api/agent-tasks/weekly_report/runs",
            json={"input": {}},
            headers=auth_headers,
        )
    finally:
        task_svc.set_runner(None)

    assert response.status_code == 201
    assert response.json()["status"] == "succeeded"

    assert len(recording_sender.sent) == 1
    batch = recording_sender.sent[0]
    assert len(batch) == 1
    msg = batch[0]
    assert msg.to == "ExponentPushToken[ok]"
    assert msg.data["kind"] == "agent_task_completed"
    assert msg.data["task_name"] == "weekly_report"


async def test_weekly_report_failure_emits_failure_push(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_baby: Baby,
    test_user: User,
    recording_sender: _RecordingSender,
) -> None:
    await push_svc.register_token(
        db,
        family_id=test_user.family_id,
        user_id=test_user.id,
        token="ExponentPushToken[ok]",
        platform="android",
    )

    task_svc.set_runner(_InlineRunner(db))
    try:
        response = await client.post(
            "/api/agent-tasks/weekly_report/runs",
            json={"input": {}},
            headers=auth_headers,
        )
    finally:
        task_svc.set_runner(None)

    assert response.status_code == 201
    assert response.json()["status"] == "failed"

    assert len(recording_sender.sent) == 1
    msg = recording_sender.sent[0][0]
    assert msg.data["kind"] == "agent_task_failed"


async def test_device_not_registered_revokes_token(
    db: AsyncSession, test_user: User
) -> None:
    sender = _RecordingSender(
        failures={"ExponentPushToken[dead]": "DeviceNotRegistered"}
    )
    push_svc.set_sender(sender)
    try:
        await push_svc.register_token(
            db,
            family_id=test_user.family_id,
            user_id=test_user.id,
            token="ExponentPushToken[dead]",
            platform="android",
        )
        await push_svc.send_to_family(
            db, test_user.family_id, title="t", body="b"
        )
    finally:
        push_svc.set_sender(None)

    record = await db.scalar(
        select(PushToken).where(PushToken.token == "ExponentPushToken[dead]")
    )
    assert record is not None and record.revoked_at is not None


async def test_send_to_family_skips_revoked(
    db: AsyncSession, test_user: User
) -> None:
    sender = _RecordingSender()
    push_svc.set_sender(sender)
    try:
        await push_svc.register_token(
            db,
            family_id=test_user.family_id,
            user_id=test_user.id,
            token="ExponentPushToken[live]",
            platform="android",
        )
        await push_svc.register_token(
            db,
            family_id=test_user.family_id,
            user_id=test_user.id,
            token="ExponentPushToken[gone]",
            platform="android",
        )
        await push_svc.unregister_token(db, token="ExponentPushToken[gone]")

        await push_svc.send_to_family(
            db, test_user.family_id, title="hello", body="world"
        )
    finally:
        push_svc.set_sender(None)

    assert len(sender.sent) == 1
    targets = {m.to for m in sender.sent[0]}
    assert targets == {"ExponentPushToken[live]"}
