"""FallbackCrawler decision logic — uses fakes, never launches a browser."""
from app.domain.entities import CrawlResult, PageTerm
from app.domain.ports import CrawlError
from app.infrastructure import fallback_crawler as fc
from app.infrastructure.fallback_crawler import FallbackCrawler


class _Base:
    def __init__(self, result=None, error=None):
        self._result, self._error = result, error

    def fetch_and_extract(self, url, bypass_popup, deep=False):
        if self._error:
            raise self._error
        return self._result


class _Renderer:
    def __init__(self, html=None):
        self._html = html

    def render(self, url):
        return ("https://x/", self._html) if self._html is not None else None


def _terms(n):
    return [PageTerm(f"t{i}", "<nav>", "/") for i in range(n)]


def test_static_rich_skips_render(monkeypatch):
    monkeypatch.setattr(fc.settings, "crawl_min_terms", 8)
    base = _Base(CrawlResult("https://x/", _terms(10), rendered=False))
    out = FallbackCrawler(base, _Renderer(html="<a>r</a>")).fetch_and_extract("x", True)
    assert out.rendered is False and len(out.page_terms) == 10


def test_thin_static_triggers_render(monkeypatch):
    monkeypatch.setattr(fc.settings, "crawl_min_terms", 8)
    monkeypatch.setattr(fc.settings, "crawl_render_enabled", True)
    # rendered HTML yields more nav links than the thin static pass
    html = "<html><body><nav>" + "".join(f'<a href="/p{i}">link{i}</a>' for i in range(12)) + "</nav></body></html>"
    base = _Base(CrawlResult("https://x/", _terms(2), rendered=False))
    out = FallbackCrawler(base, _Renderer(html=html)).fetch_and_extract("x", True)
    assert out.rendered is True and len(out.page_terms) >= 2


def test_fetch_error_then_render(monkeypatch):
    monkeypatch.setattr(fc.settings, "crawl_render_enabled", True)
    html = "<html><body><h1>Hello</h1></body></html>"
    base = _Base(error=CrawlError("HTTP 403", 403))
    out = FallbackCrawler(base, _Renderer(html=html)).fetch_and_extract("x", True)
    assert out.rendered is True


def test_fetch_error_no_render_reraises(monkeypatch):
    monkeypatch.setattr(fc.settings, "crawl_render_enabled", True)
    base = _Base(error=CrawlError("HTTP 403", 403))
    try:
        FallbackCrawler(base, _Renderer(html=None)).fetch_and_extract("x", True)
        assert False, "expected CrawlError"
    except CrawlError as e:
        assert e.status == 403
