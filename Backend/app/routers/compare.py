"""UAT vs Production comparison endpoint. Thin layer: parse request -> call
compare_service -> map domain errors to HTTP.

Production's sitemap drives the primary URL set; each URL is domain-swapped onto
the UAT base and both sides are probed to report coverage.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from ..deps import get_current_user
from ..models import User
from ..schemas import CompareIn, CompareOut, DeepBatchIn, DeepBatchOut, RenderIn, RenderOut
from ..services import compare_service
from ..services.sitemap import SitemapError

router = APIRouter(prefix="/api/compare", tags=["compare"])


@router.post("", response_model=CompareOut)
async def compare_sites(
    body: CompareIn,
    _user: User = Depends(get_current_user),
) -> CompareOut:
    """Compare a UAT site against Production by Production-sitemap URL coverage."""
    try:
        return await compare_service.compare(body)
    except SitemapError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Sitemap error: {exc}")


@router.post("/deep", response_model=DeepBatchOut)
async def compare_deep(
    body: DeepBatchIn,
    _user: User = Depends(get_current_user),
) -> DeepBatchOut:
    """Deep-compare one batch of page pairs (the client streams sets to stay fast)."""
    return DeepBatchOut(results=await compare_service.deep_batch(body))


@router.post("/render", response_model=RenderOut)
async def compare_render(
    body: RenderIn,
    _user: User = Depends(get_current_user),
) -> RenderOut:
    """Proxy a page's HTML so the client can preview a site that blocks iframe
    embedding (X-Frame-Options / CSP) inside a same-origin sandboxed srcdoc."""
    return await compare_service.render_page(str(body.url))
