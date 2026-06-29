---
title: RedirectMap (plugin) — error taxonomy
type: reference
status: built
keywords: [errors, verify verdicts, soft-error pages, 200 but broken, content check, waf codes, ssrf, proxy timeout, known issues]
related: [./overview.md, ./decisions.md, ./integration.md, ../../pikaos-dev-rules.md]
summary: >
  How RedirectMap fails and what the page actually returned — domain errors to HTTP, the 4 verify verdicts,
  soft-error/body/file content checks, operational traps, and known cleanup. Read when diagnosing a verdict.
updated: 2026-06-20
---

# Error taxonomy — how it fails + what the page actually returned

The point of verify is to **report state as data** and **not trust the HTTP status code alone**. A
server can answer `200` whose body is an "Internal Server Error" screen, or `405` to a bot while a
real browser loads the page fine. Layers:

## 1. Backend domain errors → HTTP status

| Raised | Where | → HTTP | Meaning |
|---|---|---|---|
| `BlockedURLError` | [`net_guard.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/net_guard.py) | **400** | bad scheme / missing host / not in allowlist / resolves to a non-public IP (SSRF block) |
| `SitemapError` | [`sitemap.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/sitemap.py) | **502** | sitemap unfetchable / non-200 / invalid XML / no URLs |
| (client disconnect) | `_run_cancellable` | **499** | Cancel / tab closed — keeps it out of the error log |
| (invalid body) | FastAPI/pydantic | **422** | schema validation (e.g. `oldBase` not a URL, rows out of `min/max_length`) |

## 2. Verify verdict — the 4 checklist statuses ([`schemas.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/schemas.py) `STATUS_*`)

Old side probed **no-follow** (a 3xx + its `Location` stay visible → detects `alreadyRedirected`
after host/trailing-slash normalize); new side **follows** to the final page.

| Status | Condition |
|---|---|
| `รอดำเนินการ` (pending) | new URL is a real 2xx **and** old reachable → ready to set the redirect |
| `ดำเนินการแล้ว` (done) | old URL already 301/302s onto the new URL |
| `ติดปัญหา` (problem) | new URL 404/unreachable, **or 200 but the body is an error screen (§3)**, or **old-only** (a URL with no new target set yet) |
| `ไม่ต้อง Redirect` (skip) | old URL gone/unreachable, **or new-only** (a page that exists only on the new site — no old URL maps to it; shown for completeness, nothing to redirect FROM) |

**Every URL appears, even one-sided.** Discover lists the **union** of both sitemaps, so a URL with
no counterpart still gets a row showing the side that exists. The note spells out which side is
missing, and the file/thin-body caveats are only appended when **both** pages exist to compare. The
note itself is written to read as one detailed line (HTTP status per side + any content caveat) so it
stands alone in the table **and** the Excel export.

**WAF/bot codes `401/403/405/406/429/503` are NOT "missing"** (`_BLOCKED_CODES` in `verify_service`):
httpx can't emulate a full browser, so these usually load fine for a human → verdict stays `pending`
with a "open the link to confirm" note, never reported as 404. (The probe already sends a full Chrome
UA + browser `Accept` headers — a bot UA made every WAF page a false "missing".)

**`401` is special — HTTP Basic Auth (see §3.5).** A `401` usually means the site wants a username/
password (a browser "Sign in" dialog, common on UAT). The note then points the user at the **Login**
section to add per-host credentials; if creds were already given for that host, the note says they may
be wrong. With matching credentials the probe re-runs through the `401` and judges the real page.

## 3. Soft-error pages — the content check status codes hide

A page can answer **200** (or 404) whose **body** is an error/maintenance screen.
[`page_inspect.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/page_inspect.py)
`body_signal()` scans the **first ~800 chars** of the visible text (chrome stripped) for signatures
(`_ERROR_SIGNS`) → a short label: `500` · `502` · `503` · `504` · `403` · `404` · `maintenance`.

**Content-aware override:** in [`verify_service.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/verify_service.py),
when the NEW page returned a would-be-fine status but its body matches a signature, the verdict is
forced to `ติดปัญหา` with note *"เว็บใหม่ตอบ {status} แต่ body เป็นหน้า error ({label})…"* + a Home
fallback. So 200-but-broken can't pass as ready. Bounded to the first 800 chars (error screens put the
message up top) to avoid flagging a real page that merely *mentions* "not found" deep in content —
widen `_ERROR_SIGNS` only with care.

## 3.5. Gated sites — HTTP Basic Auth

A site (typically a UAT/staging environment) can sit behind **HTTP Basic Auth** — a bare probe just
gets a `401`, and even its `sitemap.xml` is gated. The user adds per-host credentials in the **Login**
subsection (host + username + password); they ride on the `discover` + `verify` request and are
[`credentials.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/credentials.py)-mapped
`host → httpx.BasicAuth`, then matched to each probed URL **by host** (`auth_for`).

- **Per side, by host.** Only the side whose host matches gets an `Authorization` header — an open
  old site and a gated new site in the same row are handled correctly.
- **Cross-host safety.** On a redirect to a different host httpx itself strips the `Authorization`
  header, so site A's password never leaks to site B.
- **Sitemap too.** `fetch_sitemap_urls` takes the same `auth`, so discover can read a gated sitemap.
- **Secrets are request-only.** Never persisted server-side, never in config/`.env` (no-hardcode
  rule). The frontend keeps them in **localStorage** (this browser only) — fine for an internal tool;
  don't reuse a sensitive personal password.

**The system finds the gated sites for you.** The user doesn't have to know in advance which sites
need a login:
- **From verify** — the frontend scans the results for any side that answered `401` and **auto-adds
  that host** to the Login list (empty user/pass) and opens the section. The user only types
  username/password, then re-runs.
- **From discover** — a gated **old** sitemap raises `SitemapError` (→ 502) whose message carries the
  URL; the frontend pulls the host out of a `HTTP 401/403` error and adds it the same way. (A gated
  **new** sitemap is best-effort, so it silently falls back to a domain-swap; once creds exist, the
  next run reads it and restores the Match %.)
- **Prefill** — adding a login row by hand prefills the host from the URLs already typed in the panel
  (new base + old sites), and the host field autocompletes from them (`<datalist>`).

The same deep GET feeds two more checks:

- **Body** — `has_body` (real visible content ≥ `redirect_body_min_chars`, default 40) · `thin`
  (has `<h1>` but almost nothing else — an H1-only stub from an incomplete migration). The **Body**
  column shows both sides: 🔴 `✖ {error}` · 🟡 `H1 only` · 🟢 `has content` · ⚫ `empty`. Page chrome
  (`script/style/nav/header/footer/aside`) is stripped first so the nav menu isn't counted as content.
- **Files** — document links (`pdf/doc(x)/xls(x)/ppt(x)/zip/csv/…`) on the OLD page vs the NEW page,
  compared **by filename**: matched / only-old (gone) / only-new (added) + `filesSame`. Shown in the
  **Files** column (`✓ same (n)` / `✗ differ`) with the lists in the detail. *Per mapping row* —
  there is no separate site-wide file scan.
- **Match %** — when discover reads both sitemaps, each old path is matched to the closest **real**
  new URL by path similarity (`matchScore` 0–100; `—` = no new sitemap → same-path domain swap).
  **A low match drives a note caveat** on the otherwise-ready verdict (verify gets `matchScore` on the
  row): `<60` warns the target is *likely the wrong page* ("น่าจะคนละหน้า"), `60–89` says to check the
  target first. So a fuzzy best-match that merely returns `200` (e.g. `/board-of-directors` →
  `/contact-us` at 42%) no longer reads as a plain "ready to redirect".

## 5. Frontend — streamed verify + per-row detail

Verify runs in **chunks of 25** (fills the table live, never overruns the 180s Vite dev-proxy timeout)
and can Cancel. `ApiError.status 0` → "backend unreachable"; `502` → sitemap error; `AbortError`
(Cancel) is swallowed. Every row carries a **▸ detail** panel: a **side-by-side OLD vs NEW card pair**
— each card a big colored HTTP pill with its word (`200 ใช้งานได้` / `301 redirect` / `404 error` /
`— เข้าถึงไม่ได้`, so the code is unambiguous), the URL, a content dot (body state), and H1 — plus the
old→`Location` / new final-URL line. The **file diff** and **verdict** (already-redirected / fallback
target) sit full-width below. A side with no URL shows "ฝั่งนี้ไม่มี URL" rather than a blank.

## 6. Operational traps

| Symptom | Cause | Mitigation |
|---|---|---|
| `ERR_EMPTY_RESPONSE` mid-run | a request ran past the **180s Vite dev-proxy timeout** ([`vite.config.js`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/vite.config.js)) | verify **streamed in chunks of 25**; each request stays short |
| Bogus 404/"unreachable" noise | a probe burst trips a **WAF/CDN rate-limit** | polite default concurrency (8), per-probe retries, browser UA; `_BLOCKED_CODES` treated as "loads in browser" not missing |
| A valid internal target rejected | **SSRF guard** blocks private/loopback/reserved IPs (up front 400 + every redirect hop) | intended; `REDIRECT_SSRF_BLOCK_PRIVATE=false` or `REDIRECT_URL_ALLOWLIST` for a trusted internal run |
| Env change not taking effect | container env is set at start; `--reload` only reloads **code** | `docker compose up -d` to recreate |

## 7. Known issues / cleanup found in this build

- ✅ **Dead site-wide file scan removed (2026-06-20)** — `/files` endpoint, `files_service.py`, the
  `FilesIn/FileItem/FilesOut` schemas, the `ExportIn.files` + `_sheet_files` plumbing, and `scanFiles()`
  are gone (per-row file compare is the live path). [Runbook R3](../../process/ai-runbooks.md).
- ✅ **Dormant `kind` (WD/IR) tag dropped (2026-06-20)** — removed from `MappingRow`/`RowVerdict` + the
  `verify_service` passthrough (no UI, no reader).
- ✅ **Repo README refreshed (2026-06-20)** — now lists all 4 endpoints (`discover/verify/webconfig/export`)
  + `openpyxl` + the real service layering.
- 🟡 **Test coverage** — `page_inspect` (soft-error / thin-body / file-extract) now has unit tests
  ([`Backend/tests/test_page_inspect.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/tests/test_page_inspect.py),
  run in CI). `verify_service` verdict mapping is still worth a mocked-transport test next.
