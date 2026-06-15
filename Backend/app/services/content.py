"""HTML content extraction for deep page comparison.

Stdlib-only (`html.parser`) so there's no extra dependency to install in the
Docker image, and it runs in tests without network. Pulls title / h1 / meta,
normalized body text, images, and internal links out of a page's HTML.
"""
from __future__ import annotations

import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

import httpx

_SKIP = {"script", "style", "noscript", "template", "svg"}
_WS = re.compile(r"\s+")


def _norm(s: str) -> str:
    return _WS.sub(" ", s or "").strip()


class _PageParser(HTMLParser):
    """Collect the bits we compare. First <title> and first <h1> only."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title: list[str] = []
        self.h1: list[str] = []
        self.text: list[str] = []
        self.images: list[str] = []
        self.links: list[str] = []
        self.meta: dict[str, str] = {}
        self._in_title = False
        self._in_h1 = False
        self._h1_done = False
        self._skip = 0

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in _SKIP:
            self._skip += 1
            return
        if tag == "title":
            self._in_title = True
        elif tag == "h1" and not self._h1_done:
            self._in_h1 = True
        elif tag == "img":
            if a.get("src"):
                self.images.append(a["src"])
        elif tag == "a":
            if a.get("href"):
                self.links.append(a["href"])
        elif tag == "meta":
            name = (a.get("name") or "").strip().lower()
            prop = (a.get("property") or "").strip().lower()
            content = (a.get("content") or "").strip()
            if content and name == "description":
                self.meta["description"] = content
            elif content and prop == "og:title":
                self.meta["og:title"] = content
            elif content and prop == "og:image":
                self.meta["og:image"] = content
        elif tag == "link":
            rel = (a.get("rel") or "").strip().lower()
            if "canonical" in rel and a.get("href"):
                self.meta["canonical"] = a["href"].strip()

    def handle_startendtag(self, tag, attrs):  # self-closing <img/> <meta/> <link/>
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in _SKIP and self._skip:
            self._skip -= 1
            return
        if tag == "title":
            self._in_title = False
        elif tag == "h1" and self._in_h1:
            self._in_h1 = False
            self._h1_done = True

    def handle_data(self, data):
        if self._skip:
            return
        if self._in_title:
            self.title.append(data)
        if self._in_h1:
            self.h1.append(data)
        s = data.strip()
        if s:
            self.text.append(s)


def extract(html: str, base_url: str) -> dict:
    """Parse a page's HTML into the comparable fields (URLs resolved absolute)."""
    p = _PageParser()
    try:
        p.feed(html)
    except Exception:  # malformed HTML — keep whatever we got
        pass
    host = urlsplit(base_url).netloc

    images, seen = [], set()
    for s in p.images:
        u = urljoin(base_url, s)
        if u.startswith("http") and u not in seen:
            seen.add(u)
            images.append(u)

    links, lseen = [], set()
    for h in p.links:
        if h.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
            continue
        u = urljoin(base_url, h)
        if u.startswith("http") and urlsplit(u).netloc == host and u not in lseen:
            lseen.add(u)
            links.append(u)

    text = _norm(" ".join(p.text))   # original case (lowercased only where needed for sim)
    return {
        "title": _norm(" ".join(p.title)),
        "h1": _norm(" ".join(p.h1)),
        "meta": p.meta,
        "text": text,
        "words": len(text.split()),
        "images": images,
        "links": links,
    }


def embeddable(headers) -> bool:
    """Can this response be shown in a cross-origin <iframe>? Reads X-Frame-Options
    and CSP frame-ancestors. Conservative: a specific (non-wildcard) allowlist that
    won't include our dev origin counts as blocked."""
    xfo = (headers.get("x-frame-options", "") or "").lower()
    if "deny" in xfo or "sameorigin" in xfo:
        return False
    csp = (headers.get("content-security-policy", "") or "").lower()
    if "frame-ancestors" in csp:
        part = csp.split("frame-ancestors", 1)[1].split(";", 1)[0]
        if "'none'" in part or "*" not in part:
            return False
    return True


async def fetch_page(client: httpx.AsyncClient, url: str) -> dict:
    """GET the full page and return extracted fields, or {ok: False, status} on miss."""
    try:
        resp = await client.get(url, follow_redirects=True)
    except httpx.HTTPError:
        return {"ok": False, "status": None}
    ctype = resp.headers.get("content-type", "").lower()
    if resp.status_code != 200 or "html" not in ctype:
        return {"ok": False, "status": resp.status_code, "embeddable": embeddable(resp.headers)}
    data = extract(resp.text, str(resp.url))
    data["ok"] = True
    data["status"] = resp.status_code
    data["embeddable"] = embeddable(resp.headers)
    return data
