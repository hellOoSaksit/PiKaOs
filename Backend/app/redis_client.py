"""Redis client + refresh-token / deny-list helpers."""
from __future__ import annotations

import secrets

import redis.asyncio as aioredis

from .config import settings

redis = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)

_REFRESH = "refresh:{}"      # refresh:<token> -> user_id
_DENY = "denylist:{}"        # denylist:<jti> -> "1"


async def create_refresh_token(user_id: str) -> str:
    token = secrets.token_urlsafe(48)
    await redis.set(_REFRESH.format(token), user_id, ex=settings.refresh_ttl_seconds)
    return token


async def consume_refresh_token(token: str) -> str | None:
    """Validate + rotate: returns user_id and deletes the old token (single-use)."""
    key = _REFRESH.format(token)
    user_id = await redis.get(key)
    if user_id is not None:
        await redis.delete(key)
    return user_id


async def revoke_refresh_token(token: str) -> None:
    await redis.delete(_REFRESH.format(token))


async def deny_access_jti(jti: str, ttl_seconds: int) -> None:
    if ttl_seconds > 0:
        await redis.set(_DENY.format(jti), "1", ex=ttl_seconds)


async def is_access_denied(jti: str) -> bool:
    return await redis.exists(_DENY.format(jti)) == 1


async def ping() -> bool:
    try:
        return bool(await redis.ping())
    except Exception:
        return False
