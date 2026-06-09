"""lxml + httpx crawling primitives and the LxmlCrawler adapter.

`fetch` and `extract_terms` are module-level so the headless FallbackCrawler can
reuse the exact same extraction over browser-rendered HTML.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse

import httpx
from lxml import html as lxml_html

from ..config import get_settings
from ..domain.entities import CrawlResult, PageTerm
from ..domain.ports import CrawlError

settings = get_settings()

_POPUP_HINTS = ("cookie", "consent", "gdpr", "popup", "modal", "overlay",
                "paywall", "newsletter", "subscribe", "age-gate", "banner")
_WS = re.compile(r"\s+")


def _clean(s: str) -> str:
    return _WS.sub(" ", (s or "")).strip()


def _path_of(href: str, base: str) -> str:
    if not href:
        return "/"
    try:
        return urlparse(urljoin(base, href)).path or "/"
    except Exception:
        return "/"


def _looks_like_popup(el) -> bool:
    attrs = " ".join(filter(None, [el.get("class", ""), el.get("id", ""), el.get("role", "")])).lower()
    return any(h in attrs for h in _POPUP_HINTS)


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if url and not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    return url


def fetch(url: str) -> tuple[str, str]:
    """Plain HTTP fetch. Returns (final_url, html). Raises CrawlError."""
    url = normalize_url(url)
    headers = {"User-Agent": settings.crawl_user_agent, "Accept-Language": "th,en;q=0.8"}
    try:
        with httpx.Client(follow_redirects=True, timeout=settings.crawl_timeout, headers=headers) as c:
            r = c.get(url)
            r.raise_for_status()
            return str(r.url), r.text
    except httpx.HTTPStatusError as e:
        raise CrawlError(f"HTTP {e.response.status_code}", e.response.status_code) from e
    except httpx.HTTPError as e:
        raise CrawlError(type(e).__name__) from e


def _try_sitemap(base_url: str) -> list[PageTerm]:
    out: list[PageTerm] = []
    sm_url = urljoin(base_url, "/sitemap.xml")
    headers = {"User-Agent": settings.crawl_user_agent}
    try:
        with httpx.Client(follow_redirects=True, timeout=settings.crawl_timeout, headers=headers) as c:
            r = c.get(sm_url)
            if r.status_code != 200 or "xml" not in r.headers.get("content-type", ""):
                return out
            for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", r.text, re.I)[:200]:
                path = urlparse(loc.strip()).path or "/"
                seg = [s for s in path.split("/") if s]
                label = _clean(seg[-1].replace("-", " ").replace("_", " ")) if seg else "/"
                if label:
                    out.append(PageTerm(label, "sitemap.xml", path))
    except Exception:
        pass
    return out


# navigation regions — the site's top-level sections (header/nav/menu/footer),
# NOT main-content headings or article links.
_NAV_XPATH = (
    "//header//a | //nav//a | //*[@role='navigation']//a"
    " | //*[contains(@class,'menu')]//a | //*[contains(@class,'nav')]//a"
    " | //*[contains(@class,'navbar')]//a | //footer//a"
)


def extract_terms(final_url: str, html_text: str, bypass_popup: bool, deep: bool = False) -> list[PageTerm]:
    """Extract candidate page terms from HTML.

    Default (nav-focused): the page title/h1 plus the navigation menu items —
    the site's top-level sections (About Us, Corporate Governance, …). This is
    what you match a sitemap vocabulary against.

    `deep=True` additionally pulls content headings (h2/h3), breadcrumbs and all
    anchors — useful to reach deep pages, but it also drags in article/news
    titles, so it's opt-in.
    """
    doc = lxml_html.fromstring(html_text)
    if bypass_popup:
        for el in doc.xpath("//*[@class or @id or @role]"):
            if _looks_like_popup(el):
                parent = el.getparent()
                if parent is not None:
                    parent.remove(el)

    terms: list[PageTerm] = []
    seen: set[str] = set()

    def push(text: str, tag: str, path: str):
        ttext = _clean(text)
        if not ttext or len(ttext) > 80:
            return
        norm = ttext.lower()
        if norm in seen:
            return
        seen.add(norm)
        terms.append(PageTerm(ttext, tag, path))

    # page identity
    for t in doc.xpath("//title/text()"):
        push(t, "<title>", "/")
    for el in doc.xpath("//h1"):
        push(el.text_content(), "<h1>", "/")

    # primary: navigation menu items
    for a in doc.xpath(_NAV_XPATH):
        push(a.text_content(), "<nav>", _path_of(a.get("href", ""), final_url))

    if deep:
        for level in ("h2", "h3"):
            for el in doc.xpath(f"//{level}"):
                push(el.text_content(), f"<{level}>", "/")
        for a in doc.xpath("//*[contains(@class,'breadcrumb')]//a | //*[contains(@class,'breadcrumb')]//span"):
            push(a.text_content(), "breadcrumb", _path_of(a.get("href", ""), final_url))
        for a in doc.xpath("//a[@href]"):
            push(a.text_content(), "link", _path_of(a.get("href", ""), final_url))
            if len(terms) >= settings.crawl_max_terms:
                break

    terms.extend(_try_sitemap(final_url))
    return terms[: settings.crawl_max_terms]


class LxmlCrawler:
    """Static HTTP + lxml crawler (no JS execution)."""

    def fetch_and_extract(self, url: str, bypass_popup: bool, deep: bool = False) -> CrawlResult:
        final_url, html_text = fetch(url)
        return CrawlResult(final_url, extract_terms(final_url, html_text, bypass_popup, deep), rendered=False)
