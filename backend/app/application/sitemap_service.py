"""Use case: read a site's full sitemap.xml as a flat URL list."""
from __future__ import annotations

from ..domain.entities import SitemapEntry
from ..domain.ports import SitemapReader
from .errors import ServiceError


class SitemapService:
    def __init__(self, reader: SitemapReader):
        self.reader = reader

    def tree(self, url: str) -> list[SitemapEntry]:
        if not (url or "").strip():
            raise ServiceError("url required")
        return self.reader.read(url)
