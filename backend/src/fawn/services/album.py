from __future__ import annotations

import asyncio
import base64
import logging
import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fawn.dependencies import can_soft_delete_data
from fawn.models import Baby, Photo, PhotoTag, User
from fawn.services.storage import get_presigned_download_url, put_bytes

logger = logging.getLogger(__name__)


class AlbumError(Exception):
    pass


class NotFound(AlbumError):
    pass


class PermissionDenied(AlbumError):
    pass


async def _auto_tag_photo(photo_id: uuid.UUID, image_bytes: bytes, mime_type: str) -> None:
    """Call Vision model to generate scene/milestone tags for a photo."""
    try:
        from fawn.db.session import async_session_factory
        from fawn.llm.factory import create_chat_model
        vision_llm = create_chat_model("vision")
        b64 = base64.b64encode(image_bytes).decode()
        data_url = f"data:{mime_type};base64,{b64}"
        prompt = [
            {
                "type": "text",
                "text": (
                    "Analyze this baby/child photo. Return a JSON object with:\n"
                    '- "scenes": list of scene tags (e.g. "outdoor", "bath", "feeding", "sleeping", "playing")\n'
                    '- "milestones": list of developmental milestone tags if any (e.g. "first_smile", "sitting", "crawling", "walking", "first_tooth")\n'
                    "Only include tags you are confident about. Return valid JSON only, no markdown."
                ),
            },
            {"type": "image_url", "image_url": {"url": data_url}},
        ]
        from langchain_core.messages import HumanMessage
        response = await vision_llm.ainvoke([HumanMessage(content=prompt)])
        import json
        text = response.content.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[-1].rsplit("```", 1)[0]
        tags_data = json.loads(text)

        async with async_session_factory() as db:
            for scene in tags_data.get("scenes", []):
                tag = PhotoTag(
                    photo_id=photo_id,
                    tag_type="scene",
                    tag_value=scene,
                    confidence=0.8,
                    is_confirmed=False,
                )
                db.add(tag)

            for milestone in tags_data.get("milestones", []):
                tag = PhotoTag(
                    photo_id=photo_id,
                    tag_type="milestone",
                    tag_value=milestone,
                    confidence=0.7,
                    is_confirmed=False,
                )
                db.add(tag)

            await db.commit()
    except Exception:
        logger.warning("Vision auto-tagging failed for photo %s", photo_id, exc_info=True)


async def upload_photo(
    db: AsyncSession,
    user: User,
    *,
    baby_id: uuid.UUID,
    file_bytes: bytes,
    filename: str,
    mime_type: str,
    file_size: int,
) -> Photo:
    # Verify baby exists
    baby = await db.get(Baby, baby_id)
    if baby is None:
        raise NotFound("Baby not found")
    if baby.family_id != user.family_id:
        raise PermissionDenied("Cannot upload a photo for another family")

    ext = filename.rsplit(".", 1)[-1] if "." in filename else "bin"
    file_id = uuid.uuid4()
    storage_key = f"photos/{baby_id}/{file_id}.{ext}"

    put_bytes(storage_key, file_bytes, mime_type)

    photo = Photo(
        baby_id=baby_id,
        uploaded_by=user.id,
        storage_key=storage_key,
        original_filename=filename,
        mime_type=mime_type,
        file_size_bytes=file_size,
        taken_at=datetime.now(UTC),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo, attribute_names=["tags"])

    asyncio.create_task(_auto_tag_photo(photo.id, file_bytes, mime_type))

    return photo


async def list_photos(
    db: AsyncSession,
    *,
    family_id: uuid.UUID,
    baby_id: uuid.UUID | None = None,
    view: str = "timeline",
    scene: str | None = None,
    month: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Photo], int]:
    stmt = (
        select(Photo)
        .join(Baby, Photo.baby_id == Baby.id)
        .options(selectinload(Photo.tags))
        .where(Photo.deleted_at.is_(None), Baby.family_id == family_id)
    )
    count_stmt = (
        select(func.count())
        .select_from(Photo)
        .join(Baby, Photo.baby_id == Baby.id)
        .where(Photo.deleted_at.is_(None), Baby.family_id == family_id)
    )

    if baby_id:
        stmt = stmt.where(Photo.baby_id == baby_id)
        count_stmt = count_stmt.where(Photo.baby_id == baby_id)

    if view == "scene" and scene:
        stmt = stmt.join(PhotoTag).where(
            PhotoTag.tag_type == "scene", PhotoTag.tag_value == scene
        )
        count_stmt = count_stmt.join(PhotoTag).where(
            PhotoTag.tag_type == "scene", PhotoTag.tag_value == scene
        )
    elif view == "milestone":
        stmt = stmt.join(PhotoTag).where(
            PhotoTag.tag_type == "milestone", PhotoTag.is_confirmed.is_(True)
        )
        count_stmt = count_stmt.join(PhotoTag).where(
            PhotoTag.tag_type == "milestone", PhotoTag.is_confirmed.is_(True)
        )

    if month:
        # month format: "YYYY-MM"
        try:
            year, mon = month.split("-")
            from datetime import date
            start = datetime(int(year), int(mon), 1, tzinfo=UTC)
            if int(mon) == 12:
                end = datetime(int(year) + 1, 1, 1, tzinfo=UTC)
            else:
                end = datetime(int(year), int(mon) + 1, 1, tzinfo=UTC)
            stmt = stmt.where(Photo.taken_at >= start, Photo.taken_at < end)
            count_stmt = count_stmt.where(Photo.taken_at >= start, Photo.taken_at < end)
        except (ValueError, AttributeError):
            pass

    total = await db.scalar(count_stmt) or 0

    stmt = stmt.order_by(Photo.taken_at.desc().nullslast())
    stmt = stmt.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(stmt)
    photos = list(result.scalars().unique())
    return photos, total


async def get_photo(db: AsyncSession, photo_id: uuid.UUID, family_id: uuid.UUID) -> Photo:
    stmt = (
        select(Photo)
        .join(Baby, Photo.baby_id == Baby.id)
        .options(selectinload(Photo.tags))
        .where(Photo.id == photo_id, Photo.deleted_at.is_(None), Baby.family_id == family_id)
    )
    photo = (await db.execute(stmt)).scalar_one_or_none()
    if photo is None:
        raise NotFound("Photo not found")
    return photo


async def confirm_tag(
    db: AsyncSession, photo_id: uuid.UUID, tag_id: uuid.UUID, family_id: uuid.UUID
) -> PhotoTag:
    tag = (
        await db.execute(
            select(PhotoTag)
            .join(Photo)
            .join(Baby, Photo.baby_id == Baby.id)
            .where(
                PhotoTag.id == tag_id,
                PhotoTag.photo_id == photo_id,
                Photo.deleted_at.is_(None),
                Baby.family_id == family_id,
            )
        )
    ).scalar_one_or_none()
    if tag is None:
        raise NotFound("Photo tag not found")
    tag.is_confirmed = True
    await db.commit()
    await db.refresh(tag)
    return tag


async def get_photo_download_url(db: AsyncSession, photo_id: uuid.UUID, family_id: uuid.UUID) -> str:
    photo = await get_photo(db, photo_id, family_id)
    return get_presigned_download_url(photo.storage_key, photo.original_filename)


async def delete_photo(db: AsyncSession, user: User, photo_id: uuid.UUID) -> None:
    photo = await get_photo(db, photo_id, user.family_id)
    if not can_soft_delete_data(user):
        raise PermissionDenied("Cannot delete this photo")
    photo.deleted_at = datetime.now(UTC)
    photo.deleted_by = user.id
    await db.commit()
