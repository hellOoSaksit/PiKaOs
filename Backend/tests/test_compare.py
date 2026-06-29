"""Tests for the UAT-vs-Production compare module.

The pure logic (domain swap, sitemap parsing, classification) is tested directly
— no network or server needed. One live-server test confirms the endpoint is
auth-gated (401 happens before any external fetch).

    docker compose exec backend pytest tests/test_compare.py
"""
from __future__ import annotations

import asyncio
import os

import httpx
import pytest

from app.schemas import CompareAuth, CompareIn, CoverageBatchIn, CoveragePair, CoveragePlanIn, DeepBatchIn
from app.plugins.compare import service as cs
from app.plugins.compare.service import _classify, _make_client, default_sitemap_url, swap_origin
from app.plugins.compare.content import embeddable, extract
from app.plugins.compare.sitemap import SitemapError, parse_sitemap_xml

BASE = os.environ.get("TEST_BASE_URL", "http://localhost:8000")


# --- domain swap (Production URL -> UAT twin) ------------------------------

def test_swap_origin_keeps_path_and_query():
    out = swap_origin("https://www.example.com/a/b?x=1#frag", "https", "uat.example.com")
    assert out == "https://uat.example.com/a/b?x=1"


def test_swap_origin_handles_root():
    assert swap_origin("https://www.example.com", "https", "uat.example.com") == "https://uat.example.com/"


def test_swap_origin_can_change_scheme_and_port():
    out = swap_origin("https://www.example.com/p", "http", "uat.example.com:8080")
    assert out == "http://uat.example.com:8080/p"


def test_default_sitemap_url():
    assert default_sitemap_url("https://www.example.com/anything") == "https://www.example.com/sitemap.xml"


# --- sitemap parsing -------------------------------------------------------

URLSET = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.example.com/</loc></url>
  <url><loc>https://www.example.com/about</loc></url>
</urlset>"""

SITEMAPINDEX = """<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://www.example.com/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://www.example.com/sitemap-2.xml</loc></sitemap>
</sitemapindex>"""


def test_parse_urlset_returns_pages():
    pages, children = parse_sitemap_xml(URLSET)
    assert pages == ["https://www.example.com/", "https://www.example.com/about"]
    assert children == []


def test_parse_sitemapindex_returns_children():
    pages, children = parse_sitemap_xml(SITEMAPINDEX)
    assert pages == []
    assert children == [
        "https://www.example.com/sitemap-1.xml",
        "https://www.example.com/sitemap-2.xml",
    ]


def test_parse_invalid_xml_raises():
    with pytest.raises(SitemapError):
        parse_sitemap_xml("<not-xml")


# --- coverage classification ----------------------------------------------

@pytest.mark.parametrize(
    "prod,uat,state",
    [
        (200, 200, "match"),
        (200, 404, "missing_on_uat"),
        (200, 301, "redirect"),
        (200, 500, "broken_on_uat"),
        (200, None, "error"),
        (404, 200, "prod_error"),
        (None, 200, "prod_error"),
    ],
)
def test_classify(prod, uat, state):
    assert _classify(prod, uat)[0] == state


# --- login-gated sites: per-host auth wiring -------------------------------

def _flow_headers(host_auth, url):
    """Headers an httpx request would carry after _HostAuth's auth_flow runs."""
    gen = cs._HostAuth(host_auth).auth_flow(httpx.Request("GET", url))
    return next(gen).headers


def test_host_auth_basic_for_matching_host():
    h = _flow_headers({"prod.example.com": CompareAuth(username="u", password="p")}, "https://prod.example.com/x")
    assert h.get("Authorization", "").startswith("Basic ")


def test_host_auth_custom_header_for_matching_host():
    h = _flow_headers({"uat.example.com": CompareAuth(headerName="Cookie", headerValue="s=1")}, "https://uat.example.com/x")
    assert h.get("Cookie") == "s=1"


def test_host_auth_isolates_credentials_by_host():
    only_prod = {"prod.example.com": CompareAuth(username="u", password="p")}
    # a request to the OTHER host gets nothing — creds never leak across origins
    assert "Authorization" not in _flow_headers(only_prod, "https://uat.example.com/x")
    # an all-empty map is falsy, so _make_client attaches no auth
    assert not cs._HostAuth({})
    assert not cs._HostAuth({"h": None})


def test_make_client_attaches_host_auth():
    async def go():
        c = _make_client(follow_redirects=False,
                         host_auth={"prod.example.com": CompareAuth(username="u", password="p")})
        try:
            assert c.auth is not None     # _HostAuth attached as the client auth
        finally:
            await c.aclose()
        c2 = _make_client(follow_redirects=False, host_auth={"h": None})
        try:
            assert c2.auth is None        # no creds → no auth
        finally:
            await c2.aclose()
    asyncio.run(go())


# --- cancel: client abort stops the in-flight run --------------------------
# _run_cancellable cancels the work the moment the client disconnects, so an
# aborted compare's outbound fetches actually stop instead of running to the end.

class _FakeRequest:
    """Minimal Request stand-in: reports disconnected after `after` polls."""
    def __init__(self, after: int = 0):
        self._after, self._n = after, 0

    async def is_disconnected(self) -> bool:
        self._n += 1
        return self._n > self._after


def test_run_cancellable_cancels_coro_on_disconnect():
    from fastapi import HTTPException
    from app.plugins.compare.router import CLIENT_CLOSED, _run_cancellable

    observed = {"cancelled": False}

    async def slow():
        try:
            await asyncio.sleep(5)            # would outlast the test if not cancelled
            return "done"
        except asyncio.CancelledError:
            observed["cancelled"] = True       # the outbound work sees the cancel and stops
            raise

    async def go():
        try:
            await _run_cancellable(_FakeRequest(after=0), slow())
            return None
        except HTTPException as exc:
            return exc.status_code

    code = asyncio.run(go())
    assert code == CLIENT_CLOSED               # → 499, client gone
    assert observed["cancelled"] is True       # the running coroutine was actually cancelled


def test_run_cancellable_returns_result_when_connected():
    from app.plugins.compare.router import _run_cancellable

    async def work():
        return "ok"

    # never disconnects → result passes through untouched
    assert asyncio.run(_run_cancellable(_FakeRequest(after=10_000), work())) == "ok"


# --- full flow over a mocked network (httpx.MockTransport) -----------------
# These run anywhere (no server, no internet, no pytest-asyncio) by driving the
# async compare() through asyncio.run with an injected mock-backed client.

PROD_SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.example.com/</loc></url>
  <url><loc>https://www.example.com/about</loc></url>
  <url><loc>https://www.example.com/gone</loc></url>
</urlset>"""

UAT_SITEMAP = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://uat.example.com/</loc></url>
  <url><loc>https://uat.example.com/about</loc></url>
  <url><loc>https://uat.example.com/uat-only</loc></url>
</urlset>"""

PAYLOAD = CompareIn(
    prodBase="https://www.example.com",
    uatBase="https://uat.example.com",
    sitemapUrl="https://www.example.com/sitemap.xml",
    uatSitemapUrl="https://uat.example.com/sitemap.xml",
)


def _site_handler(request: httpx.Request) -> httpx.Response:
    host, path = request.url.host, request.url.path
    if path == "/sitemap.xml":
        if host == "www.example.com":
            return httpx.Response(200, text=PROD_SITEMAP)
        if host == "uat.example.com":
            return httpx.Response(200, text=UAT_SITEMAP)
        return httpx.Response(404)
    # page probes: /gone is 404 on UAT, everything else is 200
    if host == "uat.example.com" and path == "/gone":
        return httpx.Response(404)
    return httpx.Response(200)


def _run_compare(payload, handler):
    async def go():
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            return await cs.compare(payload, _client=client)
    return asyncio.run(go())


def test_compare_mock_coverage_and_extras():
    res = _run_compare(PAYLOAD, _site_handler)
    assert res.summary.total == 3
    assert res.summary.match == 2            # / and /about
    assert res.summary.missing_on_uat == 1   # /gone (404 on UAT)
    gone = next(i for i in res.items if i.path == "/gone")
    assert gone.state == "missing_on_uat" and gone.uatStatus == 404
    # UAT sitemap has an extra page not in Production
    assert res.extraOnUat == ["https://uat.example.com/uat-only"]
    assert res.summary.extra_on_uat == 1


def test_compare_mock_concurrency_cap_is_respected():
    # one URL → effective concurrency clamps to 1, still completes
    res = _run_compare(
        CompareIn(prodBase="https://www.example.com", uatBase="https://uat.example.com",
                  sitemapUrl="https://www.example.com/sitemap.xml", concurrency=1),
        _site_handler,
    )
    assert res.summary.total == 3


def test_compare_mock_sitemap_error_raises():
    res = lambda req: httpx.Response(500)  # noqa: E731 — every fetch fails
    with pytest.raises(SitemapError):
        _run_compare(PAYLOAD, res)


def test_compare_mock_sitemap_connect_error_is_informative():
    # str(ConnectError("")) is empty — the message must still name the URL + type
    def boom(request):
        raise httpx.ConnectError("")
    with pytest.raises(SitemapError) as ei:
        _run_compare(PAYLOAD, boom)
    msg = str(ei.value)
    assert "www.example.com/sitemap.xml" in msg
    assert "ConnectError" in msg


# --- streamed coverage: plan (read sitemap) + batch (probe a chunk) --------
# The plan/batch split lets the client stream a big sitemap so no single request
# overruns the dev-proxy timeout. Same mock site as the full-compare tests above.

def _run_plan(payload, handler):
    async def go():
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            return await cs.coverage_plan(payload, _client=client)
    return asyncio.run(go())


def _run_cov_batch(payload, handler):
    async def go():
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            return await cs.coverage_batch(payload, _client=client)
    return asyncio.run(go())


def test_coverage_plan_builds_pairs_and_extras():
    plan = _run_plan(
        CoveragePlanIn(prodBase="https://www.example.com", uatBase="https://uat.example.com",
                       sitemapUrl="https://www.example.com/sitemap.xml",
                       uatSitemapUrl="https://uat.example.com/sitemap.xml"),
        _site_handler,
    )
    assert len(plan.pairs) == 3
    assert {p.path for p in plan.pairs} == {"/", "/about", "/gone"}
    gone = next(p for p in plan.pairs if p.path == "/gone")
    assert str(gone.prodUrl) == "https://www.example.com/gone"
    assert str(gone.uatUrl) == "https://uat.example.com/gone"   # path swapped onto UAT host
    assert plan.extraOnUat == ["https://uat.example.com/uat-only"]


def test_coverage_plan_without_uat_sitemap_has_no_extras():
    plan = _run_plan(
        CoveragePlanIn(prodBase="https://www.example.com", uatBase="https://uat.example.com",
                       sitemapUrl="https://www.example.com/sitemap.xml"),
        _site_handler,
    )
    assert len(plan.pairs) == 3 and plan.extraOnUat == []


def test_coverage_batch_classifies_and_preserves_order():
    pairs = [
        CoveragePair(path="/", prodUrl="https://www.example.com/", uatUrl="https://uat.example.com/"),
        CoveragePair(path="/gone", prodUrl="https://www.example.com/gone", uatUrl="https://uat.example.com/gone"),
    ]
    results = _run_cov_batch(CoverageBatchIn(pairs=pairs), _site_handler)
    assert [r.path for r in results] == ["/", "/gone"]                       # aligned to input
    assert results[0].state == "match"
    assert results[1].state == "missing_on_uat" and results[1].uatStatus == 404


def test_coverage_plan_then_batches_equal_full_compare():
    # streaming the plan's pairs through batches must reconstruct the same coverage
    # the one-shot compare() produces (states + counts), just chunked.
    plan = _run_plan(CoveragePlanIn(
        prodBase="https://www.example.com", uatBase="https://uat.example.com",
        sitemapUrl="https://www.example.com/sitemap.xml"), _site_handler)
    streamed = []
    for i in range(0, len(plan.pairs), 2):                                   # batches of 2
        streamed += _run_cov_batch(CoverageBatchIn(pairs=plan.pairs[i:i + 2]), _site_handler)
    by_path = {r.path: r.state for r in streamed}
    assert by_path == {"/": "match", "/about": "match", "/gone": "missing_on_uat"}


# --- deep content extraction (pure) ----------------------------------------

HTML_SRC = """<html><head>
<title>Hello World</title>
<meta name="description" content="A page">
<link rel="canonical" href="https://www.example.com/p">
<meta property="og:image" content="https://www.example.com/og.png">
</head><body>
<h1>Heading One</h1>
<p>Some content here about things and stuff.</p>
<img src="/img/a.png"><img src="https://cdn.example.com/b.jpg">
<a href="/about">about</a><a href="https://other.com/x">ext</a><a href="#frag">f</a>
<script>var secret = 123;</script>
</body></html>"""


def test_embeddable_header_check():
    assert embeddable({}) is True
    assert embeddable({"x-frame-options": "DENY"}) is False
    assert embeddable({"x-frame-options": "SAMEORIGIN"}) is False
    assert embeddable({"content-security-policy": "frame-ancestors 'none'"}) is False
    assert embeddable({"content-security-policy": "frame-ancestors 'self' https://a.com"}) is False
    assert embeddable({"content-security-policy": "default-src 'self'"}) is True
    assert embeddable({"content-security-policy": "frame-ancestors *"}) is True


def test_extract_basic():
    d = extract(HTML_SRC, "https://www.example.com/p")
    assert d["title"] == "Hello World"
    assert d["h1"] == "Heading One"
    assert d["meta"]["description"] == "A page"
    assert d["meta"]["canonical"] == "https://www.example.com/p"
    assert d["meta"]["og:image"] == "https://www.example.com/og.png"
    assert "https://www.example.com/img/a.png" in d["images"]   # relative resolved
    assert "https://cdn.example.com/b.jpg" in d["images"]
    assert d["links"] == ["https://www.example.com/about"]       # same-host only, no #frag/external
    assert "secret" not in d["text"]                             # <script> skipped
    assert d["words"] > 0


def test_extract_headings_outline():
    html = (
        "<header><h1>Site Name</h1></header>"            # chrome → excluded from the outline
        "<main><h1>Page Title</h1>"
        "<h2>Section A</h2><p>body</p>"
        "<h3>Sub A1</h3>"
        "<h2>Section B</h2></main>"
        "<footer><h3>Quick Links</h3></footer>"          # chrome → excluded
    )
    d = extract(html, "https://www.example.com/p")
    outline = [(h["level"], h["text"]) for h in d["headings"]]
    assert outline == [(1, "Page Title"), (2, "Section A"), (3, "Sub A1"), (2, "Section B")]
    assert d["h1"] == "Site Name"   # primary h1 = first overall (incl. header) — existing behavior


def test_extract_downloadable_docs():
    html = ('<a href="/files/Annual%20Report%202024.pdf">report</a>'
            '<a href="https://cdn.example.com/forms/proxy.docx">form</a>'
            '<a href="/about">page</a>')   # a normal page link is NOT a doc
    d = extract(html, "https://www.example.com/p")
    names = {x["name"] for x in d["docs"]}
    assert names == {"Annual Report 2024.pdf", "proxy.docx"}      # %20 decoded; CDN host kept
    assert "https://www.example.com/about" in d["links"]          # the page link stays a link, not a doc
    assert all(not u.endswith(".pdf") for u in d["links"])        # docs excluded from links


# --- deep compare over mocked network --------------------------------------

PROD_SM_ONE = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://www.example.com/p</loc></url>
</urlset>"""

HTML_UAT = HTML_SRC.replace("<title>Hello World</title>", "<title>Hello UAT</title>")


def _deep_handler(request: httpx.Request) -> httpx.Response:
    host, path = request.url.host, request.url.path
    html_headers = {"content-type": "text/html; charset=utf-8"}
    if path == "/sitemap.xml":
        return httpx.Response(200, text=PROD_SM_ONE) if host == "www.example.com" else httpx.Response(404)
    if path == "/p":
        body = HTML_SRC if host == "www.example.com" else HTML_UAT
        return httpx.Response(200, text=body, headers=html_headers)
    if path == "/img/a.png" and host == "uat.example.com":
        return httpx.Response(404)            # this image is missing on UAT
    if path == "/about" and host == "uat.example.com":
        return httpx.Response(404)            # this internal link is broken on UAT
    return httpx.Response(200)                 # everything else (prod image, cdn, links) exists


def test_deep_compare_detects_title_and_missing_image():
    res = _run_compare(
        CompareIn(prodBase="https://www.example.com", uatBase="https://uat.example.com",
                  sitemapUrl="https://www.example.com/sitemap.xml", deep=True),
        _deep_handler,
    )
    assert res.summary.deep_compared == 1
    assert res.summary.deep_diff == 1
    deep = res.items[0].deep
    assert deep is not None
    assert deep.titleMatch is False
    assert deep.srcTitle == "Hello World" and deep.tgtTitle == "Hello UAT"
    assert deep.imagesMissing == 1                     # /img/a.png 404 on UAT
    assert deep.linksBroken == 1                        # /about 404 on UAT
    assert deep.linksBrokenUrls == ["https://uat.example.com/about"]   # the exact broken link, for the diff detail
    assert deep.bodySim is not None and deep.bodySim > 0.8   # bodies nearly identical
    assert deep.deepState in ("mixed", "meta_diff", "images_missing", "links_broken")


def test_deep_batch_streams_pairs():
    async def go():
        transport = httpx.MockTransport(_deep_handler)
        async with httpx.AsyncClient(transport=transport) as client:
            body = DeepBatchIn(pairs=[{"src": "https://www.example.com/p", "tgt": "https://uat.example.com/p"}])
            return await cs.deep_batch(body, _client=client)
    results = asyncio.run(go())
    assert len(results) == 1
    assert results[0].titleMatch is False        # Hello World vs Hello UAT
    assert results[0].imagesMissing == 1


def test_deep_off_leaves_items_without_deep():
    res = _run_compare(
        CompareIn(prodBase="https://www.example.com", uatBase="https://uat.example.com",
                  sitemapUrl="https://www.example.com/sitemap.xml"),
        _deep_handler,
    )
    assert res.summary.deep_compared == 0
    assert all(it.deep is None for it in res.items)


# --- endpoint is auth-gated (live server) ----------------------------------

@pytest.mark.asyncio
async def test_compare_requires_auth():
    async with httpx.AsyncClient(base_url=BASE, timeout=10.0) as c:
        r = await c.post(
            "/api/compare",
            json={"prodBase": "https://www.example.com", "uatBase": "https://uat.example.com"},
        )
        assert r.status_code in (401, 403)
