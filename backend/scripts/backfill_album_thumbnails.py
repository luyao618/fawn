from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select

from fawn.db.session import async_session_factory
from fawn.models import Photo
from fawn.services import album as album_service
from fawn.services.images import ImageProcessingError, prepare_album_thumbnail
from fawn.services.storage import get_bytes, put_bytes

logger = logging.getLogger(__name__)


async def backfill_album_thumbnails() -> None:
    async with async_session_factory() as db:
        photos = list(
            (
                await db.execute(
                    select(Photo).where(
                        Photo.deleted_at.is_(None),
                        Photo.thumbnail_storage_key.is_(None),
                    )
                )
            ).scalars()
        )
        created = 0
        skipped = 0
        for photo in photos:
            thumbnail_key = album_service.thumbnail_storage_key_for(photo)
            try:
                original_bytes = get_bytes(photo.storage_key)
                thumbnail_bytes, thumbnail_mime_type = prepare_album_thumbnail(original_bytes)
                put_bytes(thumbnail_key, thumbnail_bytes, thumbnail_mime_type)
            except ImageProcessingError:
                skipped += 1
                continue
            except Exception:
                logger.exception("Failed to backfill thumbnail for photo %s", photo.id)
                skipped += 1
                continue
            photo.thumbnail_storage_key = thumbnail_key
            created += 1
        await db.commit()
    print(f"album thumbnails backfilled: created={created} skipped={skipped}")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    asyncio.run(backfill_album_thumbnails())


if __name__ == "__main__":
    main()
