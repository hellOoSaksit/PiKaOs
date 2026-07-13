"""FastAPI application entrypoint."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from . import modules
from .core import setup_state
from .core.composition import build_container, teardown_container
from .core.config import settings
from .core.contracts import STORAGE

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

    # G2: open auth mode reachable from the LAN is an anonymous-owner-admin RCE surface. Fail fast
    # (any environment) unless the operator acknowledged LAN exposure. Loopback + login mode are safe.
    lan_violation = settings.open_mode_lan_violation(setup_state.read_auth_mode())
    if lan_violation:
        raise RuntimeError("Refusing to start: " + lan_violation)

    # Composition root: build the DI container + register enabled plugins (symmetric with worker.py:startup),
    # so routers can resolve tool/plugin contracts (e.g. postgres.Connection) per request. Fault-isolated.
    enabled = modules.enabled_optional_modules()
    container, bus, result = build_container(enabled)
    if result.degraded:
        log.warning("plugins degraded in web (lifecycle failed, others unaffected): %s", result.degraded)
    app.state.container = container
    app.state.event_bus = bus

    storage_facade = container.resolve(STORAGE)
    if storage_facade is not None:
        try:
            storage_facade.ensure_bucket()
        except Exception as exc:  # pragma: no cover - infra not ready yet
            print(f"[startup] MinIO bucket check failed: {exc}")

    yield

    teardown_container(container, bus, enabled)


# Fix-NET-03: the interactive docs + machine-readable schema hand an attacker a full map of every
# route and body shape. Serve them in dev/UAT (developer ergonomics) but CLOSE them in production —
# the schema is not part of the product's public contract there.
_docs_enabled = not settings.is_production
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs" if _docs_enabled else None,
    redoc_url="/redoc" if _docs_enabled else None,
    openapi_url="/openapi.json" if _docs_enabled else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Fix-SEC-03: baseline security-response headers on every reply. These are cheap, universally-safe
# defaults; the nginx edge may set the same headers in prod (setdefault → we never clobber the edge).
# HSTS is only emitted in production, where TLS is terminated — sending it over plain HTTP in dev
# would pin browsers to https://localhost and break local work.
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if settings.is_production:
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=63072000; includeSubDomains"
        )
    return response

# Load only the modules this build serves (ENABLED_MODULES) — the foundation always loads,
# optional contexts are switchable (modularity.md §2.5). The worker gates its jobs the same way.
# Routers must mount at import time (before serving); the startup log of the result is in lifespan.
_LOADED_MODULES = modules.register_routers(app)

# Dependency inversion: Core's /health renders plugin state but must not import the App seam, so the
# App composition hands it the provider here (read off `app.state`). Core ↛ App stays clean (§2.1).
app.state.plugin_states = modules.plugin_states


@app.get("/")
async def root() -> dict:
    # Only advertise the docs path when it is actually served (Fix-NET-03).
    return {"name": settings.app_name, **({"docs": "/docs"} if _docs_enabled else {})}
