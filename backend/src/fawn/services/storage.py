from __future__ import annotations

from io import BytesIO
from urllib.parse import quote

from minio import Minio

from fawn.config import get_settings


def get_minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
        region=settings.minio_region,
    )


def get_public_minio_client() -> Minio:
    settings = get_settings()
    public_endpoint = settings.minio_public_endpoint or settings.minio_endpoint
    if public_endpoint.startswith("localhost:"):
        public_endpoint = public_endpoint.replace("localhost:", "127.0.0.1:", 1)
    public_secure = (
        settings.minio_public_use_ssl
        if settings.minio_public_use_ssl is not None
        else settings.minio_use_ssl
    )
    return Minio(
        public_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=public_secure,
        region=settings.minio_region,
    )


def ensure_bucket(client: Minio | None = None) -> None:
    settings = get_settings()
    client = client or get_minio_client()
    if not client.bucket_exists(settings.minio_bucket):
        client.make_bucket(settings.minio_bucket)


def put_bytes(storage_key: str, content: bytes, content_type: str) -> None:
    settings = get_settings()
    client = get_minio_client()
    ensure_bucket(client)
    client.put_object(
        settings.minio_bucket,
        storage_key.lstrip("/"),
        BytesIO(content),
        length=len(content),
        content_type=content_type,
    )


def get_bytes(storage_key: str) -> bytes:
    settings = get_settings()
    client = get_minio_client()
    response = client.get_object(settings.minio_bucket, storage_key.lstrip("/"))
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def get_presigned_url(storage_key: str, expires: int = 3600) -> str:
    settings = get_settings()
    client = get_public_minio_client()
    from datetime import timedelta
    return client.presigned_get_object(
        settings.minio_bucket,
        storage_key.lstrip("/"),
        expires=timedelta(seconds=expires),
    )


def get_presigned_download_url(storage_key: str, filename: str, expires: int = 300) -> str:
    settings = get_settings()
    client = get_public_minio_client()
    from datetime import timedelta

    safe_filename = filename.rsplit("/", 1)[-1].rsplit("\\", 1)[-1]
    ascii_fallback = "".join(
        char if 32 <= ord(char) < 127 and char not in {'"', "\\"} else "_"
        for char in safe_filename
    ) or "photo"
    disposition = (
        f"attachment; filename=\"{ascii_fallback}\"; "
        f"filename*=UTF-8''{quote(safe_filename)}"
    )
    return client.presigned_get_object(
        settings.minio_bucket,
        storage_key.lstrip("/"),
        expires=timedelta(seconds=expires),
        response_headers={"response-content-disposition": disposition},
    )
