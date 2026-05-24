from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, Photo, PhotoTag, User


async def create_photo(
    db: AsyncSession,
    test_baby: Baby,
    uploaded_by: User,
    *,
    taken_at: datetime | None = None,
) -> Photo:
    photo = Photo(
        baby_id=test_baby.id,
        uploaded_by=uploaded_by.id,
        storage_key=f"photos/{test_baby.id}/{uuid.uuid4()}.jpg",
        original_filename="test.jpg",
        mime_type="image/jpeg",
        file_size_bytes=1024,
        taken_at=taken_at or datetime.now(UTC),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


def _jpeg_bytes(*, exif_taken_at: str | None = None, offset: str | None = None) -> bytes:
    from PIL import Image

    image = Image.new("RGB", (1, 1), color="white")
    output = io.BytesIO()
    if exif_taken_at:
        exif = Image.Exif()
        exif[36867] = exif_taken_at
        if offset:
            exif[36881] = offset
        image.save(output, format="JPEG", exif=exif)
    else:
        image.save(output, format="JPEG")
    return output.getvalue()


def _parse_api_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


async def _upload_photo(
    client: AsyncClient,
    headers: dict,
    *,
    file_content: bytes,
    taken_at: str | None = None,
):
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    data = {"taken_at": taken_at} if taken_at is not None else None
    with patch("fawn.services.album.put_bytes"), \
         patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        return await client.post(
            "/api/album/photos",
            files=files,
            data=data,
            headers=headers,
        )


async def test_upload_photo(client: AsyncClient, auth_headers: dict, test_baby: Baby):
    response = await _upload_photo(
        client,
        auth_headers,
        file_content=b"fake image content",
    )
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["storage_url"] == "http://minio/test"
    assert data["thumbnail_url"] is None
    assert data["original_filename"] == "test.jpg"
    assert data["tags"] == []


async def test_upload_photo_returns_thumbnail_url(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    files = {"file": ("test.jpg", io.BytesIO(_jpeg_bytes()), "image/jpeg")}
    with patch("fawn.services.album.put_bytes") as put_bytes_mock, patch(
        "fawn.api.album.get_presigned_url",
        side_effect=lambda key: f"http://minio/{key}",
    ):
        response = await client.post("/api/album/photos", files=files, headers=auth_headers)

    assert response.status_code == 201
    data = response.json()
    assert data["thumbnail_url"] is not None
    assert "/thumbnails/" in data["thumbnail_url"]
    assert data["thumbnail_url"].endswith(".jpg")
    assert put_bytes_mock.call_count == 2
    assert "/thumbnails/" in put_bytes_mock.call_args_list[1].args[0]
    assert put_bytes_mock.call_args_list[1].args[2] == "image/jpeg"


async def test_upload_photo_no_longer_auto_tags(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    response = await _upload_photo(
        client,
        auth_headers,
        file_content=b"fake image content",
    )

    assert response.status_code == 201
    data = response.json()
    assert data["tags"] == []

    photo_id = uuid.UUID(data["id"])
    tag_count = await db.scalar(
        select(func.count()).select_from(PhotoTag).where(PhotoTag.photo_id == photo_id)
    )
    assert tag_count == 0


async def test_upload_photo_uses_client_taken_at(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    response = await _upload_photo(
        client,
        auth_headers,
        file_content=_jpeg_bytes(exif_taken_at="2026:04:19 10:10:00"),
        taken_at="2026-04-20T10:10:00+08:00",
    )

    assert response.status_code == 201
    data = response.json()
    assert _parse_api_datetime(data["taken_at"]) == datetime(2026, 4, 20, 2, 10, tzinfo=UTC)

    with patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        list_response = await client.get("/api/album/photos", headers=auth_headers)
    assert list_response.status_code == 200
    assert _parse_api_datetime(list_response.json()["items"][0]["taken_at"]) == datetime(
        2026, 4, 20, 2, 10, tzinfo=UTC
    )


async def test_upload_photo_ignores_invalid_client_taken_at_and_uses_exif(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    response = await _upload_photo(
        client,
        auth_headers,
        file_content=_jpeg_bytes(exif_taken_at="2026:04:19 10:10:00"),
        taken_at="not-a-date",
    )

    assert response.status_code == 201
    assert _parse_api_datetime(response.json()["taken_at"]) == datetime(
        2026, 4, 19, 2, 10, tzinfo=UTC
    )


async def test_upload_photo_uses_exif_taken_at_without_client_time(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    response = await _upload_photo(
        client,
        auth_headers,
        file_content=_jpeg_bytes(exif_taken_at="2026:04:19 10:10:00"),
    )

    assert response.status_code == 201
    assert _parse_api_datetime(response.json()["taken_at"]) == datetime(
        2026, 4, 19, 2, 10, tzinfo=UTC
    )


async def test_upload_photo_falls_back_to_upload_time(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    before = datetime.now(UTC)
    response = await _upload_photo(
        client,
        auth_headers,
        file_content=b"fake image content",
    )
    after = datetime.now(UTC)

    assert response.status_code == 201
    taken_at = _parse_api_datetime(response.json()["taken_at"])
    assert before - timedelta(seconds=1) <= taken_at <= after + timedelta(seconds=1)


async def test_list_photos(client: AsyncClient, auth_headers: dict):
    with patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        response = await client.get("/api/album/photos", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


async def test_list_photos_orders_by_taken_at_desc(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    test_user: User,
):
    older = await create_photo(
        db,
        test_baby,
        test_user,
        taken_at=datetime(2026, 4, 18, 2, 10, tzinfo=UTC),
    )
    newer = await create_photo(
        db,
        test_baby,
        test_user,
        taken_at=datetime(2026, 4, 20, 2, 10, tzinfo=UTC),
    )

    with patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        response = await client.get("/api/album/photos", headers=auth_headers)

    assert response.status_code == 200
    items = response.json()["items"]
    assert [item["id"] for item in items] == [str(newer.id), str(older.id)]


async def test_get_photo_not_found(client: AsyncClient, auth_headers: dict):
    fake_id = uuid.uuid4()
    response = await client.get(f"/api/album/photos/{fake_id}", headers=auth_headers)
    assert response.status_code == 404


async def test_family_user_can_upload_photo(client: AsyncClient, family_auth_headers: dict, test_baby: Baby):
    file_content = b"fake image content"
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    with patch("fawn.services.album.put_bytes"), \
         patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        response = await client.post("/api/album/photos", files=files, headers=family_auth_headers)
    assert response.status_code == 201


async def test_upload_photo_friend_permission_denied(client: AsyncClient, friend_auth_headers: dict):
    file_content = b"fake image"
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    response = await client.post("/api/album/photos", files=files, headers=friend_auth_headers)
    assert response.status_code == 403


async def test_upload_photo_without_baby_returns_profile_cta(
    client: AsyncClient,
    auth_headers: dict,
) -> None:
    file_content = b"fake image"
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    response = await client.post("/api/album/photos", files=files, headers=auth_headers)

    assert response.status_code == 422
    assert response.json()["detail"] == "请先在家庭页创建宝宝档案"


async def test_confirm_tag_not_found(client: AsyncClient, auth_headers: dict):
    fake_photo = uuid.uuid4()
    fake_tag = uuid.uuid4()
    response = await client.post(
        f"/api/album/photos/{fake_photo}/tags/{fake_tag}/confirm", headers=auth_headers
    )
    assert response.status_code == 404


async def test_family_user_can_download_photo(
    db: AsyncSession,
    client: AsyncClient,
    family_auth_headers: dict,
    test_baby: Baby,
    test_user: User,
):
    photo = await create_photo(db, test_baby, test_user)

    with patch(
        "fawn.services.album.get_presigned_download_url",
        return_value="http://minio/download",
    ):
        response = await client.get(
            f"/api/album/photos/{photo.id}/download",
            headers=family_auth_headers,
        )

    assert response.status_code == 200
    assert response.json() == {
        "download_url": "http://minio/download",
        "expires_in_seconds": 300,
    }


async def test_family_user_can_delete_photo(
    db: AsyncSession,
    client: AsyncClient,
    family_auth_headers: dict,
    test_baby: Baby,
    test_user: User,
):
    photo = await create_photo(db, test_baby, test_user)

    response = await client.delete(f"/api/album/photos/{photo.id}", headers=family_auth_headers)

    assert response.status_code == 204
    stored = await db.get(Photo, photo.id)
    assert stored is not None
    assert stored.deleted_at is not None
    assert stored.deleted_by is not None


async def test_friend_user_cannot_delete_photo(
    db: AsyncSession,
    client: AsyncClient,
    friend_auth_headers: dict,
    test_baby: Baby,
    test_user: User,
):
    photo = await create_photo(db, test_baby, test_user)

    response = await client.delete(f"/api/album/photos/{photo.id}", headers=friend_auth_headers)

    assert response.status_code == 403
    stored = await db.get(Photo, photo.id)
    assert stored is not None
    assert stored.deleted_at is None


async def test_parent_or_admin_delete_soft_deletes_photo(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    test_user: User,
):
    photo = await create_photo(db, test_baby, test_user)

    response = await client.delete(f"/api/album/photos/{photo.id}", headers=auth_headers)

    assert response.status_code == 204
    stored = await db.get(Photo, photo.id)
    assert stored is not None
    assert stored.deleted_at is not None
    assert stored.deleted_by is not None


async def test_soft_deleted_photo_is_hidden(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    test_user: User,
):
    photo = await create_photo(db, test_baby, test_user)
    await client.delete(f"/api/album/photos/{photo.id}", headers=auth_headers)

    detail_response = await client.get(f"/api/album/photos/{photo.id}", headers=auth_headers)
    assert detail_response.status_code == 404

    with patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        list_response = await client.get("/api/album/photos", headers=auth_headers)

    assert list_response.status_code == 200
    data = list_response.json()
    assert data["total"] == 0
    assert data["items"] == []
