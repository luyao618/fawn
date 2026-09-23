from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from httpx import AsyncClient
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.album import _read_upload_limited
from fawn.models import Baby, Photo, PhotoTag, User
from fawn.services import album as album_service
from fawn.services.album import ALBUM_MAX_UPLOAD_BYTES


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


async def _post_upload(
    client: AsyncClient,
    headers: dict,
    *,
    filename: str,
    content: bytes,
    mime_type: str,
):
    files = {"file": (filename, io.BytesIO(content), mime_type)}
    with patch("fawn.services.album.put_bytes") as put_bytes_mock, patch(
        "fawn.api.album.get_presigned_url", return_value="http://minio/test"
    ):
        response = await client.post("/api/album/photos", files=files, headers=headers)
    return response, put_bytes_mock


@pytest.mark.parametrize(
    ("filename", "content", "mime_type"),
    [
        ("evil.html", b"<html><script>alert(1)</script></html>", "text/html"),
        ("evil.svg", b"<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>", "image/svg+xml"),
        ("photo.jpg", b"<html></html>", "text/html"),
        ("doc.pdf", b"%PDF-1.4", "application/pdf"),
        ("blob.bin", b"\x00\x01", "application/octet-stream"),
    ],
)
async def test_upload_photo_rejects_unsupported_types(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    filename: str,
    content: bytes,
    mime_type: str,
):
    response, put_bytes_mock = await _post_upload(
        client, auth_headers, filename=filename, content=content, mime_type=mime_type
    )

    assert response.status_code == 415
    put_bytes_mock.assert_not_called()
    assert await db.scalar(select(func.count()).select_from(Photo)) == 0


async def test_upload_photo_rejects_oversize_file(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    content = b"\xff" * (ALBUM_MAX_UPLOAD_BYTES + 1)
    response, put_bytes_mock = await _post_upload(
        client, auth_headers, filename="big.jpg", content=content, mime_type="image/jpeg"
    )

    assert response.status_code == 413
    put_bytes_mock.assert_not_called()
    assert await db.scalar(select(func.count()).select_from(Photo)) == 0


async def test_upload_photo_accepts_file_at_size_limit(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    content = b"\xff" * ALBUM_MAX_UPLOAD_BYTES
    response, _ = await _post_upload(
        client, auth_headers, filename="max.jpg", content=content, mime_type="image/jpeg"
    )

    assert response.status_code == 201


async def test_upload_photo_derives_extension_from_mime_type(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    response, put_bytes_mock = await _post_upload(
        client,
        auth_headers,
        filename="evil.html",
        content=_jpeg_bytes(),
        mime_type="image/jpeg",
    )

    assert response.status_code == 201
    storage_key, _, stored_mime = put_bytes_mock.call_args_list[0].args
    assert storage_key.startswith(f"photos/{test_baby.id}/")
    assert storage_key.endswith(".jpg")
    assert ".html" not in storage_key
    assert stored_mime == "image/jpeg"

    photo = await db.get(Photo, uuid.UUID(response.json()["id"]))
    assert photo.storage_key == storage_key
    assert photo.mime_type == "image/jpeg"
    assert photo.original_filename == "evil.html"


async def test_upload_photo_accepts_jpeg(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
):
    content = _jpeg_bytes()
    response, put_bytes_mock = await _post_upload(
        client, auth_headers, filename="baby.jpeg", content=content, mime_type="image/jpeg"
    )

    assert response.status_code == 201
    storage_key, stored_bytes, stored_mime = put_bytes_mock.call_args_list[0].args
    assert storage_key.endswith(".jpg")
    assert stored_bytes == content
    assert stored_mime == "image/jpeg"
    photo = await db.get(Photo, uuid.UUID(response.json()["id"]))
    assert photo.file_size_bytes == len(content)


@pytest.mark.parametrize(
    ("mime_type", "expected_ext"),
    [("image/heic", ".heic"), ("image/heif", ".heif"), ("IMAGE/HEIC", ".heic")],
)
async def test_upload_photo_preserves_heic_without_decoding(
    db: AsyncSession,
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    mime_type: str,
    expected_ext: str,
):
    # Not decodable by stock Pillow: the original must still be stored untouched,
    # with thumbnail generation degrading to None.
    content = b"\x00\x00\x00\x18ftypheic\x00\x00\x00\x00mif1heic" + b"\x00" * 64
    response, put_bytes_mock = await _post_upload(
        client, auth_headers, filename="IMG_0001.HEIC", content=content, mime_type=mime_type
    )

    assert response.status_code == 201
    assert response.json()["thumbnail_url"] is None
    assert put_bytes_mock.call_count == 1
    storage_key, stored_bytes, stored_mime = put_bytes_mock.call_args_list[0].args
    assert storage_key.endswith(expected_ext)
    assert stored_bytes == content
    assert stored_mime == mime_type.lower()
    photo = await db.get(Photo, uuid.UUID(response.json()["id"]))
    assert photo.mime_type == mime_type.lower()


@pytest.mark.parametrize(
    ("mime_type", "expected_ext"),
    [("image/png", ".png"), ("image/webp", ".webp"), ("image/gif", ".gif")],
)
async def test_upload_photo_accepts_other_allowed_types(
    client: AsyncClient,
    auth_headers: dict,
    test_baby: Baby,
    mime_type: str,
    expected_ext: str,
):
    response, put_bytes_mock = await _post_upload(
        client, auth_headers, filename="upload", content=b"image bytes", mime_type=mime_type
    )

    assert response.status_code == 201
    assert put_bytes_mock.call_args_list[0].args[0].endswith(expected_ext)


async def test_read_upload_limited_ignores_content_length():
    # A client may under-report Content-Length; the guard must count real bytes.
    from starlette.datastructures import Headers, UploadFile

    content = b"x" * (ALBUM_MAX_UPLOAD_BYTES + 1)
    upload = UploadFile(
        file=io.BytesIO(content),
        filename="big.jpg",
        headers=Headers({"content-type": "image/jpeg", "content-length": "10"}),
    )

    with pytest.raises(HTTPException) as exc_info:
        await _read_upload_limited(upload, ALBUM_MAX_UPLOAD_BYTES)
    assert exc_info.value.status_code == 413


async def test_service_rejects_unsupported_mime_type(
    db: AsyncSession,
    test_user: User,
    test_baby: Baby,
):
    with patch("fawn.services.album.put_bytes") as put_bytes_mock, pytest.raises(
        album_service.UnsupportedMediaType
    ):
        await album_service.upload_photo(
            db,
            test_user,
            baby_id=test_baby.id,
            file_bytes=b"<svg/>",
            filename="x.jpg",
            mime_type="image/svg+xml",
            file_size=6,
        )
    put_bytes_mock.assert_not_called()


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
