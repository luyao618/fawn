import uuid
from typing import Annotated, Any, Literal

from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from fawn.db.session import async_session_factory
from fawn.models import Baby, Photo, PhotoTag, User


InjectedUserId = Annotated[str, InjectedState("user_id")]


@tool
async def browse_photos(
    view: Literal["timeline", "scene", "milestone"] = "timeline",
    scene: str | None = None,
    limit: int = 20,
    user_id: InjectedUserId = "",
) -> dict[str, Any]:
    """Browse photo summaries by timeline, scene, or milestone view."""
    if not user_id:
        return {"error": "missing user context"}
    async with async_session_factory() as db:
        user = await db.get(User, uuid.UUID(user_id))
        if user is None:
            return {"error": "user not found"}
        stmt = (
            select(Photo)
            .join(Baby, Photo.baby_id == Baby.id)
            .options(selectinload(Photo.tags))
            .where(Photo.deleted_at.is_(None), Baby.family_id == user.family_id)
            .order_by(Photo.taken_at.desc().nullslast())
            .limit(limit)
        )
        if view == "scene" and scene:
            stmt = stmt.join(PhotoTag).where(
                PhotoTag.tag_type == "scene", PhotoTag.tag_value == scene
            )
        elif view == "milestone":
            stmt = stmt.join(PhotoTag).where(
                PhotoTag.tag_type == "milestone", PhotoTag.is_confirmed.is_(True)
            )
        photos = list((await db.execute(stmt)).scalars().unique())
    return {
        "photos": [
            {
                "id": str(photo.id),
                "original_filename": photo.original_filename,
                "taken_at": photo.taken_at.isoformat() if photo.taken_at else None,
                "tags": [
                    {
                        "type": tag.tag_type,
                        "value": tag.tag_value,
                        "confidence": float(tag.confidence),
                    }
                    for tag in photo.tags
                ],
            }
            for photo in photos
        ]
    }
