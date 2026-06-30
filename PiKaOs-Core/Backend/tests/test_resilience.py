"""Graceful degradation when Redis is down (A9).

Network-free: swap `redis_client.redis` for a fake whose every call raises, then assert the
read path degrades instead of erroring — the deny-list fails open (not denied), the perms
cache reports a miss (so the caller reads the DB), and best-effort writes don't raise.

    docker compose exec backend pytest tests/test_resilience.py
"""
from __future__ import annotations

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.core import redis_client


class _DeadRedis:
    """Every operation behaves as if Redis is unreachable."""

    async def _boom(self, *args, **kwargs):
        raise RedisConnectionError("redis is down")

    get = set = delete = exists = ping = _boom


@pytest.fixture
def dead_redis(monkeypatch):
    monkeypatch.setattr(redis_client, "redis", _DeadRedis())


async def test_deny_list_fails_open_when_redis_down(dead_redis):
    # can't verify revocation → treat token as not denied (valid tokens keep working)
    assert await redis_client.is_access_denied("any-jti") is False


async def test_perms_cache_reports_miss_when_redis_down(dead_redis):
    # cache miss → caller (rbac_service) falls back to the DB
    assert await redis_client.get_cached_perms("user-1") is None


async def test_best_effort_writes_do_not_raise_when_redis_down(dead_redis):
    # logout / cache-bust paths must not 500 just because Redis is down
    await redis_client.deny_access_jti("jti", 60)
    await redis_client.revoke_refresh_token("tok")
    await redis_client.set_cached_perms("user-1", ["agent.create"], 60)
    await redis_client.clear_cached_perms("user-1")


async def test_ping_false_when_redis_down(dead_redis):
    assert await redis_client.ping() is False
