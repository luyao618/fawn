"""Agent task plane: registry, runner, and execution for user-triggered tasks.

Distinct from `fawn.services.agent_tasks`, which manages short-term in-chat
working memory (`AgentTask` / `agent_tasks`).
"""
from __future__ import annotations

import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any, Protocol
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from fawn.db.session import async_session_factory as default_session_factory
from fawn.models import AgentTaskRun, Baby, FeedingRecord, HealthRecord, SleepRecord, User

logger = logging.getLogger(__name__)

APP_TIMEZONE = ZoneInfo("Asia/Shanghai")
DEFAULT_TASK_TIMEOUT_SECONDS = 120
WEEKLY_REPORT_DAILY_LIMIT = 5

ACTIVE_STATUSES = ("queued", "running")
TERMINAL_STATUSES = ("succeeded", "failed", "cancelled")


def utc_now() -> datetime:
    return datetime.now(UTC)


# ---------------------------------------------------------------------------
# Errors raised by the service layer (mapped to HTTP at the API edge).
# ---------------------------------------------------------------------------


class TaskServiceError(Exception):
    code: str = "task.internal_error"
    http_status: int = 400
    extra: dict[str, Any]

    def __init__(self, message: str, *, extra: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.extra = extra or {}


class TaskNotFound(TaskServiceError):
    code = "task.not_found"
    http_status = 404


class UnknownTask(TaskServiceError):
    code = "task.unknown"
    http_status = 404


class InvalidInput(TaskServiceError):
    code = "task.invalid_input"
    http_status = 422


class TaskInProgress(TaskServiceError):
    code = "task_run_in_progress"
    http_status = 409


class TaskRateLimited(TaskServiceError):
    code = "task_run_rate_limited"
    http_status = 429


# ---------------------------------------------------------------------------
# Failure used inside task handlers to signal a structured `failed` terminal.
# ---------------------------------------------------------------------------


class TaskFailure(Exception):
    def __init__(self, code: str, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable


# ---------------------------------------------------------------------------
# Definitions / registry.
# ---------------------------------------------------------------------------

TaskHandler = Callable[["TaskContext"], Awaitable[dict[str, Any]]]


@dataclass(frozen=True)
class TaskDefinition:
    name: str
    title: str
    description: str
    handler: TaskHandler
    input_schema: dict[str, Any] = field(
        default_factory=lambda: {"type": "object", "properties": {}, "required": []}
    )
    estimated_duration_seconds: int = 30
    enabled: bool = True
    daily_limit_per_family: int | None = None


@dataclass
class TaskContext:
    db: AsyncSession
    run: AgentTaskRun
    family_id: uuid.UUID
    user_id: uuid.UUID
    input: dict[str, Any]


_REGISTRY: dict[str, TaskDefinition] = {}


def register_task(definition: TaskDefinition) -> None:
    _REGISTRY[definition.name] = definition


def get_task_definition(name: str) -> TaskDefinition:
    definition = _REGISTRY.get(name)
    if definition is None or not definition.enabled:
        raise UnknownTask(f"Unknown task: {name}")
    return definition


def list_task_definitions() -> list[TaskDefinition]:
    return [d for d in _REGISTRY.values() if d.enabled]


# ---------------------------------------------------------------------------
# Lightweight input validation (avoid jsonschema dependency for v1).
# ---------------------------------------------------------------------------


def _validate_input(schema: dict[str, Any], value: Any) -> None:
    if schema.get("type") == "object":
        if not isinstance(value, dict):
            raise InvalidInput("input must be an object")
        required = schema.get("required") or []
        for key in required:
            if key not in value:
                raise InvalidInput(f"missing required input field: {key}")
        properties = schema.get("properties") or {}
        additional = schema.get("additionalProperties", True)
        if additional is False:
            for key in value:
                if key not in properties:
                    raise InvalidInput(f"unexpected input field: {key}")


# ---------------------------------------------------------------------------
# Runner abstraction. v1 in-process runner spawns an asyncio task that opens
# its own DB session (the request session ends with the POST response).
# ---------------------------------------------------------------------------


class TaskRunner(Protocol):
    async def submit(self, run_id: uuid.UUID, definition: TaskDefinition) -> None: ...


class InProcessTaskRunner:
    def __init__(self, session_factory: async_sessionmaker[AsyncSession] | None = None) -> None:
        self._session_factory = session_factory or default_session_factory
        self._tasks: set[asyncio.Task[Any]] = set()

    async def submit(self, run_id: uuid.UUID, definition: TaskDefinition) -> None:
        task = asyncio.create_task(self._run(run_id, definition))
        self._tasks.add(task)
        task.add_done_callback(self._tasks.discard)

    async def _run(self, run_id: uuid.UUID, definition: TaskDefinition) -> None:
        async with self._session_factory() as session:
            try:
                await execute_run(session, run_id, definition)
            except Exception:
                logger.exception("agent task runner crashed for run %s", run_id)


_runner: TaskRunner | None = None


def set_runner(runner: TaskRunner | None) -> None:
    global _runner
    _runner = runner


def get_runner() -> TaskRunner:
    global _runner
    if _runner is None:
        _runner = InProcessTaskRunner()
    return _runner


# ---------------------------------------------------------------------------
# Public service operations.
# ---------------------------------------------------------------------------


async def _count_today_runs(
    db: AsyncSession, family_id: uuid.UUID, name: str, *, now: datetime
) -> int:
    day_start = datetime.combine(now.astimezone(APP_TIMEZONE).date(), datetime.min.time(),
                                 tzinfo=APP_TIMEZONE).astimezone(UTC)
    stmt = (
        select(func.count(AgentTaskRun.id))
        .where(
            AgentTaskRun.family_id == family_id,
            AgentTaskRun.name == name,
            AgentTaskRun.created_at >= day_start,
        )
    )
    result = await db.execute(stmt)
    return int(result.scalar_one())


async def _get_active_run(
    db: AsyncSession, family_id: uuid.UUID, name: str
) -> AgentTaskRun | None:
    stmt = select(AgentTaskRun).where(
        AgentTaskRun.family_id == family_id,
        AgentTaskRun.name == name,
        AgentTaskRun.status.in_(ACTIVE_STATUSES),
    ).order_by(AgentTaskRun.created_at.desc()).limit(1)
    return await db.scalar(stmt)


async def create_run(
    db: AsyncSession,
    user: User,
    *,
    name: str,
    input: dict[str, Any] | None = None,
    now: datetime | None = None,
) -> AgentTaskRun:
    definition = get_task_definition(name)
    input_data = dict(input or {})
    _validate_input(definition.input_schema, input_data)

    current = now or utc_now()

    existing = await _get_active_run(db, user.family_id, name)
    if existing is not None:
        raise TaskInProgress(
            "A run for this task is already in progress.",
            extra={"existing_run_id": str(existing.id)},
        )

    if definition.daily_limit_per_family is not None:
        used = await _count_today_runs(db, user.family_id, name, now=current)
        if used >= definition.daily_limit_per_family:
            raise TaskRateLimited(
                "Daily run limit reached for this task.",
                extra={"limit": definition.daily_limit_per_family},
            )

    run = AgentTaskRun(
        family_id=user.family_id,
        triggered_by_user_id=user.id,
        name=name,
        status="queued",
        input=input_data,
    )
    db.add(run)
    await db.commit()
    await db.refresh(run)

    await get_runner().submit(run.id, definition)
    return run


async def get_run(
    db: AsyncSession, user: User, run_id: uuid.UUID
) -> AgentTaskRun:
    run = await db.get(AgentTaskRun, run_id)
    if run is None or run.family_id != user.family_id:
        # Cross-family access returns 404 per spec (do not leak existence).
        raise TaskNotFound("Run not found")
    return run


async def list_runs(
    db: AsyncSession,
    user: User,
    *,
    name: str | None = None,
    limit: int = 20,
    offset: int = 0,
) -> list[AgentTaskRun]:
    stmt = select(AgentTaskRun).where(AgentTaskRun.family_id == user.family_id)
    if name is not None:
        stmt = stmt.where(AgentTaskRun.name == name)
    stmt = stmt.order_by(AgentTaskRun.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return list(result.scalars())


# ---------------------------------------------------------------------------
# Core execution driver (used by InProcessTaskRunner and tests).
# ---------------------------------------------------------------------------


async def execute_run(
    db: AsyncSession,
    run_id: uuid.UUID,
    definition: TaskDefinition,
    *,
    timeout_seconds: int | None = None,
) -> AgentTaskRun:
    run = await db.get(AgentTaskRun, run_id)
    if run is None:
        raise TaskNotFound(f"Run {run_id} not found")
    if run.status != "queued":
        # Idempotency guard for re-driven runs.
        return run

    now = utc_now()
    run.status = "running"
    run.started_at = now
    await db.commit()
    await db.refresh(run)

    ctx = TaskContext(
        db=db,
        run=run,
        family_id=run.family_id,
        user_id=run.triggered_by_user_id,
        input=dict(run.input or {}),
    )

    try:
        timeout = timeout_seconds or DEFAULT_TASK_TIMEOUT_SECONDS
        output = await asyncio.wait_for(definition.handler(ctx), timeout=timeout)
        run.status = "succeeded"
        run.output = output
        run.error = None
    except asyncio.TimeoutError:
        run.status = "failed"
        run.error = {
            "code": "task.timeout",
            "message": f"任务执行超过 {timeout_seconds or DEFAULT_TASK_TIMEOUT_SECONDS}s",
            "retryable": True,
        }
    except TaskFailure as exc:
        run.status = "failed"
        run.error = {
            "code": exc.code,
            "message": exc.message,
            "retryable": exc.retryable,
        }
    except Exception as exc:  # noqa: BLE001
        logger.exception("agent task %s run %s failed", definition.name, run.id)
        run.status = "failed"
        run.error = {
            "code": "task.internal_error",
            "message": str(exc) or "internal error",
            "retryable": True,
        }

    run.finished_at = utc_now()
    await db.commit()
    await db.refresh(run)
    return run


# ---------------------------------------------------------------------------
# weekly_report v1 handler.
# ---------------------------------------------------------------------------


def _week_window(now: datetime | None = None) -> tuple[datetime, datetime, date, date]:
    current = (now or utc_now()).astimezone(APP_TIMEZONE)
    end_day = current.date()
    start_day = end_day - timedelta(days=6)
    start_dt = datetime.combine(start_day, datetime.min.time(), tzinfo=APP_TIMEZONE).astimezone(UTC)
    end_dt = (
        datetime.combine(end_day, datetime.min.time(), tzinfo=APP_TIMEZONE) + timedelta(days=1)
    ).astimezone(UTC)
    return start_dt, end_dt, start_day, end_day


async def _weekly_report_handler(ctx: TaskContext) -> dict[str, Any]:
    start_dt, end_dt, start_day, end_day = _week_window()

    baby = await ctx.db.scalar(
        select(Baby).where(Baby.family_id == ctx.family_id).order_by(Baby.created_at.asc()).limit(1)
    )
    if baby is None:
        raise TaskFailure(
            "weekly_report.no_data",
            "本周无可汇总数据：还没有创建宝宝档案",
        )

    feedings = list(
        (
            await ctx.db.execute(
                select(FeedingRecord)
                .where(
                    FeedingRecord.baby_id == baby.id,
                    FeedingRecord.feed_time >= start_dt,
                    FeedingRecord.feed_time < end_dt,
                    FeedingRecord.deleted_at.is_(None),
                )
                .order_by(FeedingRecord.feed_time.asc())
            )
        ).scalars()
    )

    sleeps = list(
        (
            await ctx.db.execute(
                select(SleepRecord)
                .where(
                    SleepRecord.baby_id == baby.id,
                    SleepRecord.sleep_start >= start_dt,
                    SleepRecord.sleep_start < end_dt,
                    SleepRecord.deleted_at.is_(None),
                )
                .order_by(SleepRecord.sleep_start.asc())
            )
        ).scalars()
    )

    healths = list(
        (
            await ctx.db.execute(
                select(HealthRecord)
                .where(
                    HealthRecord.baby_id == baby.id,
                    HealthRecord.record_date >= start_day,
                    HealthRecord.record_date <= end_day,
                    HealthRecord.deleted_at.is_(None),
                )
                .order_by(HealthRecord.record_date.asc())
            )
        ).scalars()
    )

    if not feedings and not sleeps and not healths:
        raise TaskFailure("weekly_report.no_data", "本周无可汇总数据")

    total_ml = sum((f.amount_ml or 0) for f in feedings)
    total_duration_min = sum((f.duration_min or 0) for f in feedings)
    sleep_total_hours = 0.0
    night_wakings = 0
    for s in sleeps:
        if s.sleep_end is not None:
            sleep_total_hours += (s.sleep_end - s.sleep_start).total_seconds() / 3600.0
        night_wakings += s.night_wakings or 0

    name_label = baby.name or "宝宝"
    lines: list[str] = [
        f"# {name_label} 本周小结",
        f"_周期: {start_day.isoformat()} ~ {end_day.isoformat()}_",
        "",
        "## 喂养",
        f"- 喂养次数: {len(feedings)}",
        f"- 总奶量: {total_ml} ml",
        f"- 母乳/亲喂时长: {total_duration_min} 分钟",
        "",
        "## 睡眠",
        f"- 睡眠记录: {len(sleeps)}",
        f"- 累计睡眠: {sleep_total_hours:.1f} 小时",
        f"- 夜醒次数: {night_wakings}",
        "",
        "## 健康 / 里程碑",
        f"- 健康记录: {len(healths)}",
    ]
    for record in healths[:5]:
        lines.append(f"  - {record.record_date.isoformat()} · {record.title}")
    if len(healths) > 5:
        lines.append(f"  - …另有 {len(healths) - 5} 条")
    lines.append("")
    lines.append("## 备注")
    lines.append("本周报由 Fawn 自动汇总，仅作家庭记录参考，不构成医疗建议。")

    return {
        "kind": "weekly_report",
        "summary_markdown": "\n".join(lines),
        "period": {
            "start": start_day.isoformat(),
            "end": end_day.isoformat(),
        },
        "counts": {
            "feedings": len(feedings),
            "sleeps": len(sleeps),
            "healths": len(healths),
        },
    }


register_task(
    TaskDefinition(
        name="weekly_report",
        title="本周小结",
        description="汇总本周喂养 / 睡眠 / 里程碑，生成一份周报。",
        handler=_weekly_report_handler,
        input_schema={"type": "object", "properties": {}, "required": [],
                      "additionalProperties": False},
        estimated_duration_seconds=30,
        enabled=True,
        daily_limit_per_family=WEEKLY_REPORT_DAILY_LIMIT,
    )
)
