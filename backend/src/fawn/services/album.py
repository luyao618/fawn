from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from fawn.models import Baby, Photo, PhotoTag, User
from fawn.services.storage import put_bytes, get_presigned_url


class AlbumError(Exception):
    pass


class NotFound(AlbumError):
    pass


class PermissionDenied(AlbumError):
    pass


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
    return photo


async def list_photos(
    db: AsyncSession,
    *,
    baby_id: uuid.UUID | None = None,
    view: str = "timeline",
    scene: str | None = None,
    month: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Photo], int]:
    stmt = select(Photo).options(selectinload(Photo.tags))
    count_stmt = select(func.count()).select_from(Photo)

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


async def get_photo(db: AsyncSession, photo_id: uuid.UUID) -> Photo:
    stmt = (
        select(Photo)
        .options(selectinload(Photo.tags))
        .where(Photo.id == photo_id)
    )
    photo = (await db.execute(stmt)).scalar_one_or_none()
    if photo is None:
        raise NotFound("Photo not found")
    return photo


async def confirm_tag(db: AsyncSession, photo_id: uuid.UUID, tag_id: uuid.UUID) -> PhotoTag:
    tag = await db.get(PhotoTag, tag_id)
    if tag is None or tag.photo_id != photo_id:
        raise NotFound("Photo tag not found")
    tag.is_confirmed = True
    await db.commit()
    await db.refresh(tag)
    return tag


async def delete_photo(db: AsyncSession, user: User, photo_id: uuid.UUID) -> None:
    photo = await db.get(Photo, photo_id)
    if photo is None:
        raise NotFound("Photo not found")
    if photo.uploaded_by != user.id and user.role not in {"admin", "parent"}:
        raise PermissionDenied("Cannot delete this photo")
    from fawn.services.storage import get_minio_client
    from fawn.config import get_settings
    settings = get_settings()
    try:
        client = get_minio_client()
        client.remove_object(settings.minio_bucket, photo.storage_key.lstrip("/"))
    except Exception:
        pass
    await db.delete(photo)
    await db.commit()
