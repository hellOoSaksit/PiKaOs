# COMPARE.md — UAT vs Production compare feature

The one feature that makes **outbound HTTP to arbitrary user-supplied URLs** (the rest
of the backend only talks to its own DB/redis/MinIO). Extracted from the root
[CLAUDE.md](../../CLAUDE.md) §2.6 to keep that file ≤300 lines. Read this before changing
anything in the compare path.

Surface: backend `POST /api/compare/plan` + `POST /api/compare/batch` (streamed coverage),
`POST /api/compare/deep` (streamed deep), and legacy one-shot `POST /api/compare` (all
auth-gated) and the frontend **Compare Content** screen (nav id `compare`, Workspace group).
Only works with the backend up (real network calls).

Files:
- Backend: [`routers/compare.py`](../../Backend/app/routers/compare.py) → [`services/compare_service.py`](../../Backend/app/services/compare_service.py) · [`services/sitemap.py`](../../Backend/app/services/sitemap.py) · [`services/content.py`](../../Backend/app/services/content.py) · [`services/net_guard.py`](../../Backend/app/services/net_guard.py) (SSRF guard — see [compare-hardening.md](compare-hardening.md))
- Schemas: [`schemas.py`](../../Backend/app/schemas.py) (`CompareIn`/`CompareOut`/`UrlCheck`/`DeepResult`/`DeepPair`/`DeepBatchIn`/`DeepBatchOut` · streamed coverage: `CoveragePlanIn`/`CoveragePlanOut`/`CoveragePair`/`CoverageBatchIn`/`CoverageBatchOut`)
- Settings: [`config.py`](../../Backend/app/config.py) (`compare_*`) · Tests: [`tests/test_compare.py`](../../Backend/tests/test_compare.py)
- Frontend: [`screens-compare.jsx`](../../Frontend/src/screens/screens-compare.jsx) · [`lib/api.js`](../../Frontend/src/lib/api.js) (`coveragePlan`/`coverageBatch`/`compareDeep`)

---

## 0. Two modes (frontend toggle, `mode` state)
- **Sitemap coverage** (default) — §1+§2. For **same-structure** sites (real UAT vs Prod): map
  Production's sitemap paths onto the UAT host and check coverage + (optionally) deep-diff matches.
- **Two pages (direct)** — enter **two exact page URLs** (even unrelated sites, e.g.
  `true.th/network` ↔ `ais.th/consumers`) and deep-diff that one pair directly — **no sitemap,
  no path-matching**. Reuses `POST /api/compare/deep` with a single `{src,tgt}` pair and renders
  the same categorized `DeepDetail` (§4). This is the path when paths don't line up (so coverage
  would find zero matches → no detail). `runPair()` in [screens-compare.jsx](../../Frontend/src/screens/screens-compare.jsx).

## 1. Coverage (the default) — streamed `POST /api/compare/plan` → `/api/compare/batch`
- **Production's `sitemap.xml` is the source of truth.** Each primary URL is domain-swapped
  onto the UAT base (`swap_origin`) and both sides probed (HEAD→GET) for coverage.
- **Streamed in two steps so a big sitemap never overruns the proxy timeout** (a 260-URL
  site was ~185s in one shot → `ERR_EMPTY_RESPONSE`). `/plan` reads the sitemap(s) and returns
  the `CoveragePair[]` to probe + UAT-only extras (fast, ~1s, no probing). The client
  (`run()`) then posts chunks of `COV_BATCH=30` pairs to `/batch`, **filling the table live**
  with a progress bar + Cancel; `covRunRef` supersedes an in-flight stream on re-run/cancel.
  Each batch (~22s for 30) stays well under the proxy timeout. The legacy one-shot
  `POST /api/compare` (`compare()`) is kept for tests/back-compat (and still does deep inline).
- **Stateless** — no DB, so **no `repositories/` layer** for this feature.
- Probes URLs at a **polite default parallelism** (`compare_default_concurrency`, 8) so a
  WAF/CDN-fronted host (Cloudflare etc.) doesn't rate-limit our burst into false
  `unreachable`/404 noise; a request may raise it via `concurrency`, never above
  `compare_max_concurrency` (hard ceiling). Each probe retries transient connect/read
  failures `compare_probe_retries` times (linear backoff) for the same reason.
- Sitemap GET **follows redirects**; a failed fetch names the URL + exception type (so empty
  `ConnectError`/timeout strings still say what broke). Sitemap errors → HTTP 502.
- States per URL: `match · redirect · missing_on_uat · broken_on_uat · prod_error · error`;
  plus UAT-only "extra" URLs when a UAT sitemap is given.

## 2. Deep mode — body/title/meta/image/link compare
- `deep: true`, `deepLimit ≤ compare_deep_max_limit`. Fetches **full HTML** of the first N
  *matched* pages on both sides via `content.py` (stdlib `html.parser` — **no new dep**).
- Compares title/h1/meta, **body similarity** (`difflib`), + **image & internal-link
  existence** (HEAD, capped per page by `compare_deep_img_cap` / `compare_deep_link_cap`).
- **Body = real content only.** `content.py` excludes page **chrome** (`<nav> <header> <footer>
  <aside>` + ARIA landmark roles) from `text`/`blocks`, so the diff isn't drowned by the nav
  mega-menu (which dominated *and* differs by site → meaningless noise; it also made `bodySim`
  misleadingly high). Content is segmented into block-level **`blocks`** (`compare_deep_max_blocks`),
  and the UI renders a **block-by-block aligned diff** (`blockDiff` LCS): matching blocks shown
  dim with ✓, changed blocks side-by-side PROD(red)↔UAT(green), and a block on only one side as
  `—`. This is what makes "which paragraph/section differs, on which side" obvious.
- **Downloadable files** (`_DOC_EXTS`: pdf/doc(x)/xls(x)/ppt(x)/csv/zip/…) are extracted by
  `content.extract()` into `docs` (`{url, name}`, any host incl. a CDN) and compared **by filename**
  (case-insensitive) — so a report/form present on one side but not the other surfaces even though
  the host/path differ. `_deep_compare` emits `srcDocs`/`tgtDocs` counts + `docsOnlySrcUrls`/
  `docsOnlyTgtUrls`, adds a `docs_diff` issue, and the UI shows a **📎 Downloads / Files** section
  (filename-first). Catches stale UAT assets (e.g. `…2024.pdf` on UAT vs `…2025.pdf` on PROD).
- **Sub-requests are globally throttled** by a shared semaphore (`compare_default_concurrency`):
  without it, N deep pages each fan out img_cap+link_cap probes at once (N×~35), tripping the
  same WAF rate-limit as the coverage burst → bogus "all links broken" on a fine page. The
  per-page semaphore (`compare_deep_concurrency`) caps *pages*; this caps *total probes*.
- `DeepResult` returns per-side title/h1/meta + the **H1–H6 heading outline** (`srcHeadings`/`tgtHeadings`,
  `{level,text}`, chrome-excluded) + truncated body text (`compare_deep_text_chars`),
  the **lists** of missing images (`imagesMissingUrls`) and broken internal links (`linksBrokenUrls`)
  so the diff names exact URLs, `srcEmbeddable`/`tgtEmbeddable` (backend `embeddable()` reads
  `X-Frame-Options`/CSP — surfaced as dev "Frameable" info), and per-side image/link **counts**.
- `fetch_page` **retries** transient connect/read failures (`compare_probe_retries`) — a single WAF
  drop on a big page (e.g. a 1 MB SPA) no longer reads as `unfetchable`. On a genuine miss it carries
  a `reason` (status+type, or exception) and `_deep_compare` returns `src/tgtStatus` + `src/tgtReason`
  so the UI says **which side failed and why** instead of a bare "couldn't fetch".

## 3. Streaming deep — `POST /api/compare/deep` (avoid the proxy timeout)
Deep is heavy, so the **client streams it in batches** (`DEEP_BATCH=2`) — same pattern coverage
now uses (§1): coverage fills the table first, then `runDeep()` posts `DeepBatchIn` pairs one batch at a time
to `deep_batch()`, filling rows progressively. Pending rows show a `.cmp-skel` skeleton
([fx.css](../../Frontend/src/styles/fx.css)) + a progress bar. A batch error marks its rows
`unfetchable` rather than hanging. `deepRunRef` cancels an in-flight stream on re-run/toggle.
- **Batch size is small (2) on purpose:** a SLOW, WAF-fronted site (PROD pages ~15s each + the
  per-page image/link existence probes, all throttled) makes even a 2-page batch take ~1–2 min.
  Bigger batches overran the proxy timeout → the whole request failed → every row fell back to
  `unfetchable` *with no reason*. Raising sub-probe concurrency **backfires** (WAF throttles →
  slower + inflated false "broken link" counts), so it stays at the polite default.
- **Default deep limit is 5 pages** (`compare_deep_limit`) — deep is slow, so start small; the user
  raises it per run. When the batch request itself fails (no per-side reason), the row shows a hint
  to use the per-row 🔬 Deep instead.

## 3a. Cancel — abort that reaches the backend
The plan loader (`window.uiLoading({ onCancel })`) and both the coverage and deep progress bars
carry a **Cancel** button. Cancel `abort()`s an `AbortController` whose signal is threaded through
`api.js` (`raw(..., { signal })` → `coveragePlan/coverageBatch/compareDeep(body, signal)`) into
the `fetch`. Aborting closes the socket; the backend wraps every compare endpoint in
`_run_cancellable(request, coro)` ([routers/compare.py](../../Backend/app/routers/compare.py))
which polls `request.is_disconnected()` and **cancels the task** on disconnect — so the
in-flight outbound HTTP (which can be dozens of probes) gets `CancelledError` and **stops**
instead of running to completion unseen (a **499** is raised; the client is already gone).
An `AbortError` is swallowed on the client (no error alert); deep cancel keeps rows already
fetched. Tested deterministically with a fake-disconnect `Request` in `tests/test_compare.py`.

## 4. Frontend screen
- Sitemaps **auto-derived from the base URLs** (`sitemapFor(base)` → `<base>/sitemap.xml`) —
  no manual field; the two resolved URLs are shown read-only.
- **Direction toggle** flips which side is source-of-truth (`dir` p2u/u2p → src/tgt bases +
  env-aware labels via `{env}`/`{src}` i18n vars).
- Results: spaced `cmp-table`, categorized (`catOf(state)` → match · redirect · missing ·
  broken · **other**=prod_error+error) with filter pills + path search + a **sort** control.
  **Sort defaults to "differences first"** (`sorters.diff` / `diffRank`): deep-content-differs (0)
  > coverage **unmatch incl. `redirect`** (1) > clean `match` (2) — so problems float to the top
  as deep results stream in; other sorts: path A→Z, status. Expanded rows are keyed by **path**
  (not index) so the open set survives a re-sort.
- **Per-row deep** (`deepOne`): every deepable row (state `match`/`redirect`) carries a 🔬 **Deep**
  button — deep-compare just that one row on demand, independent of the bulk pass; the result
  streams into `deepData` + the per-direction cache. (The bulk **Deep compare** toggle still does all.)
- **Deep detail = DIFFERENCES ONLY** (`DeepDetail`, click a row). A field/section appears **only
  when the two sides actually differ**; an identical page collapses to one green line
  (`compare.deep.noDiff` + body-similarity %). Differences are grouped by audience so a
  webmaster / dev / content editor each finds their part:
  - **📑 Headings / Outline** — the page's **H1–H6 structure** (`srcHeadings`/`tgtHeadings`, extracted by
    `content.py`, chrome-excluded, capped 80) shown as an aligned diff (which heading was added/removed/
    reworded PROD↔UAT), each a jump-link to that heading on the live page. A heading-structure change
    flags `deepState: headings_diff` (info) even when body similarity stays high.
  - **📝 Content** — `H1` diff + the block-by-block **body diff** (§2). **Each changed block is a deep-link
    into the LIVE page**: clicking it (`jumpLink` → `textFragmentUrl`) opens the real PROD/UAT page at a
    native **scroll-to-text-fragment** (`#:~:text=…`) so the browser scrolls to and highlights that exact
    text — no JS/dependency, first ~8 words (+ last ~6 for long blocks) bound the match; PROD blocks link
    to the PROD page, UAT blocks to UAT. Chromium/Edge/Safari honor it; Firefox just opens the page (no
    scroll) — graceful. (Legacy no-`blocks` results fall back to the flat `wordDiff` two-column view.)
  - **🔍 SEO / Meta** — `Title` · `description` · `canonical` · `og:title` · `og:image` (only the differing ones).
  - **🔗 Links & Images** — the **exact URLs** that 404 on the target (`imagesMissingUrls` / `linksBrokenUrls`), each an open-in-tab link.
  - **⚙️ Technical** — body similarity % + word delta + **Frameable** (`embeddable()` X-Frame-Options/CSP) per side.
  Each row also links the **real pages** (`{side} ↗`) to open in a new tab.
  Expand is animated ([fx.css](../../Frontend/src/styles/fx.css) `.cmp-grow`/`.cmp-reveal`/`.cmp-detail`/`.cmp-chev`):
  a true height grow (grid `0fr→1fr` on a `.cmp-clip` wrapper, so it eases open without snapping), inner
  blocks rise in a bounce-free stagger, the row hovers/presses (`:active` flash) + stays lit with a gold rail,
  and the chevron rotates `▸→▾` — all gated behind `prefers-reduced-motion`.
- **No rendered preview (removed).** Earlier builds tried side-by-side `<iframe>` previews
  (direct, then a server **proxy** snapshot, then client-side `sandbox="allow-scripts"`). All were
  removed: they **can't faithfully show a JS+API-driven SPA** — the static snapshot runs no JS, and
  running the page's JS client-side **CORS-blocks** its own data `fetch` (opaque iframe origin), so
  the page never hydrates. Faithful rendering would need a **server-side headless browser**
  (server→origin has no CORS) — a **deliberate non-goal** (keeps compare dependency-light / no
  Chromium). The **structured diff above is the source of truth**; "open in new tab" shows the live site.
- **Per-direction session cache** (`cacheRef`, keyed `sigOf(dir|prod|uat|auth)` — see `makeSig`) makes
  flipping UAT↔Prod instant; editing a URL/dir/auth changes the key → a stale flag + **Clear-cache**
  button keep results fresh. **Deep settings are NOT in the key** (coverage is identical regardless of
  how many pages we deep-compare; deep results live per-path in the entry's `deep` map) — so raising the
  deep limit never invalidates coverage. **Persisted to `sessionStorage`** (`guildos.compare.view/cache.v1`)
  so a page reload re-shows the last result; it survives F5, clears on tab close, and **never stores
  credentials** (auth is in-memory only; the key folds only username/header *names*, never secrets).
  Errors → `errMessage()` → `window.uiAlert` + inline note.
- **Incremental deep (don't start over).** `runDeep` keeps every page already deep-compared for these
  inputs and fetches **only** the pages up to `deepLimit` that aren't done yet — raising 5→20 fetches
  the 15 new ones, the first 5 stay. The **🔬 Deep more ({done}/{want})** button re-runs deep up to the
  (raised) limit with **no coverage re-probe**; re-running the *same* inputs via the main Run button also
  preserves prior deep (paths are stable). Each batch persists into the cache, so a reload mid-stream
  keeps the pages already fetched. (This is the fix for "set 5, then want 20 → had to restart".)
- **Pages (deepLimit) UX**: deep can only run on matched/redirect pages, so the input shows
  "of N matched" and clamps `max` to that count once coverage is known (over-asking is already
  safe — both client `slice` and backend clamp guard it).

## 4a. Login-gated sites — **per-side** auth (HTTP Basic / session header)
The one site class the coverage path can't see without credentials. Production and UAT can
need **different (or one-sided) logins**, so auth is **per host**: `CompareIn`/`DeepBatchIn`
carry `prodAuth` + `uatAuth` (each a `CompareAuth`: `username`/`password` → HTTP Basic, plus a
free-form `headerName`/`headerValue` for `Bearer`/`Cookie`). The backend builds a
`{host: CompareAuth}` map and attaches an `httpx.Auth`
subclass **`_HostAuth`** that dispatches creds **by `request.url.host`** — so a credential is
sent only to its own origin (never leaked to the other side or to a redirected third party),
and is **never logged or persisted**.
- **Two-tab modal**: the login popup has **Production / UAT** tabs (a `●` marks a filled side);
  fill one or both. The frontend maps each side's creds to the right backend param by direction
  (`dir` p2u/u2p → src=prodBase param, tgt=uatBase param), so the host map is always correct.
- **Auto-prompt**: a run that returns **401/403** opens the modal **focused on the failing side**
  only if that side has no creds yet; on submit the per-side creds are held in
  `authRef` (so the immediate re-run isn't a stale closure), cache is cleared, and the run repeats
  authenticated. A 🔑 button opens it manually; **Clear** drops both. Held **in memory only**.
  The cache key (`sigOf`) folds in both sides' creds so changing either invalidates results.
  - Coverage uses `loginWall()` over the probed items; **Two-pages** mode reads the deep result's
    `src/tgtStatus` (Page A → prod tab, Page B → uat tab) so a login-gated direct pair prompts too
    instead of dead-ending on `unfetchable`. `submitAuth` re-runs **whichever mode is active**.

## 4b. Saved sites — reusable Prod/UAT + creds list
Frequent comparisons shouldn't be re-typed. A **Saved sites** picker in the inputs panel loads a
stored entry (`{id, name, prod, uat, prodAuth, uatAuth}`) in one click — it fills both URLs and
applies the per-side creds straight into `applyAuth` (same cred shape as live auth). **Save current**
captures the current inputs + auth; **Manage** opens a modal to add/edit/delete entries (reuses
`ui/Modal` · `ui/Input` Field · `ui/Dropdown` Select · `Btn`; delete confirms via `window.uiConfirm`).
The store lives in its own data module [`data/compare-sites.jsx`](../../Frontend/src/data/compare-sites.jsx)
(`loadSites`/`saveSites`/`newSiteId`, key `guildos.compare.sites.v1`) per CLAUDE.md §5 — **localStorage**
(persists across sessions), distinct from the sessionStorage run-cache in §4.
- **Security:** by explicit user request this store keeps credentials **including passwords in
  plaintext** in `localStorage`. Acceptable only because PiKaOs is a local dev/internal tool — never
  sync it off the machine; the note is surfaced in the modal (`compare.sites.credNote`). Compare's
  *live* auth is still in-memory only; saving is opt-in.

## 5. Settings ([`config.py`](../../Backend/app/config.py))
`compare_timeout_seconds` · `compare_default_concurrency` (polite default) · `compare_max_concurrency` (ceiling) ·
`compare_probe_retries` / `compare_probe_backoff_seconds` · `compare_max_urls` ·
`compare_deep_limit` / `_max_limit` / `_concurrency` / `_img_cap` / `_link_cap` ·
`compare_body_sim_threshold` · `compare_deep_text_chars`.

## 6. Gotchas
- **Proxy timeout:** the Vite dev proxy `/api` timeout is **180s** ([`vite.config.js`](../../Frontend/vite.config.js)) —
  raised from 120s for headroom on slow deep batches. Any single request that runs longer drops the
  connection → UI shows a misleading "cannot reach server" (`ERR_EMPTY_RESPONSE`). **Streaming
  coverage (§1) + deep (§3) in small batches is the fix** — each request stays short; the legacy
  one-shot `POST /api/compare` can still hit this on a big sitemap. **Editing `vite.config.js`
  requires restarting the dev server** (proxy config isn't hot-reloaded).
- **Completion toasts:** the app is wrapped in `ToastProvider` ([App.jsx](../../Frontend/src/App.jsx));
  Compare fires a bottom-right `useToast()` on coverage/deep/pair completion (runs are long — the user
  may look away). `useToast()` no-ops if no provider, so it's safe to call anywhere.
- **No new Python dep** — keep `content.py` stdlib-only so the Docker image needn't rebuild
  (code changes hot-reload; `docker compose restart backend` if not).

## 7. Tests
[`tests/test_compare.py`](../../Backend/tests/test_compare.py): pure logic (swap/parse/classify),
HTML `extract`, `embeddable` header check, and a **full mocked flow** — `compare(payload,
_client=…)` / `deep_batch(body, _client=…)` take an injected `httpx.AsyncClient` backed by
`httpx.MockTransport`, driven via `asyncio.run` → no server / no network / no pytest-asyncio.

## 8. Future work
Pagination/listing crawl (follow `rel=next` / `?page=N` to gather up to N items, e.g. 100 news).
