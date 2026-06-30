"""Health check — pings db, redis, minio."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import redis_client, storage
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
async def health(request: Request, db: AsyncSession = Depends(get_db)) -> HealthOut:
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
    # Each plugin's state + manifest version (§14) — disabled plugins still listed. Core (the Base)
    # never imports the composition seam: the App layer registers `modules.plugin_states` on
    # `app.state` at startup (DIP), so this stays an upward-facing detail Core merely *renders*.
    states_provider = getattr(request.app.state, "plugin_states", None)
    plugin_rows = states_provider() if states_provider is not None else []
    return HealthOut(
        status=overall,
        version=settings.app_version,
        build=settings.build_hash,
        db=db_ok,
        redis=redis_ok,
        minio=minio_ok,
        plugins=[PluginHealth(**p) for p in plugin_rows],
    )
