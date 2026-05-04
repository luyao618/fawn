from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import BabyRead, BabyUpdate
from fawn.db.session import get_db
from fawn.dependencies import get_current_user, get_parent_user
from fawn.models import User
from fawn.services import profile as profile_service

router = APIRouter(prefix="/baby", tags=["baby"])


@router.get("", response_model=BabyRead)
async def get_baby(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await profile_service.get_baby(db, user.family_id)
    except profile_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.patch("", response_model=BabyRead)
async def update_baby(
    body: BabyUpdate,
    user: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        data = body.model_dump(exclude_unset=True)
        return await profile_service.update_baby(db, user.family_id, data)
    except profile_service.NotFound as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except profile_service.MemorySyncError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
