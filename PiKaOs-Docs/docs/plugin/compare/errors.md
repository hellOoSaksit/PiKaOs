---
title: Compare (plugin) — error taxonomy
type: reference
status: built
keywords: [errors, coverage states, deep states, http status, ssrf, proxy timeout, waf, cancellation 499, known issues]
related: [./overview.md, ./decisions.md, ./integration.md, ../../features/compare.md]
summary: >
  How Compare fails and how each failure surfaces — domain errors to HTTP, coverage/deep states,
  frontend mapping, operational traps, and known cleanup. Read when diagnosing a failure or before merge-back.
updated: 2026-06-20
---

# Compare (plugin) — error taxonomy

How it fails, and how each failure surfaces. The point of compare is to **report differences as
data**, so most "errors" are *expected states*, not crashes. Four layers + the operational traps.

## 1. Backend domain errors → HTTP status

| Raised | Where | → HTTP | Meaning |
|---|---|---|---|
| `BlockedURLError` | [`net_guard.py`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/services/net_guard.py) `assert_public_url` | **400** | bad scheme, missing host, host not in allowlist, or resolves to a non-public IP (SSRF block) |
| `SitemapError` | [`sitemap.py`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/services/sitemap.py) | **502** | sitemap can't be fetched (names the exception type when the message is empty), returned non-200, was invalid XML, or contained no URLs |
| `CancelledError` (client disconnect) | `_run_cancellable` ([`routers/compare.py`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/routers/compare.py)) | **499** | user hit Cancel / closed the tab; body is moot, just keeps an aborted run out of the error log |
| request body invalid | FastAPI / pydantic | **422** | schema validation (e.g. `prodBase` not a URL, batch `min_length`/`max_length`) |

The SSRF guard fires **twice**: `assert_public_url` up front (hard 400) **and** an httpx request
event hook on **every redirect hop** — a 302 to an internal host is re-raised as `httpx.RequestError`
and degrades to a normal fetch failure (URL marked broken), not a crash.

## 2. Coverage states (per URL) — [`_classify`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/services/compare_service.py)

`prodStatus`/`uatStatus` are `None` when the probe failed (timeout/DNS/connect). Redirects are **not**
followed during probing, so 3xx stays visible.

| State | Condition |
|---|---|
| `match` | PROD 2xx/3xx **and** UAT 2xx |
| `redirect` | PROD ok, UAT 3xx |
| `missing_on_uat` | PROD ok, UAT 404 |
| `broken_on_uat` | PROD ok, UAT ≥400 (not 404) |
| `prod_error` | PROD not 2xx/3xx, or unreachable (the source-of-truth itself is broken) |
| `error` | PROD ok but UAT unreachable (`None`) |
| *(extra)* | UAT-only URLs in the UAT sitemap but not Production's (only when `uatSitemapUrl` given) |

## 3. Deep states (per page) — [`_deep_compare`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/services/compare_service.py)

One issue → that state; multiple → `mixed`; none → `identical`.

`identical` · `content_diff` (bodySim < `compare_body_sim_threshold`) · `meta_diff` (title/h1/meta) ·
`headings_diff` (H1–H6 outline changed) · `images_missing` · `links_broken` · `docs_diff`
(downloadable file on one side only, by filename) · `mixed` · **`unfetchable`** (one side's GET
failed — carries `srcStatus`/`tgtStatus` + `srcReason`/`tgtReason` so the UI says **which side failed
and why**, not a bare "couldn't fetch").

## 4. Frontend error mapping — [`errMessage()`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Frontend/src/screens/screens-compare.jsx)

`ApiError.status` → localized message:

| status | UI message | reaction |
|---|---|---|
| `0` | `compare.err.network` | backend unreachable / request dropped (see §5) |
| `401` / `403` | `compare.err.auth` | **auto-opens the login modal** focused on the failing side |
| `502` | backend detail or `compare.err.sitemap` | sitemap fetch failed |
| `422` / `400` | `compare.err.input` | bad input / SSRF block |
| other | `e.message` or `compare.failed` | generic |

An `AbortError` (user Cancel) is **swallowed** — no error alert; deep cancel keeps rows already fetched.

## 5. Operational failure modes (the real-world traps)

| Symptom | Cause | Mitigation in this build |
|---|---|---|
| `ERR_EMPTY_RESPONSE` / "cannot reach server" mid-run | a single request ran past the **180s Vite dev-proxy timeout** ([`vite.config.js`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Frontend/vite.config.js)); a 260-URL site was ~185s in one shot | **streaming** — coverage in `COV_BATCH=30` chunks, deep in `DEEP_BATCH=2`; each request stays short. The legacy one-shot `POST /api/compare` can still hit this. |
| bogus `unreachable`/404 noise, or "all links broken" on a fine page | a burst of probes trips a **WAF/CDN rate-limit** (Cloudflare etc.) | polite default concurrency (`compare_default_concurrency=8`), per-probe retries, and a **shared sub-semaphore** capping *total* img/link probes (not just pages). Raising concurrency **backfires** ([`decisions.md`](decisions.md)). |
| deep batch fails wholesale → every row `unfetchable` *with no reason* | batch overran the proxy timeout on a slow, WAF-fronted site (~15s/page) | `DEEP_BATCH=2` on purpose; per-row 🔬 Deep retry; default deep limit 5 pages |
| a valid internal target is rejected | **SSRF guard** (`compare_ssrf_block_private=true`) blocks private/loopback/link-local/reserved IPs | intended; for a trusted internal-only run set `COMPARE_SSRF_BLOCK_PRIVATE=false`, or use `COMPARE_URL_ALLOWLIST`. **Known gap:** DNS-rebind TOCTOU window (guard resolves once, httpx resolves again) — future hardening, [`../../features/compare-hardening.md`](../../features/compare-hardening.md) §1 |

## 6. Known issues / cleanup found in this build

Spotted reading the lifted code — candidates to fix (especially before merge-back, [`integration.md`](integration.md)):

- **Dead auth/health schemas** in [`schemas.py`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/schemas.py): `LoginIn`, `ForgotIn`, `TokenOut`, `UserOut`, `LoginResult`, `HealthOut` are leftovers from the lift — there's no auth router here and `/api/health` returns a plain dict (not `HealthOut`). Safe to delete.
- **Stale docstring** in [`net_guard.py`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/services/net_guard.py): references `/api/compare/render` returning the body — that endpoint was removed (no rendered preview, [`decisions.md`](decisions.md)). Comment only.
- **No tests shipped** — the parent's `tests/test_compare.py` drives the flow with an injected `httpx.MockTransport` client; the plugin services still accept that `_client` param, so porting the test file is low-effort and worth doing.
- **Legacy `POST /api/compare`** is reachable but unused by the frontend — keep only if a direct-API consumer needs it; otherwise it's the one path that can still hit the proxy timeout (§5).
