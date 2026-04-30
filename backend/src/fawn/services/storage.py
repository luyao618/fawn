from __future__ import annotations

from io import BytesIO

from minio import Minio

from fawn.config import get_settings


def get_minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_use_ssl,
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
    client = get_minio_client()
    from datetime import timedelta
    return client.presigned_get_object(
        settings.minio_bucket,
        storage_key.lstrip("/"),
        expires=timedelta(seconds=expires),
    )
