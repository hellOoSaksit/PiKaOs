# COMPARE.md — UAT vs Production compare feature

The one feature that makes **outbound HTTP to arbitrary user-supplied URLs** (the rest
of the backend only talks to its own DB/redis/MinIO). Extracted from the root
[CLAUDE.md](../../CLAUDE.md) §2.6 to keep that file ≤300 lines. Read this before changing
anything in the compare path.

Surface: backend `POST /api/compare` + `POST /api/compare/deep` (both auth-gated) and the
frontend **Compare Content** screen (nav id `compare`, Workspace group). Only works with
the backend up (real network calls).

Files:
- Backend: [`routers/compare.py`](../../Backend/app/routers/compare.py) → [`services/compare_service.py`](../../Backend/app/services/compare_service.py) · [`services/sitemap.py`](../../Backend/app/services/sitemap.py) · [`services/content.py`](../../Backend/app/services/content.py)
- Schemas: [`schemas.py`](../../Backend/app/schemas.py) (`CompareIn`/`CompareOut`/`UrlCheck`/`DeepResult`/`DeepPair`/`DeepBatchIn`/`DeepBatchOut`)
- Settings: [`config.py`](../../Backend/app/config.py) (`compare_*`) · Tests: [`tests/test_compare.py`](../../Backend/tests/test_compare.py)
- Frontend: [`screens-compare.jsx`](../../Frontend/src/screens/screens-compare.jsx) · [`lib/api.js`](../../Frontend/src/lib/api.js) (`compareSites`/`compareDeep`)

---

## 1. Coverage (the default) — `POST /api/compare`
- **Production's `sitemap.xml` is the source of truth.** Each primary URL is domain-swapped
  onto the UAT base (`swap_origin`) and both sides probed (HEAD→GET) for coverage.
- **Stateless** — no DB, so **no `repositories/` layer** for this feature.
- Fires the **whole sitemap in parallel** by default (every URL at once), clamped to
  `compare_max_concurrency` (hard ceiling); a request may cap lower via `concurrency`.
- Sitemap GET **follows redirects**; a failed fetch names the URL + exception type (so empty
  `ConnectError`/timeout strings still say what broke). Sitemap errors → HTTP 502.
- States per URL: `match · redirect · missing_on_uat · broken_on_uat · prod_error · error`;
  plus UAT-only "extra" URLs when a UAT sitemap is given.

## 2. Deep mode — body/title/meta/image/link compare
- `deep: true`, `deepLimit ≤ compare_deep_max_limit`. Fetches **full HTML** of the first N
  *matched* pages on both sides via `content.py` (stdlib `html.parser` — **no new dep**).
- Compares title/h1/meta, **body similarity** (`difflib`), + **image & internal-link
  existence** (HEAD, capped per page by `compare_deep_img_cap` / `compare_deep_link_cap`).
- `DeepResult` returns per-side title/h1/meta + truncated body text (`compare_deep_text_chars`)
  + `srcEmbeddable`/`tgtEmbeddable` (backend `embeddable()` reads `X-Frame-Options`/CSP).

## 3. Streaming deep — `POST /api/compare/deep` (avoid the proxy timeout)
Deep is heavy, so the **client streams it in batches** (`DEEP_BATCH=10`): coverage returns
first (fast, shows the table), then `runDeep()` posts `DeepBatchIn` pairs one batch at a time
to `deep_batch()`, filling rows progressively. Pending rows show a `.cmp-skel` skeleton
([fx.css](../../Frontend/src/styles/fx.css)) + a progress bar. A batch error marks its rows
`unfetchable` rather than hanging. `deepRunRef` cancels an in-flight stream on re-run/toggle.

## 4. Frontend screen
- Sitemaps **auto-derived from the base URLs** (`sitemapFor(base)` → `<base>/sitemap.xml`) —
  no manual field; the two resolved URLs are shown read-only.
- **Direction toggle** flips which side is source-of-truth (`dir` p2u/u2p → src/tgt bases +
  env-aware labels via `{env}`/`{src}` i18n vars).
- Results: spaced `cmp-table`, categorized (`catOf(state)` → match · redirect · missing ·
  broken · **other**=prod_error+error) with filter pills + path search.
- **Deep detail** (`DeepDetail`, click a row): colored **field diff**, word-level **body diff**
  (`wordDiff`, green=add / red=del), image/link counts, and opt-in side-by-side **iframes** —
  blocked sides show an open-in-tab placeholder (long URLs decoded + single-line so columns align).
  Expand is animated ([fx.css](../../Frontend/src/styles/fx.css) `.cmp-grow`/`.cmp-reveal`/`.cmp-detail`/`.cmp-chev`):
  a true height grow (grid `0fr→1fr` on a `.cmp-clip` wrapper, so it eases open without snapping), inner
  blocks rise in a bounce-free stagger, the row hovers/presses (`:active` flash) + stays lit with a gold rail,
  and the chevron rotates `▸→▾` — all gated behind `prefers-reduced-motion`.
- **Per-direction session cache** (`cacheRef`, keyed `sigOf(dir|prod|uat|deep)`) makes flipping
  UAT↔Prod instant; editing any input changes the key → a stale flag + **Clear-cache** button
  keep results fresh (in-memory only). Errors → `errMessage()` → `window.uiAlert` + inline note.

## 5. Settings ([`config.py`](../../Backend/app/config.py))
`compare_timeout_seconds` · `compare_max_concurrency` (ceiling) · `compare_max_urls` ·
`compare_deep_limit` / `_max_limit` / `_concurrency` / `_img_cap` / `_link_cap` ·
`compare_body_sim_threshold` · `compare_deep_text_chars`.

## 6. Gotchas
- **Proxy timeout:** a big run can take ~minutes; the Vite dev proxy `/api` timeout is **120s**
  ([`vite.config.js`](../../Frontend/vite.config.js)). Too short → connection drops → UI shows a
  misleading "cannot reach server". Deep streaming is the real fix for large sites.
- **No new Python dep** — keep `content.py` stdlib-only so the Docker image needn't rebuild
  (code changes hot-reload; `docker compose restart backend` if not).

## 7. Tests
[`tests/test_compare.py`](../../Backend/tests/test_compare.py): pure logic (swap/parse/classify),
HTML `extract`, `embeddable` header check, and a **full mocked flow** — `compare(payload,
_client=…)` / `deep_batch(body, _client=…)` take an injected `httpx.AsyncClient` backed by
`httpx.MockTransport`, driven via `asyncio.run` → no server / no network / no pytest-asyncio.

## 8. Future work
Pagination/listing crawl (follow `rel=next` / `?page=N` to gather up to N items, e.g. 100 news).
