from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, FeedingRecord, SleepRecord, User
from fawn.services import agent_task_runs as svc


class _InlineRunner:
    """Test runner that executes the run synchronously on the supplied session."""

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def submit(self, run_id: uuid.UUID, definition: svc.TaskDefinition) -> None:
        await svc.execute_run(self._session, run_id, definition)


@pytest.fixture(autouse=True)
def _inline_runner(db: AsyncSession):
    svc.set_runner(_InlineRunner(db))
    yield
    svc.set_runner(None)


async def _seed_week(db: AsyncSession, baby: Baby, user: User) -> None:
    now = datetime.now(timezone.utc)
    db.add(
        FeedingRecord(
            baby_id=baby.id,
            recorded_by=user.id,
            feed_time=now - timedelta(days=1),
            feed_type="formula",
            amount_ml=120,
        )
    )
    db.add(
        SleepRecord(
            baby_id=baby.id,
            recorded_by=user.id,
            sleep_start=now - timedelta(days=1, hours=2),
            sleep_end=now - timedelta(days=1, hours=1),
            sleep_type="nap",
            night_wakings=0,
        )
    )
    await db.commit()


async def test_list_definitions(client: AsyncClient, auth_headers: dict) -> None:
    response = await client.get("/api/agent-tasks/definitions", headers=auth_headers)
    assert response.status_code == 200
    body = response.json()
    names = [d["name"] for d in body["definitions"]]
    assert "weekly_report" in names


async def test_unknown_task_returns_404(
    client: AsyncClient, auth_headers: dict
) -> None:
    response = await client.post(
        "/api/agent-tasks/does_not_exist/runs",
        json={"input": {}},
        headers=auth_headers,
    )
    assert response.status_code == 404
    assert response.json()["detail"]["code"] == "task.unknown"


async def test_weekly_report_succeeds(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_baby: Baby,
    test_user: User,
) -> None:
    await _seed_week(db, test_baby, test_user)

    response = await client.post(
        "/api/agent-tasks/weekly_report/runs",
        json={"input": {}},
        headers=auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "weekly_report"
    # InlineRunner already drove it to terminal state.
    assert body["status"] == "succeeded"
    assert body["output"]["kind"] == "weekly_report"
    assert body["output"]["summary_markdown"]
    assert body["error"] is None

    run_id = body["id"]
    get_response = await client.get(
        f"/api/agent-tasks/runs/{run_id}", headers=auth_headers
    )
    assert get_response.status_code == 200
    assert get_response.json()["status"] == "succeeded"


async def test_weekly_report_no_data(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
) -> None:
    response = await client.post(
        "/api/agent-tasks/weekly_report/runs",
        json={"input": {}},
        headers=auth_headers,
    )
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "failed"
    assert body["error"]["code"] == "weekly_report.no_data"
    assert body["error"]["retryable"] is False


async def test_idempotent_in_progress(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_baby: Baby,
    test_user: User,
) -> None:
    # Use a runner that does nothing so the run stays queued.
    class _NoopRunner:
        async def submit(
            self, run_id: uuid.UUID, definition: svc.TaskDefinition
        ) -> None:
            return None

    svc.set_runner(_NoopRunner())
    await _seed_week(db, test_baby, test_user)

    first = await client.post(
        "/api/agent-tasks/weekly_report/runs",
        json={"input": {}},
        headers=auth_headers,
    )
    assert first.status_code == 201
    assert first.json()["status"] == "queued"

    second = await client.post(
        "/api/agent-tasks/weekly_report/runs",
        json={"input": {}},
        headers=auth_headers,
    )
    assert second.status_code == 409
    detail = second.json()["detail"]
    assert detail["code"] == "task_run_in_progress"
    assert detail["existing_run_id"] == first.json()["id"]


async def test_cross_family_run_returns_404(
    client: AsyncClient,
    auth_headers: dict,
    db: AsyncSession,
    test_baby: Baby,
    test_user: User,
    test_family,
) -> None:
    from fawn.models import AgentTaskRun, Family, User as UserModel
    from fawn.services.auth import create_access_token, hash_password
    from fawn.services.family import normalize_family_name

    other_family = Family(
        id=uuid.uuid4(),
        name="Other",
        name_key=normalize_family_name(f"other-{uuid.uuid4()}"),
    )
    db.add(other_family)
    await db.commit()
    other_user = UserModel(
        id=uuid.uuid4(),
        family_id=other_family.id,
        username=f"other-{uuid.uuid4().hex[:6]}",
        display_name="Other",
        access_type="parent",
        role="爸爸",
        password_hash=hash_password("testpass"),
        permissions={"can_write_tracker": True, "can_upload_photos": True},
    )
    db.add(other_user)
    await db.commit()

    # Seed a run owned by other_family
    run = AgentTaskRun(
        family_id=other_family.id,
        triggered_by_user_id=other_user.id,
        name="weekly_report",
        status="succeeded",
        input={},
        output={"kind": "weekly_report", "summary_markdown": "x",
                "period": {"start": "2026-05-01", "end": "2026-05-07"}},
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    # auth_headers belongs to test_user (different family) -> expect 404
    response = await client.get(
        f"/api/agent-tasks/runs/{run.id}", headers=auth_headers
    )
    assert response.status_code == 404
