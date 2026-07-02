"""Health check — pings db, redis, minio."""
from __future__ import annotations

from fastapi import APIRouter, Request

from ..config import settings
from ..contracts import POSTGRES_CONNECTION, REDIS_CONNECTION, STORAGE
from ..identity import provider_for
from ..schemas import HealthOut, PluginHealth, VersionOut

router = APIRouter(prefix="/api", tags=["health"])


async def _is_authenticated(request: Request) -> bool:
    """True if the request carries a valid bearer token (any authenticated user). Used only to decide
    whether /health may return its full detail — never to authorize an action."""
    auth = request.headers.get("Authorization")
    token = auth[7:].strip() if auth and auth.lower().startswith("bearer ") else None
    if not token:
        return False
    try:
        return await provider_for(request.app).authenticate(token) is not None
    except Exception:
        return False


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

    # Fix-SEC-10: in production, an UNAUTHENTICATED caller gets only the shallow readiness status —
    # not the version/build, per-dependency breakdown, or installed-plugin list (all recon aids).
    # Authenticated dashboards and every non-production caller fall through to the full detail below,
    # so dev and the test suite are unchanged.
    if settings.is_production and not await _is_authenticated(request):
        return HealthOut(status=overall)

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
