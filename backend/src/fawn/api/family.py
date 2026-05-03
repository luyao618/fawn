from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import FamilyRead, FamilyUpdate
from fawn.db.session import get_db
from fawn.dependencies import get_current_user, get_parent_user
from fawn.models import Family, User

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
    family.name = body.name
    await db.commit()
    await db.refresh(family)
    return family
