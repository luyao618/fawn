import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.api.schemas import LoginRequest, LoginResponse, PermissionUpdate, TokenResponse, UserRead
from fawn.db.session import get_db
from fawn.dependencies import get_admin_user, get_current_user
from fawn.models import User
from fawn.services.auth import create_access_token, verify_password

router = APIRouter(tags=["auth"])


def _token_for(user: User) -> str:
    return create_access_token(user.id, user.role)


@router.post("/auth/login", response_model=LoginResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    result = await db.execute(select(User).where(User.username == body.username))
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
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> list[UserRead]:
    result = await db.execute(select(User).order_by(User.created_at.asc()))
    return [UserRead.model_validate(user) for user in result.scalars()]


@router.patch("/users/{user_id}/permissions", response_model=UserRead)
async def update_user_permissions(
    user_id: uuid.UUID,
    body: PermissionUpdate,
    _: User = Depends(get_admin_user),
    db: AsyncSession = Depends(get_db),
) -> UserRead:
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.role == "family":
        user.permissions = body.model_dump()
        await db.commit()
        await db.refresh(user)
    return UserRead.model_validate(user)
