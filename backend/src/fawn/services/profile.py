from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, ProfileItem


class ProfileError(Exception):
    pass


class NotFound(ProfileError):
    pass


class PermissionDenied(ProfileError):
    pass


async def list_profile_items(db: AsyncSession, user_id: uuid.UUID) -> list[ProfileItem]:
    result = await db.execute(
        select(ProfileItem)
        .where(ProfileItem.user_id == user_id)
        .order_by(ProfileItem.created_at.desc())
    )
    return list(result.scalars())


async def update_profile_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID, content: str
) -> ProfileItem:
    item = await db.get(ProfileItem, item_id)
    if item is None:
        raise NotFound("Profile item not found")
    if item.user_id != user_id:
        raise PermissionDenied("Cannot modify another user's profile item")
    item.content = content
    await db.commit()
    await db.refresh(item)
    return item


async def delete_profile_item(
    db: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID
) -> None:
    item = await db.get(ProfileItem, item_id)
    if item is None:
        raise NotFound("Profile item not found")
    if item.user_id != user_id:
        raise PermissionDenied("Cannot delete another user's profile item")
    await db.delete(item)
    await db.commit()


async def get_baby(db: AsyncSession) -> Baby:
    baby = await db.scalar(select(Baby).order_by(Baby.created_at.asc()).limit(1))
    if baby is None:
        raise NotFound("Baby profile not found")
    return baby


async def update_baby(db: AsyncSession, data: dict[str, Any]) -> Baby:
    baby = await get_baby(db)
    allowed = {"name", "gender", "birth_date", "birth_weight_g", "birth_height_cm",
               "birth_head_cm", "is_premature", "gestational_weeks"}
    for key, value in data.items():
        if key in allowed and value is not None:
            setattr(baby, key, value)
    await db.commit()
    await db.refresh(baby)
    return baby
