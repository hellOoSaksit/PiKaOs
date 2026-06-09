from fastapi import APIRouter, Depends, Query

from ...application.sitemap_service import SitemapService
from ..deps import get_sitemap_service
from ..schemas import SitemapTreeOut

router = APIRouter(prefix="/sitemap", tags=["sitemap"])


@router.get("/tree", response_model=SitemapTreeOut)
def sitemap_tree(url: str = Query(...), svc: SitemapService = Depends(get_sitemap_service)):
    entries = svc.tree(url)
    return SitemapTreeOut(found=bool(entries), count=len(entries), entries=entries)
