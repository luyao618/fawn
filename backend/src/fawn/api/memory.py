from __future__ import annotations

import uuid
from dataclasses import dataclass

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import MemoryFileKind, MemoryFileRead, MemoryFileSummary, MemoryFileUpdate
from fawn.db.session import get_db
from fawn.dependencies import get_current_user, get_parent_user
from fawn.models import User
from fawn.services.long_term_memory import (
    MEMORY_LIMITS,
    LongTermMemoryService,
    MemoryTarget,
)

router = APIRouter(prefix="/memory", tags=["memory"])


@dataclass(frozen=True)
class MemoryRef:
    id: str
    label: str
    kind: MemoryFileKind
    filename: str
    target: MemoryTarget
    limit: int
    user_id: uuid.UUID | None = None


def _can_edit(user: User) -> bool:
    return user.access_type == "parent"


def _summary(ref: MemoryRef, user: User) -> MemoryFileSummary:
    return MemoryFileSummary(
        id=ref.id,
        label=ref.label,
        kind=ref.kind,
        filename=ref.filename,
        can_edit=_can_edit(user),
        limit=ref.limit,
    )


async def _family_users(db: AsyncSession, family_id: uuid.UUID) -> list[User]:
    return list(
        (
            await db.execute(
                select(User)
                .where(User.family_id == family_id, User.deleted_at.is_(None))
                .order_by(User.created_at.asc())
            )
        ).scalars()
    )


async def _memory_refs(db: AsyncSession, family_id: uuid.UUID) -> list[MemoryRef]:
    users = await _family_users(db, family_id)
    refs = [
        MemoryRef(
            id="soul",
            label="Soul",
            kind="soul",
            filename="Soul.md",
            target=MemoryTarget.SOUL,
            limit=MEMORY_LIMITS[MemoryTarget.SOUL],
        ),
        MemoryRef(
            id="memory",
            label="Memory",
            kind="family",
            filename="Memory.md",
            target=MemoryTarget.MEMORY,
            limit=MEMORY_LIMITS[MemoryTarget.MEMORY],
        ),
        MemoryRef(
            id="baby",
            label="Baby",
            kind="baby",
            filename="Baby.md",
            target=MemoryTarget.BABY,
            limit=MEMORY_LIMITS[MemoryTarget.BABY],
        ),
    ]
    refs.extend(
        MemoryRef(
            id=f"user:{member.id}",
            label=f"对 {member.display_name} 的记忆",
            kind="user",
            filename=f"users/{member.id}.md",
            target=MemoryTarget.USER,
            limit=MEMORY_LIMITS[MemoryTarget.USER],
            user_id=member.id,
        )
        for member in users
    )
    return refs


async def _resolve_ref(db: AsyncSession, family_id: uuid.UUID, memory_id: str) -> MemoryRef:
    if memory_id in {"soul", "memory", "baby"}:
        refs = {ref.id: ref for ref in await _memory_refs(db, family_id)}
        return refs[memory_id]

    if not memory_id.startswith("user:"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory file not found")

    try:
        user_id = uuid.UUID(memory_id.removeprefix("user:"))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory file not found") from exc

    member = await db.get(User, user_id)
    if member is None or member.family_id != family_id or member.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Memory file not found")

    return MemoryRef(
        id=f"user:{member.id}",
        label=f"对 {member.display_name} 的记忆",
        kind="user",
        filename=f"users/{member.id}.md",
        target=MemoryTarget.USER,
        limit=MEMORY_LIMITS[MemoryTarget.USER],
        user_id=member.id,
    )


@router.get("/files", response_model=list[MemoryFileSummary])
async def list_memory_files(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = LongTermMemoryService()
    await service.ensure_family_memory_files(db, user.family_id)
    return [_summary(ref, user) for ref in await _memory_refs(db, user.family_id)]


@router.get("/files/{memory_id}", response_model=MemoryFileRead)
async def get_memory_file(
    memory_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    service = LongTermMemoryService()
    await service.ensure_family_memory_files(db, user.family_id)
    ref = await _resolve_ref(db, user.family_id, memory_id)
    content = await service.read_memory(user.family_id, ref.target, user_id=ref.user_id)
    return MemoryFileRead(**_summary(ref, user).model_dump(), content=content)


@router.put("/files/{memory_id}", response_model=MemoryFileRead)
async def update_memory_file(
    memory_id: str,
    body: MemoryFileUpdate,
    user: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
):
    service = LongTermMemoryService()
    await service.ensure_family_memory_files(db, user.family_id)
    ref = await _resolve_ref(db, user.family_id, memory_id)
    if ref.target is MemoryTarget.BABY:
        content = await service.write_baby_memory(db, user.family_id, body.content)
    else:
        content = await service.write_memory(
            user.family_id,
            ref.target,
            body.content,
            user_id=ref.user_id,
        )
    return MemoryFileRead(**_summary(ref, user).model_dump(), content=content)
