from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import ProfileItemRead, ProfileItemUpdate
from fawn.db.session import get_db
from fawn.dependencies import get_current_user
from fawn.models import User
from fawn.services import profile as profile_service

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/me", response_model=list[ProfileItemRead])
async def get_my_profile(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await profile_service.list_profile_items(db, user.id)


@router.patch("/me/{item_id}", response_model=ProfileItemRead)
async def update_profile_item(
    item_id: uuid.UUID,
    body: ProfileItemUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await profile_service.update_profile_item(db, user.id, item_id, body.content)
    except profile_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except profile_service.PermissionDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


@router.delete("/me/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_profile_item(
    item_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await profile_service.delete_profile_item(db, user.id, item_id)
    except profile_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except profile_service.PermissionDenied as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
