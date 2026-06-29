"""Object-storage status (read-only) — `/api/storage`.

The tools tab shows which object store is configured (MinIO / AWS S3 / S3-compatible) plus a
reachability check, so an admin can SEE and VERIFY the connection without editing bootstrap secrets
from the web. Storage creds live in env only (config.py / storage.py); this router never mutates
them — it is read + test-connection. Gated on `infra.manage` (admin). MinIO's client calls are sync,
so they run off the event loop with `asyncio.to_thread`.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends

from .. import storage
from ..deps import require_perm
from ..schemas import StorageStatusOut

router = APIRouter(prefix="/api/storage", tags=["storage"])


async def _status() -> StorageStatusOut:
    data = await asyncio.to_thread(storage.status)
    return StorageStatusOut(**data)


@router.get("/status", response_model=StorageStatusOut)
async def storage_status(_: object = Depends(require_perm("infra.manage"))) -> StorageStatusOut:
    """Current object-storage config (no secrets) + whether it is reachable right now."""
    return await _status()


@router.post("/test", response_model=StorageStatusOut)
async def storage_test(_: object = Depends(require_perm("infra.manage"))) -> StorageStatusOut:
    """Re-run the reachability check now (the tools-tab 'Test connection' button)."""
    return await _status()
