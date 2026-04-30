from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import patch

from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, Photo, PhotoTag, User


async def test_browse_photos_empty(db: AsyncSession, test_baby: Baby):
    with patch("fawn.agent.tools.album.async_session_factory") as mock_factory:
        mock_factory.return_value.__aenter__ = lambda s: db
        mock_factory.return_value.__aexit__ = lambda s, *a: None

        # Use a context manager mock
        from contextlib import asynccontextmanager

        @asynccontextmanager
        async def mock_session():
            yield db

        mock_factory.side_effect = mock_session

        from fawn.agent.tools.album import browse_photos
        result = await browse_photos.ainvoke({"view": "timeline"})

    assert "photos" in result
    assert isinstance(result["photos"], list)


async def test_browse_photos_with_data(db: AsyncSession, test_user: User, test_baby: Baby):
    photo = Photo(
        baby_id=test_baby.id,
        uploaded_by=test_user.id,
        storage_key="photos/test/test.jpg",
        original_filename="test.jpg",
        mime_type="image/jpeg",
        file_size_bytes=1000,
        taken_at=datetime.now(UTC),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)

    tag = PhotoTag(
        photo_id=photo.id,
        tag_type="scene",
        tag_value="outdoor",
        confidence=0.9,
        is_confirmed=False,
    )
    db.add(tag)
    await db.commit()

    from contextlib import asynccontextmanager

    @asynccontextmanager
    async def mock_session():
        yield db

    with patch("fawn.agent.tools.album.async_session_factory", side_effect=mock_session):
        from fawn.agent.tools.album import browse_photos
        result = await browse_photos.ainvoke({"view": "timeline"})

    assert len(result["photos"]) == 1
    assert result["photos"][0]["original_filename"] == "test.jpg"
    assert len(result["photos"][0]["tags"]) == 1
