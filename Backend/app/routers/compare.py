"""UAT vs Production comparison endpoint. Thin layer: parse request -> call
compare_service -> map domain errors to HTTP.

Production's sitemap drives the primary URL set; each URL is domain-swapped onto
the UAT base and both sides are probed to report coverage.
"""
from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ..deps import get_current_user
from ..models import User
from ..schemas import (
    CompareIn, CompareOut, CoverageBatchIn, CoverageBatchOut, CoveragePlanIn,
    CoveragePlanOut, DeepBatchIn, DeepBatchOut,
)
from ..services import compare_service
from ..services.net_guard import BlockedURLError
from ..services.sitemap import SitemapError

router = APIRouter(prefix="/api/compare", tags=["compare"])

# status used when the client aborts mid-run (nginx's "client closed request")
CLIENT_CLOSED = 499


async def _run_cancellable(request: Request, coro):
    """Run `coro` but cancel it the moment the client disconnects (a Cancel/abort on
    the frontend closes the socket). A compare can hold many in-flight outbound HTTP
    requests; cancelling the task propagates `CancelledError` into those `await`s so
    the outbound work actually STOPS instead of running to completion unseen.

    A 499 is raised on disconnect — the client is already gone, so the body is moot;
    this just keeps an aborted run from logging as an unhandled error."""
    task = asyncio.ensure_future(coro)
    disconnected = False

    async def watch():
        nonlocal disconnected
        while not task.done():
            if await request.is_disconnected():
                disconnected = True
                task.cancel()
                return
            await asyncio.sleep(0.4)

    watcher = asyncio.ensure_future(watch())
    try:
        return await task
    except asyncio.CancelledError:
        raise HTTPException(CLIENT_CLOSED, "Client cancelled the request")
    finally:
        watcher.cancel()
        if not task.done():
            task.cancel()


@router.post("", response_model=CompareOut)
async def compare_sites(
    body: CompareIn,
    request: Request,
    _user: User = Depends(get_current_user),
) -> CompareOut:
    """Compare a UAT site against Production by Production-sitemap URL coverage."""
    try:
        return await _run_cancellable(request, compare_service.compare(body))
    except BlockedURLError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Blocked URL: {exc}")
    except SitemapError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Sitemap error: {exc}")


@router.post("/plan", response_model=CoveragePlanOut)
async def coverage_plan(
    body: CoveragePlanIn,
    request: Request,
    _user: User = Depends(get_current_user),
) -> CoveragePlanOut:
    """Step 1 of streamed coverage: read the sitemap(s) → URL pairs to probe (fast, no probing)."""
    try:
        return await _run_cancellable(request, compare_service.coverage_plan(body))
    except BlockedURLError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Blocked URL: {exc}")
    except SitemapError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Sitemap error: {exc}")


@router.post("/batch", response_model=CoverageBatchOut)
async def coverage_batch(
    body: CoverageBatchIn,
    request: Request,
    _user: User = Depends(get_current_user),
) -> CoverageBatchOut:
    """Step 2 of streamed coverage: probe one chunk of pairs (the client streams chunks)."""
    return CoverageBatchOut(results=await _run_cancellable(request, compare_service.coverage_batch(body)))


@router.post("/deep", response_model=DeepBatchOut)
async def compare_deep(
    body: DeepBatchIn,
    request: Request,
    _user: User = Depends(get_current_user),
) -> DeepBatchOut:
    """Deep-compare one batch of page pairs (the client streams sets to stay fast)."""
    return DeepBatchOut(results=await _run_cancellable(request, compare_service.deep_batch(body)))
