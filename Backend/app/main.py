"""FastAPI application entrypoint."""
from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import auth, compare, health, ws


@asynccontextmanager
async def lifespan(app: FastAPI):
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
app.include_router(ws.router)


@app.get("/")
async def root() -> dict:
    return {"name": settings.app_name, "docs": "/docs"}
