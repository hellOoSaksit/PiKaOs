"""Redis client + refresh-token / deny-list / perms-cache helpers.

Graceful degradation (A9): the *read* path that every authenticated request hits
(`is_access_denied`, `get_cached_perms`) tolerates a Redis outage instead of 500-ing the
whole API — the deny-list fails open and the perms cache reports a miss so the caller reads
the DB. Best-effort *writes* (logout / cache-bust) swallow Redis errors too. Login/refresh
(`create_refresh_token` / `consume_refresh_token`) still require Redis and raise on failure —
they genuinely cannot work without it. See docs/process/lessons.md §A for the fail-open call.
"""
from __future__ import annotations

import json
import logging
import secrets

import redis.asyncio as aioredis
from redis.exceptions import RedisError

from .config import settings

log = logging.getLogger("pikaos.redis")

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
    # Best-effort (logout path): a Redis outage shouldn't make logout 500.
    try:
        await redis.delete(_REFRESH.format(token))
    except RedisError as exc:
        log.warning("redis down — could not revoke refresh token: %s", exc)


async def deny_access_jti(jti: str, ttl_seconds: int) -> None:
    # Best-effort (logout path): if Redis is down we can't deny-list, but the client still
    # drops its token and the access token expires on its own (short TTL).
    if ttl_seconds <= 0:
        return
    try:
        await redis.set(_DENY.format(jti), "1", ex=ttl_seconds)
    except RedisError as exc:
        log.warning("redis down — could not deny-list access jti: %s", exc)


async def is_access_denied(jti: str) -> bool:
    # Deny-list lookup on every authenticated request. If Redis is unreachable we cannot
    # verify revocation, so fail OPEN (treat as not-denied) to keep valid, unexpired tokens
    # working through a Redis outage — access tokens are short-lived (15m) so the revocation
    # gap is bounded. Logged; decided in docs/process/lessons.md §A. (A9)
    try:
        return await redis.exists(_DENY.format(jti)) == 1
    except RedisError as exc:
        log.warning("redis down — skipping deny-list check (fail-open): %s", exc)
        return False


# --- effective-permissions cache (avoid joining 3 tables every request) ---

async def get_cached_perms(user_id: str) -> list[str] | None:
    """Cached effective perms, or None on a miss / Redis outage (caller falls back to DB)."""
    try:
        raw = await redis.get(_PERMS.format(user_id))
    except RedisError as exc:
        log.warning("redis down — perms cache miss, reading DB: %s", exc)
        return None
    if raw is None:
        return None
    try:
        return list(json.loads(raw))
    except (ValueError, TypeError):
        return None


async def set_cached_perms(user_id: str, perms: list[str], ttl_seconds: int) -> None:
    if ttl_seconds <= 0:
        return
    try:
        await redis.set(_PERMS.format(user_id), json.dumps(sorted(perms)), ex=ttl_seconds)
    except RedisError as exc:
        log.warning("redis down — skipped caching perms: %s", exc)


async def clear_cached_perms(user_id: str) -> None:
    """Drop a user's cached perms — call after any role/override change."""
    try:
        await redis.delete(_PERMS.format(user_id))
    except RedisError as exc:
        log.warning("redis down — could not clear perms cache (will expire via TTL): %s", exc)


async def ping() -> bool:
    try:
        return bool(await redis.ping())
    except Exception:
        return False
