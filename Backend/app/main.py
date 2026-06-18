"""FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, compare, health, knowledge, llm_config, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Fail fast if a production deploy still carries dev secrets / insecure cookies (A4).
    if settings.is_production:
        violations = settings.production_violations()
        if violations:
            raise RuntimeError(
                "Refusing to start in production with insecure config:\n  - "
                + "\n  - ".join(violations)
            )

    # ensure the MinIO bucket exists on boot (best-effort)
    try:
        from . import storage

        storage.ensure_bucket()
    except Exception as exc:  # pragma: no cover - infra not ready yet
        print(f"[startup] MinIO bucket check failed: {exc}")
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(auth.router)
app.include_router(compare.router)
app.include_router(knowledge.router)
app.include_router(llm_config.router)
app.include_router(llm_config.roles_router)
app.include_router(ws.router)


@app.get("/")
async def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs"}
