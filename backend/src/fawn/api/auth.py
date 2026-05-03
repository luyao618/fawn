import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import (
    LoginRequest,
    LoginResponse,
    PermissionUpdate,
    TokenResponse,
    UserCreate,
    UserPasswordUpdate,
    UserRead,
    UserUpdate,
)
from fawn.db.session import get_db
from fawn.dependencies import get_parent_user, get_current_user
from fawn.models import User
from fawn.services.auth import create_access_token, hash_password, verify_password

router = APIRouter(tags=["auth"])


def _token_for(user: User) -> str:
    return create_access_token(user.id, user.access_type)


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    result = await db.execute(
        select(User).where(User.username == body.username, User.deleted_at.is_(None))
    )
    user = result.scalar_one_or_none()
    if user is None or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid username or password"
        )
    return LoginResponse(access_token=_token_for(user), user=UserRead.model_validate(user))


@router.post("/auth/refresh", response_model=TokenResponse)
async def refresh_token(user: User = Depends(get_current_user)) -> TokenResponse:
    return TokenResponse(access_token=_token_for(user))


@router.get("/auth/me", response_model=UserRead)
async def me(user: User = Depends(get_current_user)) -> UserRead:
    return UserRead.model_validate(user)


@router.get("/users", response_model=list[UserRead])
async def list_users(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserRead]:
    result = await db.execute(
        select(User)
        .where(User.family_id == user.family_id, User.deleted_at.is_(None))
        .order_by(User.created_at.asc())
    )
    return [UserRead.model_validate(user) for user in result.scalars()]


@router.post("/users", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    parent: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    existing = await db.scalar(select(User).where(User.username == body.username))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    user = User(
        family_id=parent.family_id,
        username=body.username,
        display_name=body.display_name,
        password_hash=hash_password(body.password),
        access_type=body.access_type,
        role=body.role,
        permissions={
            "can_upload_photos": body.access_type in {"parent", "family"},
            "can_write_tracker": body.access_type in {"parent", "family"},
        },
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.patch("/users/{user_id}/permissions", response_model=UserRead)
async def update_user_permissions(
    user_id: uuid.UUID,
    body: PermissionUpdate,
    parent: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    user = await db.get(User, user_id)
    if user is None or user.family_id != parent.family_id or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.permissions = body.model_dump()
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserRead)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    parent: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    user = await db.get(User, user_id)
    if user is None or user.family_id != parent.family_id or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    updates = body.model_dump(exclude_unset=True)
    if updates.get("access_type") and user.id == parent.id and updates["access_type"] != "parent":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cannot demote yourself")
    for key, value in updates.items():
        setattr(user, key, value)
    if "access_type" in updates:
        user.permissions = {
            "can_upload_photos": user.access_type in {"parent", "family"},
            "can_write_tracker": user.access_type in {"parent", "family"},
        }
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.patch("/users/{user_id}/password", status_code=status.HTTP_204_NO_CONTENT)
async def update_user_password(
    user_id: uuid.UUID,
    body: UserPasswordUpdate,
    parent: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    user = await db.get(User, user_id)
    if user is None or user.family_id != parent.family_id or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.password_hash = hash_password(body.password)
    await db.commit()


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    parent: User = Depends(get_parent_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    user = await db.get(User, user_id)
    if user is None or user.family_id != parent.family_id or user.deleted_at is not None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == parent.id:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Cannot delete yourself")
    if user.access_type == "parent":
        parent_count = await db.scalar(
            select(func.count())
            .select_from(User)
            .where(
                User.family_id == parent.family_id,
                User.access_type == "parent",
                User.deleted_at.is_(None),
            )
        )
        if (parent_count or 0) <= 1:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Cannot delete the last parent account",
            )
    user.deleted_at = datetime.now(UTC)
    await db.commit()
