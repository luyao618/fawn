from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import AgentTaskRun, Baby, FeedingRecord, User
from fawn.services import agent_task_runs as svc


async def test_state_machine_succeeded(
    db: AsyncSession, test_user: User, test_baby: Baby
) -> None:
    now = datetime.now(timezone.utc)
    db.add(
        FeedingRecord(
            baby_id=test_baby.id,
            recorded_by=test_user.id,
            feed_time=now - timedelta(hours=2),
            feed_type="formula",
            amount_ml=100,
        )
    )
    await db.commit()

    run = AgentTaskRun(
        family_id=test_user.family_id,
        triggered_by_user_id=test_user.id,
        name="weekly_report",
        status="queued",
        input={},
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    definition = svc.get_task_definition("weekly_report")
    result = await svc.execute_run(db, run.id, definition)

    assert result.status == "succeeded"
    assert result.started_at is not None
    assert result.finished_at is not None
    assert result.output is not None
    assert result.output["kind"] == "weekly_report"
    assert result.error is None


async def test_state_machine_failed_no_data(
    db: AsyncSession, test_user: User, test_baby: Baby
) -> None:
    run = AgentTaskRun(
        family_id=test_user.family_id,
        triggered_by_user_id=test_user.id,
        name="weekly_report",
        status="queued",
        input={},
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    definition = svc.get_task_definition("weekly_report")
    result = await svc.execute_run(db, run.id, definition)

    assert result.status == "failed"
    assert result.error is not None
    assert result.error["code"] == "weekly_report.no_data"
    assert result.finished_at is not None


async def test_state_machine_internal_error(
    db: AsyncSession, test_user: User
) -> None:
    async def boom(ctx: svc.TaskContext) -> dict:
        raise RuntimeError("boom")

    definition = svc.TaskDefinition(
        name="_test_boom",
        title="boom",
        description="",
        handler=boom,
    )
    svc.register_task(definition)

    run = AgentTaskRun(
        family_id=test_user.family_id,
        triggered_by_user_id=test_user.id,
        name="_test_boom",
        status="queued",
        input={},
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    result = await svc.execute_run(db, run.id, definition)
    assert result.status == "failed"
    assert result.error["code"] == "task.internal_error"
    assert result.error["retryable"] is True


async def test_rate_limit_blocks_excess_runs(
    db: AsyncSession, test_user: User
) -> None:
    # Pre-seed daily_limit completed runs in the local day window.
    for _ in range(svc.WEEKLY_REPORT_DAILY_LIMIT):
        db.add(
            AgentTaskRun(
                family_id=test_user.family_id,
                triggered_by_user_id=test_user.id,
                name="weekly_report",
                status="succeeded",
                input={},
                output={"kind": "weekly_report", "summary_markdown": "x",
                        "period": {"start": "x", "end": "x"}},
            )
        )
    await db.commit()

    # Stub runner so create_run doesn't try to spawn an asyncio task.
    class _Noop:
        async def submit(self, *_a, **_k) -> None:
            return None

    svc.set_runner(_Noop())
    try:
        with pytest.raises(svc.TaskRateLimited):
            await svc.create_run(db, test_user, name="weekly_report")
    finally:
        svc.set_runner(None)


async def test_input_validation_rejects_unknown_field(
    db: AsyncSession, test_user: User
) -> None:
    class _Noop:
        async def submit(self, *_a, **_k) -> None:
            return None

    svc.set_runner(_Noop())
    try:
        with pytest.raises(svc.InvalidInput):
            await svc.create_run(
                db, test_user, name="weekly_report", input={"bogus": 1}
            )
    finally:
        svc.set_runner(None)
