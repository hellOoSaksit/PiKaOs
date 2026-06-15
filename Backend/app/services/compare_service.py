"""UAT vs Production comparison — sitemap URL coverage.

Production's sitemap is the source of truth for the "primary" URL set. For each
primary URL we domain-swap the origin onto the UAT base, probe both sides, and
classify the result (match / missing / broken / redirect). Optionally a UAT
sitemap is read too, to surface URLs that exist on UAT but not in Production.

HTTP concerns live in routers/compare.py; this module only knows about URLs and
status codes. It raises SitemapError (re-exported from .sitemap) which the
router maps to a 4xx/5xx.
"""
from __future__ import annotations

import asyncio
import difflib
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit, urlunsplit

import httpx

from ..config import settings
from ..schemas import CompareIn, CompareOut, CompareSummary, DeepBatchIn, DeepResult, RenderOut, UrlCheck
from .content import fetch_page
from .net_guard import BlockedURLError, assert_public_url, guarded_event_hooks
from .sitemap import SitemapError, fetch_sitemap_urls

__all__ = [
    "compare", "deep_batch", "render_page", "SitemapError", "BlockedURLError",
    "swap_origin", "default_sitemap_url",
]

_HEAD_RE = re.compile(r"<head[^>]*>", re.IGNORECASE)

# browser-ish UA — some CDNs 403 the default httpx agent
_HEADERS = {"User-Agent": "PiKaOs-SiteCompare/1.0 (+https://pikaos.local)"}


def _make_client(*, follow_redirects: bool, limits: httpx.Limits | None = None) -> httpx.AsyncClient:
    """Build an httpx client for the compare path with the SSRF guard attached
    (the guard fires on every request incl. redirects — see net_guard)."""
    kwargs = dict(
        headers=_HEADERS,
        timeout=httpx.Timeout(settings.compare_timeout_seconds),
        follow_redirects=follow_redirects,
        event_hooks=guarded_event_hooks(),
    )
    if limits is not None:  # else httpx uses its default Limits (as render_page did before)
        kwargs["limits"] = limits
    return httpx.AsyncClient(**kwargs)


def _origin(url: str) -> tuple[str, str]:
    """Return (scheme, netloc) for a base URL."""
    parts = urlsplit(str(url))
    return parts.scheme, parts.netloc


def swap_origin(url: str, base_scheme: str, base_netloc: str) -> str:
    """Replace a URL's scheme+host with the target base, keeping path/query/fragment.

    This is the "domain swap" that maps a Production URL onto its UAT twin.
    """
    p = urlsplit(url)
    return urlunsplit((base_scheme, base_netloc, p.path or "/", p.query, ""))


def default_sitemap_url(prod_base: str) -> str:
    """`<prodBase>/sitemap.xml` — the conventional primary URL source."""
    scheme, netloc = _origin(prod_base)
    return urlunsplit((scheme, netloc, "/sitemap.xml", "", ""))


def _rel_key(url: str) -> str:
    """Path + query, origin-independent — used to compare URL *sets* across hosts."""
    p = urlsplit(url)
    return (p.path or "/") + (("?" + p.query) if p.query else "")


async def _probe(client: httpx.AsyncClient, url: str) -> int | None:
    """Return the HTTP status for `url`, or None if the request failed.

    Tries HEAD first (cheap); falls back to GET when HEAD is unsupported (405/501).
    Redirects are NOT followed so 3xx is visible in coverage.
    """
    try:
        resp = await client.head(url)
        if resp.status_code in (405, 501) or (resp.status_code >= 400 and resp.status_code != 404):
            resp = await client.get(url)
        return resp.status_code
    except httpx.HTTPError:
        try:
            resp = await client.get(url)
            return resp.status_code
        except httpx.HTTPError:
            return None


def _classify(prod_status: int | None, uat_status: int | None) -> tuple[str, str | None]:
    """Decide the coverage state for one URL pair."""
    prod_ok = prod_status is not None and 200 <= prod_status < 400
    if not prod_ok:
        return "prod_error", f"Production returned {prod_status}" if prod_status else "Production unreachable"
    if uat_status is None:
        return "error", "UAT unreachable"
    if uat_status == 404:
        return "missing_on_uat", "404 on UAT"
    if 300 <= uat_status < 400:
        return "redirect", f"UAT redirects ({uat_status})"
    if uat_status >= 400:
        return "broken_on_uat", f"UAT returned {uat_status}"
    return "match", None


def _ok(status: int | None) -> bool:
    return status is not None and 200 <= status < 400


async def _deep_compare(client: httpx.AsyncClient, src_url: str, tgt_url: str) -> DeepResult:
    """Fetch both pages and compare title/h1/meta/body + image & link existence."""
    src, tgt = await asyncio.gather(fetch_page(client, src_url), fetch_page(client, tgt_url))
    if not (src.get("ok") and tgt.get("ok")):
        return DeepResult(deepState="unfetchable")

    title_match = src["title"] == tgt["title"]
    h1_match = src["h1"] == tgt["h1"]
    meta_keys = set(src["meta"]) | set(tgt["meta"])
    meta_diff = sorted(k for k in meta_keys if src["meta"].get(k) != tgt["meta"].get(k))
    body_sim = difflib.SequenceMatcher(None, src["text"].lower(), tgt["text"].lower()).ratio()

    # image presence on the TARGET page (just 200/404, capped)
    imgs = tgt["images"][: settings.compare_deep_img_cap]
    img_status = await asyncio.gather(*(_probe(client, u) for u in imgs)) if imgs else []
    missing_imgs = [u for u, s in zip(imgs, img_status) if not _ok(s)]

    # internal-link presence on the TARGET page (capped)
    links = tgt["links"][: settings.compare_deep_link_cap]
    link_status = await asyncio.gather(*(_probe(client, u) for u in links)) if links else []
    broken_links = sum(1 for s in link_status if not _ok(s))

    issues = []
    if not title_match or not h1_match or meta_diff:
        issues.append("meta_diff")
    if body_sim < settings.compare_body_sim_threshold:
        issues.append("content_diff")
    if missing_imgs:
        issues.append("images_missing")
    if broken_links:
        issues.append("links_broken")
    state = "identical" if not issues else (issues[0] if len(issues) == 1 else "mixed")

    cap = settings.compare_deep_text_chars
    return DeepResult(
        deepState=state,
        titleMatch=title_match, h1Match=h1_match,
        srcTitle=src["title"][:300] or None, tgtTitle=tgt["title"][:300] or None,
        srcH1=src["h1"][:300] or None, tgtH1=tgt["h1"][:300] or None,
        srcMeta=src["meta"], tgtMeta=tgt["meta"],
        srcText=src["text"][:cap] or None, tgtText=tgt["text"][:cap] or None,
        srcEmbeddable=src.get("embeddable"), tgtEmbeddable=tgt.get("embeddable"),
        bodySim=round(body_sim, 4), wordDelta=tgt["words"] - src["words"], metaDiff=meta_diff,
        imagesChecked=len(imgs), imagesMissing=len(missing_imgs), imagesMissingUrls=missing_imgs[:20],
        linksChecked=len(links), linksBroken=broken_links,
    )


async def render_page(url: str, *, _client: httpx.AsyncClient | None = None) -> RenderOut:
    """Fetch a page's HTML so the client can show it in a SAME-ORIGIN sandboxed
    `<iframe srcdoc>` — the way to preview sites that block cross-origin framing
    via X-Frame-Options / CSP (those headers only block *framing the document*,
    not us GETting it server-side and re-serving the markup).

    We inject a `<base href>` of the final URL so the page's relative CSS/images
    resolve to the real origin and it renders styled. The client sandboxes the
    iframe (no scripts), so this is a static snapshot of the server HTML — which
    is exactly what the deep comparison is about.
    """
    own_client = _client is None
    if own_client:
        assert_public_url(str(url))  # hard-reject internal targets up front (router → 400)
    client = _client or _make_client(follow_redirects=True)
    try:
        try:
            resp = await client.get(str(url), follow_redirects=True)
        except httpx.HTTPError as exc:
            return RenderOut(ok=False, finalUrl=str(url), reason=str(exc) or type(exc).__name__)
        final = str(resp.url)
        ctype = resp.headers.get("content-type", "").lower()
        if resp.status_code != 200 or "html" not in ctype:
            return RenderOut(ok=False, status=resp.status_code, finalUrl=final,
                             reason=f"status {resp.status_code}, type {ctype or 'unknown'}")
        html = resp.text[: settings.compare_render_max_chars]
        # inject our <base> FIRST in <head> so it wins over any page <base>; add a
        # charset guard for pages that only declared encoding via HTTP headers.
        inject = f'<base href="{final}"><meta charset="utf-8">'
        if _HEAD_RE.search(html):
            html = _HEAD_RE.sub(lambda m: m.group(0) + inject, html, count=1)
        else:
            html = inject + html
        return RenderOut(ok=True, status=resp.status_code, finalUrl=final, html=html)
    finally:
        if own_client:
            await client.aclose()


async def deep_batch(payload: DeepBatchIn, *, _client: httpx.AsyncClient | None = None) -> list[DeepResult]:
    """Deep-compare a small batch of page pairs — lets the client stream sets so no
    single request runs long enough to hit the dev-proxy timeout."""
    ceiling = settings.compare_max_concurrency
    own_client = _client is None
    client = _client or _make_client(
        follow_redirects=False,
        limits=httpx.Limits(max_connections=ceiling * 2 + 10, max_keepalive_connections=ceiling),
    )
    sem = asyncio.Semaphore(max(1, min(len(payload.pairs), settings.compare_deep_concurrency)))

    async def one(p) -> DeepResult:
        async with sem:
            return await _deep_compare(client, str(p.src), str(p.tgt))

    try:
        return list(await asyncio.gather(*(one(p) for p in payload.pairs)))
    finally:
        if own_client:
            await client.aclose()


async def compare(payload: CompareIn, *, _client: httpx.AsyncClient | None = None) -> CompareOut:
    """Run the full UAT-vs-Production sitemap coverage comparison.

    `_client` lets tests inject an httpx.AsyncClient backed by a MockTransport so the
    whole flow runs without real network; in production it's created here.
    """
    prod_base = str(payload.prodBase)
    uat_base = str(payload.uatBase)
    sitemap_url = str(payload.sitemapUrl) if payload.sitemapUrl else default_sitemap_url(prod_base)
    max_urls = payload.maxUrls or settings.compare_max_urls
    uat_scheme, uat_netloc = _origin(uat_base)

    own_client = _client is None
    if own_client:
        # hard-reject internal targets in user-supplied bases/sitemaps up front (router → 400);
        # the per-request guard hook still covers redirects + URLs pulled from the sitemap.
        assert_public_url(prod_base)
        assert_public_url(uat_base)
        assert_public_url(sitemap_url)
        if payload.uatSitemapUrl:
            assert_public_url(str(payload.uatSitemapUrl))

    # Connection pool is sized to the hard ceiling (each URL probes prod + uat).
    ceiling = settings.compare_max_concurrency
    limits = httpx.Limits(max_connections=ceiling * 2 + 10, max_keepalive_connections=ceiling)
    client = _client or _make_client(follow_redirects=False, limits=limits)
    try:
        prod_urls = await fetch_sitemap_urls(client, sitemap_url, max_urls=max_urls)

        # Default: fire EVERY sitemap URL simultaneously. A request may cap it lower
        # via `concurrency`; we never exceed the ceiling regardless.
        requested = payload.concurrency or len(prod_urls) or 1
        effective = max(1, min(requested, ceiling))
        sem = asyncio.Semaphore(effective)

        async def check(prod_url: str) -> UrlCheck:
            uat_url = swap_origin(prod_url, uat_scheme, uat_netloc)
            async with sem:
                prod_status, uat_status = await asyncio.gather(
                    _probe(client, prod_url), _probe(client, uat_url)
                )
            state, note = _classify(prod_status, uat_status)
            return UrlCheck(
                path=_rel_key(prod_url),
                prodUrl=prod_url,
                uatUrl=uat_url,
                prodStatus=prod_status,
                uatStatus=uat_status,
                state=state,
                note=note,
            )

        items = await asyncio.gather(*(check(u) for u in prod_urls))

        # deep mode: body/title/meta/image/link compare for the first N reachable pages
        if payload.deep:
            deep_limit = min(payload.deepLimit or settings.compare_deep_limit, settings.compare_deep_max_limit)
            targets = [it for it in items if it.state in ("match", "redirect")][:deep_limit]
            deep_sem = asyncio.Semaphore(max(1, min(effective, settings.compare_deep_concurrency)))

            async def deep_one(it: UrlCheck) -> None:
                async with deep_sem:
                    it.deep = await _deep_compare(client, it.prodUrl, it.uatUrl)

            await asyncio.gather(*(deep_one(it) for it in targets))

        # optional: UAT-only ("extra") URLs not present in Production's sitemap
        extra_on_uat: list[str] = []
        if payload.uatSitemapUrl:
            try:
                uat_urls = await fetch_sitemap_urls(client, str(payload.uatSitemapUrl), max_urls=max_urls)
                prod_keys = {_rel_key(u) for u in prod_urls}
                extra_on_uat = sorted({u for u in uat_urls if _rel_key(u) not in prod_keys})
            except SitemapError:
                extra_on_uat = []  # UAT sitemap is best-effort; don't fail the whole run
    finally:
        if own_client:
            await client.aclose()

    summary = CompareSummary(total=len(items), extra_on_uat=len(extra_on_uat))
    for it in items:
        setattr(summary, it.state, getattr(summary, it.state) + 1)
        if it.deep:
            summary.deep_compared += 1
            if it.deep.deepState != "identical":
                summary.deep_diff += 1

    return CompareOut(
        prodBase=prod_base,
        uatBase=uat_base,
        sitemapUrl=sitemap_url,
        generatedAt=datetime.now(timezone.utc),
        summary=summary,
        items=items,
        extraOnUat=extra_on_uat,
    )
