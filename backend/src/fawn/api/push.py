from __future__ import annotations

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import PushTokenRead, PushTokenRegister, PushTokenUnregister
from fawn.db.session import get_db
from fawn.dependencies import get_current_user
from fawn.models import User
from fawn.services import push as push_service

router = APIRouter(prefix="/push", tags=["push"])


@router.post(
    "/tokens",
    response_model=PushTokenRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_push_token(
    body: PushTokenRegister,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PushTokenRead:
    record = await push_service.register_token(
        db,
        family_id=user.family_id,
        user_id=user.id,
        token=body.token,
        platform=body.platform,
        device_id=body.device_id,
    )
    return PushTokenRead.model_validate(record)


@router.delete("/tokens", status_code=status.HTTP_204_NO_CONTENT)
async def unregister_push_token(
    body: PushTokenUnregister,
    _user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await push_service.unregister_token(db, token=body.token)
