from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import FamilyRead, FamilyUpdate
from fawn.db.session import get_db
from fawn.dependencies import get_current_user, get_parent_user
from fawn.models import Family, User
from fawn.services.family import FamilyNameError, display_family_name, normalize_family_name

router = APIRouter(prefix="/family", tags=["family"])


@router.get("", response_model=FamilyRead)
async def get_family(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)) -> Family:
    return await db.get_one(Family, user.family_id)


@router.patch("", response_model=FamilyRead)
async def update_family(
    body: FamilyUpdate,
    user: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
) -> Family:
    family = await db.get_one(Family, user.family_id)
    try:
        family_name = display_family_name(body.name)
        family_name_key = normalize_family_name(family_name)
    except FamilyNameError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="家庭名称不能为空",
        ) from exc

    existing = await db.scalar(
        select(Family).where(Family.name_key == family_name_key, Family.id != family.id)
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="家庭名称已存在")

    family.name = family_name
    family.name_key = family_name_key
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="家庭名称已存在") from exc
    await db.refresh(family)
    return family
