from __future__ import annotations

import io
import uuid
from datetime import UTC, datetime
from unittest.mock import patch

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.models import Baby, Photo, User


async def create_photo(db: AsyncSession, test_baby: Baby, uploaded_by: User) -> Photo:
    photo = Photo(
        baby_id=test_baby.id,
        uploaded_by=uploaded_by.id,
        storage_key=f"photos/{test_baby.id}/{uuid.uuid4()}.jpg",
        original_filename="test.jpg",
        mime_type="image/jpeg",
        file_size_bytes=1024,
        taken_at=datetime.now(UTC),
    )
    db.add(photo)
    await db.commit()
    await db.refresh(photo)
    return photo


async def test_upload_photo(client: AsyncClient, auth_headers: dict, test_baby: Baby):
    file_content = b"fake image content"
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    with patch("fawn.services.album.put_bytes"), \
         patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        response = await client.post("/api/album/photos", files=files, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert "id" in data
    assert data["storage_url"] == "http://minio/test"
    assert data["original_filename"] == "test.jpg"


async def test_list_photos(client: AsyncClient, auth_headers: dict):
    with patch("fawn.api.album.get_presigned_url", return_value="http://minio/test"):
        response = await client.get("/api/album/photos", headers=auth_headers)
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data


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
