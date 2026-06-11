"""Health check — pings db, redis, minio."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .. import redis_client, storage
from ..db import get_db
from ..schemas import HealthOut

router = APIRouter(prefix="/api", tags=["health"])


@router.get("/health", response_model=HealthOut)
async def health(db: AsyncSession = Depends(get_db)) -> HealthOut:
    try:
        await db.execute(text("SELECT 1"))
        db_ok = "ok"
    except Exception:
        db_ok = "down"

    redis_ok = "ok" if await redis_client.ping() else "down"
    minio_ok = "ok" if storage.ping() else "down"

    overall = "ok" if db_ok == redis_ok == minio_ok == "ok" else "degraded"
    return HealthOut(status=overall, db=db_ok, redis=redis_ok, minio=minio_ok)
