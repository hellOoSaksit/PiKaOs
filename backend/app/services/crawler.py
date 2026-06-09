"""Fetch a URL with httpx and extract candidate "page terms" using lxml.

A page term is any short, human-readable label that could correspond to a
sitemap entry: nav/menu links, headings (h1–h3), the <title>, breadcrumb text,
and <loc> entries from a linked sitemap.xml. Each term keeps provenance
(evTag = where it came from, evPath = the path it points to) so the report can
link back to evidence.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from urllib.parse import urljoin, urlparse

import httpx
from lxml import html as lxml_html

from ..config import get_settings

settings = get_settings()

# Common popup / consent containers to drop before extracting text.
_POPUP_HINTS = ("cookie", "consent", "gdpr", "popup", "modal", "overlay",
                "paywall", "newsletter", "subscribe", "age-gate", "banner")

_WS = re.compile(r"\s+")


@dataclass
class PageTerm:
    text: str
    ev_tag: str   # <nav>, <h1>, <title>, sitemap.xml, breadcrumb, link
    ev_path: str  # path/url the term points at (best effort)


def _clean(s: str) -> str:
    return _WS.sub(" ", (s or "")).strip()


def _path_of(href: str, base: str) -> str:
    if not href:
        return "/"
    try:
        full = urljoin(base, href)
        p = urlparse(full).path or "/"
        return p
    except Exception:
        return "/"


def _looks_like_popup(el) -> bool:
    attrs = " ".join(filter(None, [el.get("class", ""), el.get("id", ""), el.get("role", "")])).lower()
    return any(h in attrs for h in _POPUP_HINTS)


def normalize_url(url: str) -> str:
    url = (url or "").strip()
    if not url:
        return url
    if not re.match(r"^https?://", url, re.I):
        url = "https://" + url
    return url


def fetch(url: str) -> tuple[str, str]:
    """Return (final_url, html_text). Raises httpx errors on failure."""
    url = normalize_url(url)
    headers = {"User-Agent": settings.crawl_user_agent, "Accept-Language": "th,en;q=0.8"}
    with httpx.Client(follow_redirects=True, timeout=settings.crawl_timeout, headers=headers) as c:
        r = c.get(url)
        r.raise_for_status()
        return str(r.url), r.text


def _try_sitemap(base_url: str) -> list[PageTerm]:
    """Best-effort sitemap.xml fetch -> <loc> paths as terms."""
    out: list[PageTerm] = []
    sm_url = urljoin(base_url, "/sitemap.xml")
    headers = {"User-Agent": settings.crawl_user_agent}
    try:
        with httpx.Client(follow_redirects=True, timeout=settings.crawl_timeout, headers=headers) as c:
            r = c.get(sm_url)
            if r.status_code != 200 or "xml" not in r.headers.get("content-type", ""):
                return out
            locs = re.findall(r"<loc>\s*([^<]+?)\s*</loc>", r.text, re.I)
            for loc in locs[:200]:
                path = urlparse(loc.strip()).path or "/"
                # last path segment as a readable-ish term
                seg = [s for s in path.split("/") if s]
                label = _clean(seg[-1].replace("-", " ").replace("_", " ")) if seg else "/"
                if label:
                    out.append(PageTerm(label, "sitemap.xml", path))
    except Exception:
        pass
    return out


def extract_terms(final_url: str, html_text: str, bypass_popup: bool = True) -> list[PageTerm]:
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
        t = _clean(text)
        if not t or len(t) > 80:
            return
        norm = t.lower()
        if norm in seen:
            return
        seen.add(norm)
        terms.append(PageTerm(t, tag, path))

    # <title>
    for t in doc.xpath("//title/text()"):
        push(t, "<title>", "/")

    # headings
    for level in ("h1", "h2", "h3"):
        for el in doc.xpath(f"//{level}"):
            push(el.text_content(), f"<{level}>", "/")

    # nav / menu / footer links
    link_scopes = doc.xpath(
        "//nav//a | //*[contains(@class,'menu')]//a | //*[contains(@class,'nav')]//a | //footer//a"
    )
    for a in link_scopes:
        push(a.text_content(), "<nav>", _path_of(a.get("href", ""), final_url))

    # breadcrumbs
    for a in doc.xpath("//*[contains(@class,'breadcrumb')]//a | //*[contains(@class,'breadcrumb')]//span"):
        push(a.text_content(), "breadcrumb", _path_of(a.get("href", ""), final_url))

    # generic anchors as a fallback (covers themes without semantic nav)
    if len(terms) < 20:
        for a in doc.xpath("//a[@href]"):
            push(a.text_content(), "link", _path_of(a.get("href", ""), final_url))
            if len(terms) >= settings.crawl_max_terms:
                break

    terms.extend(_try_sitemap(final_url))
    return terms[: settings.crawl_max_terms]
