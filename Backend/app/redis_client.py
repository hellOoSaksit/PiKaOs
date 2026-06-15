"""Redis client + refresh-token / deny-list / perms-cache helpers."""
from __future__ import annotations

import json
import secrets

import redis.asyncio as aioredis

from .config import settings

redis = aioredis.from_url(settings.redis_url, encoding="utf-8", decode_responses=True)

_REFRESH = "refresh:{}"      # refresh:<token> -> user_id
_DENY = "denylist:{}"        # denylist:<jti> -> "1"
_PERMS = "perms:{}"          # perms:<user_id> -> JSON list of effective permission keys


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


# --- effective-permissions cache (avoid joining 3 tables every request) ---

async def get_cached_perms(user_id: str) -> list[str] | None:
    """Return cached effective perms for a user, or None on a cache miss."""
    raw = await redis.get(_PERMS.format(user_id))
    if raw is None:
        return None
    try:
        return list(json.loads(raw))
    except (ValueError, TypeError):
        return None


async def set_cached_perms(user_id: str, perms: list[str], ttl_seconds: int) -> None:
    if ttl_seconds > 0:
        await redis.set(_PERMS.format(user_id), json.dumps(sorted(perms)), ex=ttl_seconds)


async def clear_cached_perms(user_id: str) -> None:
    """Drop a user's cached perms — call after any role/override change."""
    await redis.delete(_PERMS.format(user_id))


async def ping() -> bool:
    try:
        return bool(await redis.ping())
    except Exception:
        return False
