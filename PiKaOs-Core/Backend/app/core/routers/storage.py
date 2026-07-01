"""Object-storage status (read-only) — `/api/storage`.

The tools tab shows which object store is configured + a reachability check. The storage client lives in
the `minio` tool plugin; this router resolves the `minio.Storage` contract from the app container (never
imports the plugin). When no storage tool is enabled it reports provider "none". Gated on `infra.manage`.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, Request

from ..contracts import STORAGE
from ..identity import require_perm
from ..schemas import StorageStatusOut

router = APIRouter(prefix="/api/storage", tags=["storage"])


def _storage(request: Request):
    """The storage facade bound under `minio.Storage`, or None when no storage tool is enabled / the
    container is unavailable. Never raises."""
    try:
        return request.app.state.container.resolve(STORAGE)
    except Exception:
        return None


async def _status(request: Request) -> StorageStatusOut:
    facade = _storage(request)
    if facade is None:
        return StorageStatusOut(provider="none", endpoint="", bucket="",
                                secure=False, region=None, reachable=False)
    data = await asyncio.to_thread(facade.status)
    return StorageStatusOut(**data)


@router.get("/status", response_model=StorageStatusOut)
async def storage_status(request: Request,
                         _: object = Depends(require_perm("infra.manage"))) -> StorageStatusOut:
    """Current object-storage config (no secrets) + whether it is reachable right now."""
    return await _status(request)


@router.post("/test", response_model=StorageStatusOut)
async def storage_test(request: Request,
                       _: object = Depends(require_perm("infra.manage"))) -> StorageStatusOut:
    """Re-run the reachability check now (the tools-tab 'Test connection' button)."""
    return await _status(request)
