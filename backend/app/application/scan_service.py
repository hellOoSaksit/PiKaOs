"""Use case: crawl a URL and match its terms against a category's vocabulary."""
from __future__ import annotations

from datetime import datetime, timezone

from ..domain.entities import ScanReport
from ..domain.policies import classify, score
from ..domain.ports import Crawler, CrawlError, Matcher, VocabRepository
from .errors import ServiceError


class ScanService:
    def __init__(self, repo: VocabRepository, crawler: Crawler, matcher: Matcher, unclear_band: int):
        self.repo = repo
        self.crawler = crawler
        self.matcher = matcher
        self.unclear_band = unclear_band

    def scan(self, url: str, category: str, pass_threshold: int, bypass_popup: bool, deep: bool = False) -> ScanReport:
        if self.repo.get_category(category) is None:
            raise ServiceError(f"category '{category}' not found", 404)

        vocab = self.repo.resolve_terms(category)
        if not vocab:
            raise ServiceError("category has no vocabulary terms")

        try:
            crawled = self.crawler.fetch_and_extract(url, bypass_popup, deep)
        except CrawlError as e:
            raise ServiceError(f"fetch failed: {e}", 502) from e

        confirmed = {t.id for t in vocab if t.confirmed}
        items = self.matcher.match(vocab, crawled.page_terms)
        for it in items:
            it.status = classify(it.conf, it.key in confirmed, pass_threshold, self.unclear_band)

        return ScanReport(
            url=crawled.final_url,
            category=category,
            scanned_at=datetime.now(timezone.utc),
            pass_threshold=pass_threshold,
            score=score([it.status for it in items]),
            items=items,
            page_terms_found=len(crawled.page_terms),
            rendered=crawled.rendered,
        )
