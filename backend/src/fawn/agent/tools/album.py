from typing import Any, Literal

from langchain_core.tools import tool
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from fawn.db.session import async_session_factory
from fawn.models import Photo, PhotoTag


@tool
async def browse_photos(
    view: Literal["timeline", "scene", "milestone"] = "timeline",
    scene: str | None = None,
    limit: int = 20,
) -> dict[str, Any]:
    """Browse photo summaries by timeline, scene, or milestone view."""
    async with async_session_factory() as db:
        stmt = (
            select(Photo)
            .options(selectinload(Photo.tags))
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
