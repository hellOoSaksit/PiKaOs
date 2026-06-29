"""Job enqueue side — the web app pushes engine jobs that the arq worker runs (B2/E2).

The worker (app/worker.py) is the consumer; this is the producer the FastAPI process uses to hand
off background work (e.g. RAG ingestion after an upload) without blocking the request. The arq pool
is created lazily and reused. Enqueue is **best-effort**: a Redis outage degrades the feature (the
file is still stored; it just isn't indexed yet) rather than failing the request — A9, same spirit
as redis_client's fail-open read path.
"""
from __future__ import annotations

import logging

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings

from .config import settings

log = logging.getLogger("pikaos.queue")

_pool: ArqRedis | None = None


async def get_pool() -> ArqRedis:
    global _pool
    if _pool is None:
        _pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    return _pool


async def enqueue(job: str, *args) -> bool:
    """Enqueue an arq job by name. Returns True if accepted, False on a Redis outage (logged)."""
    try:
        pool = await get_pool()
        await pool.enqueue_job(job, *args)
        return True
    except Exception as exc:  # noqa: BLE001 — best-effort: never fail the caller's request
        log.warning("could not enqueue %s: %s", job, exc)
        return False
