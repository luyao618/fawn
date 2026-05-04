from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import AgentTask, User

ACTIVE_STATUSES = ("pending", "awaiting_confirmation")
DEFAULT_TASK_TTL = timedelta(hours=1)


def utc_now() -> datetime:
    return datetime.now(UTC)


def expires_from(now: datetime | None = None) -> datetime:
    return (now or utc_now()) + DEFAULT_TASK_TTL


async def expire_stale_tasks(
    db: AsyncSession, family_id: uuid.UUID, *, now: datetime | None = None
) -> None:
    current = now or utc_now()
    result = await db.execute(
        select(AgentTask).where(
            AgentTask.family_id == family_id,
            AgentTask.status.in_(ACTIVE_STATUSES),
            AgentTask.expires_at <= current,
        )
    )
    tasks = list(result.scalars())
    if not tasks:
        return
    for task in tasks:
        task.status = "expired"
        task.completed_at = current
    await db.commit()


async def get_active_task(
    db: AsyncSession, family_id: uuid.UUID, *, now: datetime | None = None
) -> AgentTask | None:
    current = now or utc_now()
    await expire_stale_tasks(db, family_id, now=current)
    return await db.scalar(
        select(AgentTask)
        .where(
            AgentTask.family_id == family_id,
            AgentTask.status.in_(ACTIVE_STATUSES),
            AgentTask.expires_at > current,
        )
        .order_by(AgentTask.updated_at.desc(), AgentTask.created_at.desc())
        .limit(1)
    )


async def cancel_active_tasks(
    db: AsyncSession,
    family_id: uuid.UUID,
    *,
    now: datetime | None = None,
    except_task_id: uuid.UUID | None = None,
) -> None:
    current = now or utc_now()
    result = await db.execute(
        select(AgentTask).where(
            AgentTask.family_id == family_id,
            AgentTask.status.in_(ACTIVE_STATUSES),
        )
    )
    changed = False
    for task in result.scalars():
        if except_task_id is not None and task.id == except_task_id:
            continue
        task.status = "cancelled"
        task.completed_at = current
        changed = True
    if changed:
        await db.commit()


async def create_task(
    db: AsyncSession,
    user: User,
    *,
    conversation_id: uuid.UUID,
    task_type: str,
    status: str,
    payload: dict[str, Any],
    missing_slots: list[Any] | None = None,
    risk_level: str = "low",
    now: datetime | None = None,
) -> AgentTask:
    current = now or utc_now()
    await cancel_active_tasks(db, user.family_id, now=current)
    task = AgentTask(
        family_id=user.family_id,
        conversation_id=conversation_id,
        task_type=task_type,
        status=status,
        payload=payload,
        missing_slots=missing_slots or [],
        risk_level=risk_level,
        initiated_by_user_id=user.id,
        last_updated_by_user_id=user.id,
        expires_at=expires_from(current),
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return task


async def update_task(
    db: AsyncSession,
    task: AgentTask,
    user: User,
    *,
    status: str | None = None,
    payload: dict[str, Any] | None = None,
    missing_slots: list[Any] | None = None,
    risk_level: str | None = None,
    confirmed: bool = False,
    now: datetime | None = None,
) -> AgentTask:
    current = now or utc_now()
    if status is not None:
        task.status = status
    if payload is not None:
        task.payload = payload
    if missing_slots is not None:
        task.missing_slots = missing_slots
    if risk_level is not None:
        task.risk_level = risk_level
    task.last_updated_by_user_id = user.id
    if confirmed:
        task.confirmed_by_user_id = user.id
    if task.status in ACTIVE_STATUSES:
        task.expires_at = expires_from(current)
    await db.commit()
    await db.refresh(task)
    return task


async def complete_task(
    db: AsyncSession,
    task: AgentTask,
    user: User,
    *,
    now: datetime | None = None,
) -> AgentTask:
    current = now or utc_now()
    task.status = "completed"
    task.completed_at = current
    task.last_updated_by_user_id = user.id
    task.confirmed_by_user_id = task.confirmed_by_user_id or user.id
    await db.commit()
    await db.refresh(task)
    return task


async def cancel_task(
    db: AsyncSession,
    task: AgentTask,
    user: User,
    *,
    now: datetime | None = None,
) -> AgentTask:
    current = now or utc_now()
    task.status = "cancelled"
    task.completed_at = current
    task.last_updated_by_user_id = user.id
    await db.commit()
    await db.refresh(task)
    return task
