from __future__ import annotations

import io
import uuid
from unittest.mock import patch

from httpx import AsyncClient

from fawn.models import Baby


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


async def test_upload_photo_permission_denied(client: AsyncClient, family_auth_headers: dict):
    file_content = b"fake image"
    files = {"file": ("test.jpg", io.BytesIO(file_content), "image/jpeg")}
    response = await client.post("/api/album/photos", files=files, headers=family_auth_headers)
    assert response.status_code == 403


async def test_confirm_tag_not_found(client: AsyncClient, auth_headers: dict):
    fake_photo = uuid.uuid4()
    fake_tag = uuid.uuid4()
    response = await client.post(
        f"/api/album/photos/{fake_photo}/tags/{fake_tag}/confirm", headers=auth_headers
    )
    assert response.status_code == 404
