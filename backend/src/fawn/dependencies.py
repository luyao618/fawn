import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.ext.asyncio import AsyncSession

from fawn.db.session import get_db
from fawn.models import User
from fawn.services.auth import decode_token

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id = uuid.UUID(str(payload["sub"]))
    except (KeyError, ValueError, jwt.PyJWTError) as exc:
        raise credentials_error from exc

    user = await db.get(User, user_id)
    if user is None:
        raise credentials_error
    return user


async def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user


def can_write_tracker(user: User) -> bool:
    if user.role in {"admin", "parent"}:
        return True
    return bool((user.permissions or {}).get("can_write_tracker"))


def can_upload_photos(user: User) -> bool:
    if user.role in {"admin", "parent"}:
        return True
    return bool((user.permissions or {}).get("can_upload_photos"))


async def require_tracker_writer(user: User = Depends(get_current_user)) -> User:
    if not can_write_tracker(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Tracker write permission required"
        )
    return user


async def require_photo_uploader(user: User = Depends(get_current_user)) -> User:
    if not can_upload_photos(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Photo upload permission required"
        )
    return user
