"""Composite Crawler: try fast static lxml first, fall back to a headless
render only when the static pass yields too few terms (a JS-heavy page) or the
plain fetch fails outright."""
from __future__ import annotations

from ..config import get_settings
from ..domain.entities import CrawlResult
from ..domain.ports import CrawlError
from . import crawler as cr
from .renderer import PlaywrightRenderer

settings = get_settings()


class FallbackCrawler:
    def __init__(self, base: cr.LxmlCrawler, renderer: PlaywrightRenderer):
        self.base = base
        self.renderer = renderer

    def fetch_and_extract(self, url: str, bypass_popup: bool) -> CrawlResult:
        base_result: CrawlResult | None = None
        fetch_error: CrawlError | None = None
        try:
            base_result = self.base.fetch_and_extract(url, bypass_popup)
            if len(base_result.page_terms) >= settings.crawl_min_terms:
                return base_result  # static pass is rich enough — no browser needed
        except CrawlError as e:
            fetch_error = e  # plain fetch blocked/failed — a browser may still work

        if settings.crawl_render_enabled:
            rendered = self.renderer.render(cr.normalize_url(url))
            if rendered is not None:
                final_url, html = rendered
                terms = cr.extract_terms(final_url, html, bypass_popup)
                # prefer the render when it finds at least as much as the static pass
                if base_result is None or len(terms) >= len(base_result.page_terms):
                    return CrawlResult(final_url, terms, rendered=True)

        if base_result is not None:
            return base_result
        raise fetch_error or CrawlError("fetch failed")
