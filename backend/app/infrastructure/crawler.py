"""lxml + httpx crawling primitives and the LxmlCrawler adapter.

`fetch` and `extract_terms` are module-level so the headless FallbackCrawler can
reuse the exact same extraction over browser-rendered HTML.
"""
from __future__ import annotations

import re
from urllib.parse import urljoin, urlparse, urlunparse

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


def _path_depth(path: str) -> int:
    """Number of path segments, ignoring a leading 2-letter locale (/th, /en).
    `/th/about-us` -> 1, `/th/about-us/news/mar-2568/x` -> 4."""
    segs = [s for s in (path or "").split("/") if s]
    if segs and len(segs[0]) == 2 and segs[0].isalpha():
        segs = segs[1:]
    return len(segs)


def _looks_like_popup(el) -> bool:
    attrs = " ".join(filter(None, [el.get("class", ""), el.get("id", ""), el.get("role", "")])).lower()
    return any(h in attrs for h in _POPUP_HINTS)


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if url and not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    return url


_LOCALES = {"th", "en", "zh", "ja", "ko"}


def candidate_urls(url: str, prefer: str | None = None) -> list[str]:
    """Ordered URLs to try, preferred locale first. For a path-based locale
    (/th/… → /en/…) or a bare host (→ host/en/), the preferred-locale variant
    comes first, then the original as fallback."""
    prefer = (prefer if prefer is not None else settings.crawl_prefer_lang or "").lower()
    base = normalize_url(url)
    if not prefer:
        return [base]
    p = urlparse(base)
    segs = p.path.split("/")
    out: list[str] = []
    for i, s in enumerate(segs):
        if s.lower() in _LOCALES:  # path-based locale → swap it
            if s.lower() != prefer:
                swapped = segs.copy()
                swapped[i] = prefer
                out.append(urlunparse(p._replace(path="/".join(swapped))))
            break
    else:  # no locale segment; for a bare root try /<prefer>/ first
        if p.path in ("", "/"):
            out.append(urlunparse(p._replace(path=f"/{prefer}/")))
    out.append(base)
    seen: set[str] = set()
    return [u for u in out if not (u in seen or seen.add(u))]


_404_URL = re.compile(r"/(404|not-found|page-not-found|error)(\.\w+|/|$)", re.I)
_404_TITLE = re.compile(r"\b404\b|not[ -]?found|page not found|ไม่พบหน้า|ไม่พบ", re.I)


def _looks_404(final_url: str, html: str) -> bool:
    """Detect soft-404s (a 'not found' page served with HTTP 200) so an EN
    variant that doesn't really exist falls back to the original locale."""
    if _404_URL.search(final_url):
        return True
    m = re.search(r"<title[^>]*>(.*?)</title>", html, re.I | re.S)
    return bool(m and _404_TITLE.search(m.group(1)))


def fetch(url: str) -> tuple[str, str]:
    """Fetch HTML, preferring the configured locale (EN) and falling back to the
    original URL (incl. on soft-404). Returns (final_url, html)."""
    headers = {"User-Agent": settings.crawl_user_agent, "Accept-Language": "en-US,en;q=0.9,th;q=0.8"}
    cands = candidate_urls(url)
    last: CrawlError | None = None
    with httpx.Client(follow_redirects=True, timeout=settings.crawl_timeout, headers=headers) as c:
        for idx, cand in enumerate(cands):
            try:
                r = c.get(cand)
                r.raise_for_status()
            except httpx.HTTPStatusError as e:
                last = CrawlError(f"HTTP {e.response.status_code}", e.response.status_code)
                continue
            except httpx.HTTPError as e:
                last = CrawlError(type(e).__name__)
                continue
            # reject a soft-404 EN variant only if a fallback candidate remains
            if idx < len(cands) - 1 and _looks_404(str(r.url), r.text):
                last = CrawlError("soft 404")
                continue
            return str(r.url), r.text
    raise last or CrawlError("fetch failed")


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

    # primary: navigation menu items. Mega-menus dump the whole site tree into
    # the markup, so in nav mode keep only shallow section paths (top-level IA);
    # deep links (news articles, individual people, sub-pages) are dropped.
    for a in doc.xpath(_NAV_XPATH):
        path = _path_of(a.get("href", ""), final_url)
        if not deep and _path_depth(path) > settings.crawl_nav_max_depth:
            continue
        push(a.text_content(), "<nav>", path)

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

    sitemap_terms = _try_sitemap(final_url)
    if not deep:  # sitemap.xml also lists every article — keep only shallow IA
        sitemap_terms = [pt for pt in sitemap_terms if _path_depth(pt.ev_path) <= settings.crawl_nav_max_depth]
    for pt in sitemap_terms:
        push(pt.text, pt.ev_tag, pt.ev_path)

    return terms[: settings.crawl_max_terms]


class LxmlCrawler:
    """Static HTTP + lxml crawler (no JS execution)."""

    def fetch_and_extract(self, url: str, bypass_popup: bool, deep: bool = False) -> CrawlResult:
        final_url, html_text = fetch(url)
        return CrawlResult(final_url, extract_terms(final_url, html_text, bypass_popup, deep), rendered=False)
