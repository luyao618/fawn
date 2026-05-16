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


async def test_concurrent_create_runs_only_one_wins_409(
    db: AsyncSession, test_user: User, test_baby: Baby
) -> None:
    """Regression: partial unique index must reject a second active run insert.

    Reproduces the race the OC-R review flagged: without DB-level atomicity, two
    concurrent callers can both pass the `_get_active_run` is-None check and
    both insert a `queued` row. We simulate the loser by inserting a second
    active run directly and asserting the integrity constraint fires.
    """
    db.add(
        FeedingRecord(
            baby_id=test_baby.id,
            recorded_by=test_user.id,
            feed_time=datetime.now(timezone.utc) - timedelta(hours=1),
            feed_type="formula",
            amount_ml=80,
        )
    )
    await db.commit()

    class _Noop:
        async def submit(self, *_a, **_k) -> None:
            return None

    svc.set_runner(_Noop())
    try:
        first = await svc.create_run(db, test_user, name="weekly_report")
        assert first.status == "queued"

        # Simulate the racing second writer that already passed the soft check
        # in its own transaction and is now flushing its insert.
        from sqlalchemy.exc import IntegrityError

        racer = AgentTaskRun(
            family_id=test_user.family_id,
            triggered_by_user_id=test_user.id,
            name="weekly_report",
            status="queued",
            input={},
        )
        db.add(racer)
        with pytest.raises(IntegrityError):
            await db.commit()
        await db.rollback()
        # Re-load expired ORM attributes after the rollback above.
        await db.refresh(test_user)

        # Also verify the high-level service surfaces 409 (not a 500) when the
        # active-run check is bypassed by a concurrent insert.
        with pytest.raises(svc.TaskInProgress) as exc_info:
            await svc.create_run(db, test_user, name="weekly_report")
        assert exc_info.value.extra.get("existing_run_id") == str(first.id)
    finally:
        svc.set_runner(None)


async def test_concurrent_create_runs_respect_rate_limit_429(
    db: AsyncSession, test_user: User
) -> None:
    """Regression: rate-limit check + insert must not let callers slip past the quota.

    With the daily limit at N, after N terminal runs the very next caller must
    get TaskRateLimited — including the caller whose transaction sees the
    count == N-1 right as another writer is committing the N-th row. We
    simulate that by seeding the quota and then making back-to-back attempts;
    the advisory-lock / serial-check path must reject every attempt past N.
    """
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

    class _Noop:
        async def submit(self, *_a, **_k) -> None:
            return None

    svc.set_runner(_Noop())
    try:
        # Three concurrent callers, all should be rejected since quota is full.
        results = await asyncio.gather(
            *[
                _safe_create(db, test_user, "weekly_report")
                for _ in range(3)
            ]
        )
    finally:
        svc.set_runner(None)

    assert all(r == "rate_limited" for r in results), results

    # Sanity: nobody created an extra active run while racing.
    from sqlalchemy import func as _func

    active = await db.scalar(
        select(_func.count(AgentTaskRun.id)).where(
            AgentTaskRun.family_id == test_user.family_id,
            AgentTaskRun.name == "weekly_report",
            AgentTaskRun.status.in_(svc.ACTIVE_STATUSES),
        )
    )
    assert active == 0


async def _safe_create(db: AsyncSession, user: User, name: str) -> str:
    try:
        await svc.create_run(db, user, name=name)
    except svc.TaskRateLimited:
        return "rate_limited"
    except svc.TaskInProgress:
        return "in_progress"
    return "ok"


async def test_runner_submit_failure_marks_run_failed(
    db: AsyncSession, test_user: User
) -> None:
    """If runner.submit explodes, the run must not be left pinned as queued."""

    class _BrokenRunner:
        async def submit(self, *_a, **_k) -> None:
            raise RuntimeError("worker pool down")

    svc.set_runner(_BrokenRunner())
    try:
        run = await svc.create_run(db, test_user, name="weekly_report")
    finally:
        svc.set_runner(None)

    assert run.status == "failed"
    assert run.error is not None
    assert run.error["code"] == "task.submit_failed"
    assert run.error["retryable"] is True
    assert run.started_at is not None
    assert run.finished_at is not None


import asyncio  # noqa: E402 — used by concurrent tests above
from sqlalchemy import select  # noqa: E402
