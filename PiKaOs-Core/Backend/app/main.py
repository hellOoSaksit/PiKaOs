"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import modules
from .core.composition import build_container, teardown_container
from .core.config import settings
from .core.db import SessionLocal

# uvicorn configures this logger with a handler, so the line actually prints in the web log
# (a bare "pikaos.app" logger would propagate to a root with no INFO handler and be swallowed).
log = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("modules loaded: %s", ", ".join(_LOADED_MODULES))

    if settings.is_production:
        violations = settings.production_violations()
        if violations:
            raise RuntimeError(
                "Refusing to start in production with insecure config:\n  - "
                + "\n  - ".join(violations)
            )

    # Composition root: build the DI container + register enabled plugins (symmetric with worker.py:startup),
    # so routers can resolve tool/plugin contracts (e.g. postgres.Connection) per request. Fault-isolated.
    enabled = modules.enabled_optional_modules()
    container, bus, result = build_container(enabled, SessionLocal)
    if result.degraded:
        log.warning("plugins degraded in web (lifecycle failed, others unaffected): %s", result.degraded)
    app.state.container = container
    app.state.event_bus = bus

    try:
        from .core import storage
        storage.ensure_bucket()
    except Exception as exc:  # pragma: no cover - infra not ready yet
        print(f"[startup] MinIO bucket check failed: {exc}")

    yield

    teardown_container(container, bus, enabled, SessionLocal)


app = FastAPI(title=settings.app_name, version=settings.app_version, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load only the modules this build serves (ENABLED_MODULES) — the foundation always loads,
# optional contexts are switchable (modularity.md §2.5). The worker gates its jobs the same way.
# Routers must mount at import time (before serving); the startup log of the result is in lifespan.
_LOADED_MODULES = modules.register_routers(app)

# Dependency inversion: Core's /health renders plugin state but must not import the App seam, so the
# App composition hands it the provider here (read off `app.state`). Core ↛ App stays clean (§2.1).
app.state.plugin_states = modules.plugin_states


@app.get("/")
async def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs"}
