"""FastAPI dependencies — turn a Bearer token into the current User."""
from __future__ import annotations

import uuid

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from . import redis_client, security
from .db import get_db
from .models import User
from .repositories import users as users_repo

bearer = HTTPBearer(auto_error=True)

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid credentials",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode + validate the access token, reject denied/expired ones, load the user."""
    try:
        payload = security.decode_access_token(creds.credentials)
    except jwt.PyJWTError:
        raise _UNAUTHORIZED

    if payload.get("type") != "access":
        raise _UNAUTHORIZED

    jti = payload.get("jti")
    if not jti or await redis_client.is_access_denied(jti):
        raise _UNAUTHORIZED

    try:
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise _UNAUTHORIZED

    user = await users_repo.get_by_id(db, user_id)
    if user is None or user.status != "active":
        raise _UNAUTHORIZED
    return user


def require_role(*roles: str):
    """Dependency factory: allow only the given roles (use on protected routes)."""

    async def _checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Forbidden")
        return user

    return _checker
