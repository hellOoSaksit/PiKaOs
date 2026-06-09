"""Sitemap reader adapter (implements domain.ports.SitemapReader).

Discovers sitemaps from /sitemap.xml and robots.txt, follows one level of
sitemap-index nesting, and flattens every <loc> into SitemapEntry rows."""
from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

import httpx

from ..config import get_settings
from ..domain.entities import SitemapEntry
from .crawler import _path_depth, _slug_term, normalize_url

settings = get_settings()

_LOC = re.compile(r"<loc>\s*([^<]+?)\s*</loc>", re.I)
_ROBOTS_SM = re.compile(r"(?im)^\s*sitemap:\s*(\S+)")

_MAX_SITEMAPS = 60     # how many sitemap files to fetch (index can fan out)
_MAX_URLS = 3000       # overall cap on collected page URLs


class HttpxSitemapReader:
    def read(self, url: str) -> list[SitemapEntry]:
        origin = self._origin(url)
        seeds = self._discover(origin)
        locs = self._collect(seeds)

        entries: list[SitemapEntry] = []
        seen: set[str] = set()
        for loc in locs:
            path = urlparse(loc).path or "/"
            if path in seen:
                continue
            seen.add(path)
            entries.append(SitemapEntry(loc=loc, path=path, slug=_slug_term(path), depth=_path_depth(path)))
        entries.sort(key=lambda e: e.path)
        return entries

    @staticmethod
    def _origin(url: str) -> str:
        p = urlparse(normalize_url(url))
        return f"{p.scheme}://{p.netloc}"

    def _discover(self, origin: str) -> list[str]:
        seeds = [urljoin(origin + "/", "sitemap.xml")]
        headers = {"User-Agent": settings.crawl_user_agent}
        try:
            r = httpx.get(urljoin(origin + "/", "robots.txt"), timeout=settings.crawl_timeout,
                          headers=headers, follow_redirects=True)
            if r.status_code == 200:
                seeds.extend(m.strip() for m in _ROBOTS_SM.findall(r.text))
        except httpx.HTTPError:
            pass
        return list(dict.fromkeys(seeds))  # dedup, keep order

    def _collect(self, seeds: list[str]) -> list[str]:
        out: list[str] = []
        visited: set[str] = set()
        queue = list(seeds)
        fetched = 0
        headers = {"User-Agent": settings.crawl_user_agent}
        with httpx.Client(follow_redirects=True, timeout=settings.crawl_timeout, headers=headers) as c:
            while queue and len(out) < _MAX_URLS and fetched < _MAX_SITEMAPS:
                sm = queue.pop(0)
                if sm in visited:
                    continue
                visited.add(sm)
                fetched += 1
                try:
                    r = c.get(sm)
                    if r.status_code != 200:
                        continue
                    text = r.text
                except httpx.HTTPError:
                    continue
                locs = [loc.strip() for loc in _LOC.findall(text)]
                if "<sitemapindex" in text.lower():  # children are more sitemaps
                    for loc in locs:
                        if loc not in visited:
                            queue.append(loc)
                else:
                    out.extend(locs)
        return out[:_MAX_URLS]
