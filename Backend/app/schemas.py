"""Pydantic request/response schemas."""
from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field


class LoginIn(BaseModel):
    usernameOrEmail: str = Field(min_length=1)
    password: str = Field(min_length=1)


class ForgotIn(BaseModel):
    usernameOrEmail: str = Field(min_length=1)


class TokenOut(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    expiresIn: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str
    display: str
    role: str
    status: str
    avatar: str
    quota: int | None
    period: str
    used: int
    last_login: datetime | None = None
    created_at: datetime


class LoginResult(BaseModel):
    token: TokenOut
    user: UserOut


class HealthOut(BaseModel):
    status: str
    db: str
    redis: str
    minio: str


# --- UAT vs Production sitemap comparison ---------------------------------
# Production's sitemap is the source of truth for the "primary" URL set. Each
# URL is domain-swapped onto the UAT base and both sides are probed so we can
# report coverage: which primary URLs are present / missing / broken on UAT.


class CompareIn(BaseModel):
    """Request to compare a UAT site against Production by sitemap coverage."""

    prodBase: AnyHttpUrl = Field(description="Production origin, e.g. https://www.example.com")
    uatBase: AnyHttpUrl = Field(description="UAT origin, e.g. https://uat.example.com")
    # default: <prodBase>/sitemap.xml — Production is the primary URL source
    sitemapUrl: AnyHttpUrl | None = Field(default=None, description="Override Production sitemap URL")
    # optional: UAT sitemap → also surface URLs that exist on UAT but NOT in Production
    uatSitemapUrl: AnyHttpUrl | None = Field(default=None, description="UAT sitemap, to find UAT-only (extra) URLs")
    maxUrls: int | None = Field(default=None, ge=1, le=10000, description="Cap on URLs probed")
    # default (None) = probe ALL sitemap URLs simultaneously (clamped to compare_max_concurrency)
    concurrency: int | None = Field(default=None, ge=1, le=500, description="Cap on parallel probes; omit to run the whole sitemap at once")
    # deep mode: fetch full HTML and compare title/h1/meta/body + image & link existence
    deep: bool = Field(default=False, description="Compare page bodies, not just status codes")
    deepLimit: int | None = Field(default=None, ge=1, le=500, description="How many matched pages to deep-compare (default compare_deep_limit)")


class DeepResult(BaseModel):
    """Deep (body-level) comparison of one source page vs its target twin."""

    deepState: str                          # identical | content_diff | meta_diff | images_missing | links_broken | mixed | unfetchable
    titleMatch: bool | None = None
    h1Match: bool | None = None
    srcTitle: str | None = None
    tgtTitle: str | None = None
    srcH1: str | None = None
    tgtH1: str | None = None
    srcMeta: dict[str, str] = Field(default_factory=dict)   # description/canonical/og:* — for field diff
    tgtMeta: dict[str, str] = Field(default_factory=dict)
    srcText: str | None = None              # truncated body text — for the client-side highlighted diff
    tgtText: str | None = None
    srcEmbeddable: bool | None = None       # can be shown in a cross-origin iframe (X-Frame-Options/CSP)
    tgtEmbeddable: bool | None = None
    bodySim: float | None = None            # 0..1 text similarity (difflib)
    wordDelta: int | None = None            # target words − source words
    metaDiff: list[str] = Field(default_factory=list)   # meta fields that differ
    imagesChecked: int = 0
    imagesMissing: int = 0
    imagesMissingUrls: list[str] = Field(default_factory=list)
    linksChecked: int = 0
    linksBroken: int = 0


class DeepPair(BaseModel):
    """One source→target page pair to deep-compare (already domain-swapped)."""

    src: AnyHttpUrl
    tgt: AnyHttpUrl


class DeepBatchIn(BaseModel):
    """A small batch of pages to deep-compare, so the client can stream sets."""

    pairs: list[DeepPair] = Field(min_length=1, max_length=50)


class DeepBatchOut(BaseModel):
    results: list[DeepResult]   # aligned to the input pairs


class RenderIn(BaseModel):
    """One page to proxy-render for an in-page preview of a site that blocks iframes."""

    url: AnyHttpUrl


class RenderOut(BaseModel):
    """Proxied page HTML (with an injected <base>) for same-origin srcdoc display."""

    ok: bool
    status: int | None = None
    finalUrl: str
    html: str = ""        # empty unless ok; the client shows it in a sandboxed iframe
    reason: str | None = None


class UrlCheck(BaseModel):
    """Coverage result for one primary (Production) URL mapped onto UAT."""

    path: str                       # path (+query) shared by both sides
    prodUrl: str
    uatUrl: str
    prodStatus: int | None = None   # None = request failed (timeout/DNS/etc.)
    uatStatus: int | None = None
    state: str                      # match | missing_on_uat | broken_on_uat | redirect | prod_error | error
    note: str | None = None
    deep: DeepResult | None = None  # populated only in deep mode for compared pages


class CompareSummary(BaseModel):
    total: int = 0
    match: int = 0
    redirect: int = 0
    missing_on_uat: int = 0
    broken_on_uat: int = 0
    prod_error: int = 0
    error: int = 0
    extra_on_uat: int = 0
    deep_compared: int = 0          # pages that ran a deep body comparison
    deep_diff: int = 0              # of those, how many were not "identical"


class CompareOut(BaseModel):
    prodBase: str
    uatBase: str
    sitemapUrl: str
    generatedAt: datetime
    summary: CompareSummary
    items: list[UrlCheck]
    extraOnUat: list[str] = Field(default_factory=list)  # UAT-only URLs (if uatSitemapUrl given)
