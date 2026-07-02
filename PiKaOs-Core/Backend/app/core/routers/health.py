"""Health check — pings db, redis, minio."""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..config import settings
from ..contracts import POSTGRES_CONNECTION, REDIS_CONNECTION, STORAGE
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
async def health(request: Request) -> HealthOut:
    """Deep readiness — pings every dependency. Returns 200 with status "degraded" (not an error) when
    a dependency is down, so dashboards see the detail; use /version for liveness, not this."""
    _container = getattr(request.app.state, "container", None)

    # DB via the postgres.Connection contract (no sqlalchemy in the kernel) — "down"/skip when the
    # postgres tool is disabled, mirroring the redis/minio probes below.
    _pg = _container.resolve(POSTGRES_CONNECTION) if _container is not None else None
    try:
        db_ok = "ok" if (_pg is not None and await _pg["ping"]()) else "down"
    except Exception:
        db_ok = "down"

    _redis = _container.resolve(REDIS_CONNECTION) if _container is not None else None
    try:
        redis_ok = "ok" if (_redis is not None and await _redis.ping()) else "down"
    except Exception:
        redis_ok = "down"
    _storage = _container.resolve(STORAGE) if _container is not None else None
    minio_ok = "ok" if (_storage is not None and _storage.ping()) else "down"

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
