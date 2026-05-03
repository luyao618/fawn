from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import PaginatedResponse, PhotoDownloadResponse, PhotoRead, PhotoTagRead
from fawn.db.session import get_db
from fawn.dependencies import get_current_user, require_photo_uploader
from fawn.models import User
from fawn.services import album as album_service
from fawn.services import profile as profile_service
from fawn.services.storage import get_presigned_url

router = APIRouter(prefix="/album", tags=["album"])


def _photo_to_read(photo) -> dict:
    return {
        "id": photo.id,
        "storage_url": get_presigned_url(photo.storage_key),
        "original_filename": photo.original_filename,
        "taken_at": photo.taken_at,
        "uploaded_at": photo.uploaded_at,
        "tags": [PhotoTagRead.model_validate(tag) for tag in photo.tags],
    }


@router.post("/photos", response_model=PhotoRead, status_code=status.HTTP_201_CREATED)
async def upload_photo(
    file: UploadFile,
    user: User = Depends(require_photo_uploader),
    db: AsyncSession = Depends(get_db),
):
    try:
        baby = await profile_service.get_baby(db)
        content = await file.read()
        photo = await album_service.upload_photo(
            db,
            user,
            baby_id=baby.id,
            file_bytes=content,
            filename=file.filename or "upload.bin",
            mime_type=file.content_type or "application/octet-stream",
            file_size=len(content),
        )
    except profile_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except album_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _photo_to_read(photo)


@router.get("/photos", response_model=PaginatedResponse)
async def list_photos(
    view: str = "timeline",
    scene: str | None = None,
    month: str | None = None,
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    photos, total = await album_service.list_photos(
        db, view=view, scene=scene, month=month, page=page, page_size=page_size
    )
    return PaginatedResponse(
        items=[_photo_to_read(p) for p in photos],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/photos/{photo_id}", response_model=PhotoRead)
async def get_photo(
    photo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        photo = await album_service.get_photo(db, photo_id)
    except album_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return _photo_to_read(photo)


@router.post("/photos/{photo_id}/tags/{tag_id}/confirm", response_model=PhotoTagRead)
async def confirm_tag(
    photo_id: uuid.UUID,
    tag_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        tag = await album_service.confirm_tag(db, photo_id, tag_id)
    except album_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return tag


@router.get("/photos/{photo_id}/download", response_model=PhotoDownloadResponse)
async def download_photo(
    photo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        download_url = await album_service.get_photo_download_url(db, photo_id)
    except album_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return PhotoDownloadResponse(download_url=download_url)


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_photo(
    photo_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await album_service.delete_photo(db, user, photo_id)
    except album_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except album_service.PermissionDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
