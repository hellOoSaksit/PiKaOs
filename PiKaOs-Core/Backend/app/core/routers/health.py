"""Health check — pings db, redis, minio."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import redis_client, storage
from ... import modules  # composition seam (app/modules.py) — the plugin registry, lives above Core
from ..config import settings
from ..db import get_db
from ..schemas import HealthOut, PluginHealth, VersionOut

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/version", response_model=VersionOut)
async def version() -> VersionOut:
    """Liveness + build identity, **no dependency I/O** — the right probe for the container
    HEALTHCHECK (a deep /health would falsely mark a new task unhealthy when a shared dep blips and
    trigger a needless auto-rollback) and for the SPA's version-skew reload (release-and-rollback.md
    §4/§7). Stays HTTP 200 as long as the app process can serve."""
    return VersionOut(version=settings.app_version, build=settings.build_hash, name=settings.app_name)


@router.get("/health", response_model=HealthOut)
async def health(db: AsyncSession = Depends(get_db)) -> HealthOut:
    """Deep readiness — pings every dependency. Returns 200 with status "degraded" (not an error) when
    a dependency is down, so dashboards see the detail; use /version for liveness, not this."""
    try:
        await db.execute(text("SELECT 1"))
        db_ok = "ok"
    except Exception:
        db_ok = "down"

    redis_ok = "ok" if await redis_client.ping() else "down"
    minio_ok = "ok" if storage.ping() else "down"

    overall = "ok" if db_ok == redis_ok == minio_ok == "ok" else "degraded"
    return HealthOut(
        status=overall,
        version=settings.app_version,
        build=settings.build_hash,
        db=db_ok,
        redis=redis_ok,
        minio=minio_ok,
        # Core + each plugin's state + manifest version (§14) — disabled plugins still listed.
        plugins=[PluginHealth(**p) for p in modules.plugin_states()],
    )
