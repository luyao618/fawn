from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, ProfileItem, User
from fawn.services.long_term_memory import LongTermMemoryService


class ProfileError(Exception):
    pass


class NotFound(ProfileError):
    pass


class PermissionDenied(ProfileError):
    pass


class MemorySyncError(ProfileError):
    pass


async def _sync_or_rollback(db: AsyncSession, operation) -> None:
    try:
        await operation()
    except Exception as exc:
        await db.rollback()
        raise MemorySyncError("Markdown memory sync failed") from exc


async def list_profile_items(db: AsyncSession, user_id: uuid.UUID) -> list[ProfileItem]:
    result = await db.execute(
        select(ProfileItem)
        .where(ProfileItem.user_id == user_id, ProfileItem.scope == "user")
        .order_by(ProfileItem.created_at.desc())
    )
    return list(result.scalars())


async def list_family_profile_items(db: AsyncSession, family_id: uuid.UUID) -> list[ProfileItem]:
    result = await db.execute(
        select(ProfileItem)
        .where(ProfileItem.family_id == family_id, ProfileItem.scope == "family")
        .order_by(ProfileItem.created_at.desc())
    )
    return list(result.scalars())


async def create_profile_item(
    db: AsyncSession,
    *,
    family_id: uuid.UUID,
    user_id: uuid.UUID | None,
    scope: str,
    content: str,
    source_conversation_id: uuid.UUID | None = None,
) -> ProfileItem:
    item = ProfileItem(
        family_id=family_id,
        user_id=user_id,
        scope=scope,
        content=content,
        source_conversation_id=source_conversation_id,
    )
    db.add(item)
    await db.flush()
    if scope == "user" and user_id is not None:
        await _sync_or_rollback(
            db,
            lambda: LongTermMemoryService().sync_user_profile(db, family_id, user_id),
        )
    elif scope == "family":
        await _sync_or_rollback(
            db,
            lambda: LongTermMemoryService().sync_family_memory(db, family_id),
        )
    await db.commit()
    await db.refresh(item)
    return item


async def update_profile_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, content: str
) -> ProfileItem:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFound("User not found")
    item = await db.get(ProfileItem, item_id)
    if item is None:
        raise NotFound("Profile item not found")
    if item.scope != "user" or item.user_id != user_id:
        raise PermissionDenied("Cannot modify another user's profile item")
    item.content = content
    await db.flush()
    await _sync_or_rollback(
        db,
        lambda: LongTermMemoryService().sync_user_profile(db, user.family_id, user_id),
    )
    await db.commit()
    await db.refresh(item)
    return item


async def delete_profile_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID
) -> None:
    user = await db.get(User, user_id)
    if user is None:
        raise NotFound("User not found")
    item = await db.get(ProfileItem, item_id)
    if item is None:
        raise NotFound("Profile item not found")
    if item.scope != "user" or item.user_id != user_id:
        raise PermissionDenied("Cannot delete another user's profile item")
    await db.delete(item)
    await db.flush()
    await _sync_or_rollback(
        db,
        lambda: LongTermMemoryService().sync_user_profile(db, user.family_id, user_id),
    )
    await db.commit()


async def update_family_profile_item(
    db: AsyncSession, family_id: uuid.UUID, item_id: uuid.UUID, content: str
) -> ProfileItem:
    item = await db.get(ProfileItem, item_id)
    if item is None:
        raise NotFound("Profile item not found")
    if item.scope != "family" or item.family_id != family_id:
        raise PermissionDenied("Cannot modify another family's profile item")
    item.content = content
    await db.flush()
    await _sync_or_rollback(
        db,
        lambda: LongTermMemoryService().sync_family_memory(db, family_id),
    )
    await db.commit()
    await db.refresh(item)
    return item


async def delete_family_profile_item(
    db: AsyncSession, family_id: uuid.UUID, item_id: uuid.UUID
) -> None:
    item = await db.get(ProfileItem, item_id)
    if item is None:
        raise NotFound("Profile item not found")
    if item.scope != "family" or item.family_id != family_id:
        raise PermissionDenied("Cannot delete another family's profile item")
    await db.delete(item)
    await db.flush()
    await _sync_or_rollback(
        db,
        lambda: LongTermMemoryService().sync_family_memory(db, family_id),
    )
    await db.commit()


async def get_baby(db: AsyncSession, family_id: uuid.UUID) -> Baby:
    baby = await db.scalar(
        select(Baby).where(Baby.family_id == family_id).order_by(Baby.created_at.asc()).limit(1)
    )
    if baby is None:
        raise NotFound("Baby profile not found")
    return baby


async def update_baby(db: AsyncSession, family_id: uuid.UUID, data: dict[str, Any]) -> Baby:
    baby = await get_baby(db, family_id)
    allowed = {"name", "gender", "birth_date", "birth_weight_g", "birth_height_cm",
               "birth_head_cm", "is_premature", "gestational_weeks"}
    for key, value in data.items():
        if key in allowed and value is not None:
            setattr(baby, key, value)
    await db.flush()
    await _sync_or_rollback(
        db,
        lambda: LongTermMemoryService().sync_baby(db, family_id),
    )
    await db.commit()
    await db.refresh(baby)
    return baby
