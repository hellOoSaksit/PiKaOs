---
title: RedirectMap (plugin) — overview, data shape & architecture
type: reference
status: built
keywords: [redirectmap, many old one new, mapping rows, sitemap discover, verify, web.config, xlsx export, layering, endpoints, settings]
related: [./README.md, ./matching.md, ./file-audit.md, ./errors.md, ./decisions.md, ../../pikaos-dev-rules.md]
summary: >
  What RedirectMap is, the many-old→one-new data shape, the 4-step workflow, what works at v0.1, and the
  backend/frontend architecture. Read for the plugin surface + status.
updated: 2026-06-20
---

# Overview — what it is, the data shape, what works, architecture

## 0. What it is

A **two-service Docker app** that is *only* the redirect-map tool: map each **old-site URL → its
new-site target**, **verify** both sides, generate an IIS **`web.config`** for the 301s, and
round-trip the central **checklist** as CSV / `.xlsx`. One screen, no nav, no other modules, no login.

| | |
|---|---|
| **Frontend** | Vite + React ([`Frontend/`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/)) — one screen + the UI-kit pieces it uses. Proxies `/api` → backend. CSV parse/build + downloads are client-side. |
| **Backend** | FastAPI, **stateless, open** ([`Backend/`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/)) — mounts the redirect router + `/api/health`, no DB/redis/minio/auth. Only outbound path is the **SSRF-guarded** URL probe. Probes a **gated** old/new site (HTTP Basic Auth, e.g. a UAT login) by attaching per-host credentials sent on the request. |

The tool **does not serve the live 301s** — it produces + verifies the mapping and the `web.config`;
the old domain's own IIS / Azure App Service runs the redirects from that file.

## 1. The data shape — many OLD → one NEW

The real migration shape is **several old sites/URLs consolidating onto one new site** (e.g. several
`*.azurewebsites.net` + `*.listedcompany.com` hosts → `www.wha-up.com`). The single input panel is
built around it:

- **Symbol** (one) · **New site (base URL)** (one) · **Old sites / URLs** (a *list* — add several).
- The unit of work is a **mapping row** = `1 old → 1 new`, tagged by Symbol — exactly what
  `web.config` needs (one rewrite rule per old URL). Many old → one new = many rows sharing the new.
- Rows arrive from **sitemap discover** (per old site) or **CSV import**; the table is **read-only**
  (Symbol/URLs come from discover/import, the system fills status/notes — delete a row to drop it).

## 2. The 4-step workflow

1. **Build the mapping.** *Pull sitemaps + verify* (🚀): for **each** old site, read its
   `sitemap.xml`, domain-swap every page onto the one new base (matched to the closest real new URL
   by path similarity → a **Match %**, with a user-set **auto-pick threshold** default 95), and
   verify. Or **Import CSV** from the checklist. Full engine: [`matching.md`](matching.md).
2. **Verify.** Probe old (no-follow) + new (follow), then deep-fetch the HTML → status + content
   verdict. Full logic in [`errors.md`](errors.md).
3. **web.config.** Rows → IIS URL-Rewrite file (301 default; 302/307 + query-string + trailing-slash
   options). Download → drop at the old site's web root.
4. **Export Excel.** `.xlsx` matching the central template (`Ref/http_redirect_checklist_5_sites_by_symbol.xlsx`):
   the 3 template sheets (Redirect Checklist · Symbol Setup · Summary, same headers + status dropdown,
   per-Symbol counts) **plus a `ผลตรวจ` sheet that mirrors the on-screen table** — its left block is the
   web table column-for-column (No./Symbol/old/new/Match/Files/Body/Status/Note), and the right block
   adds the per-row detail (HTTP per side, redirect/final URL, the missing/added file lists). Body cells
   are color-tinted like the UI. The frontend sends the full verified rows (`ExportRow`), so a recipient
   who never opens the web app sees exactly what was on screen.

## 3. What works today (v0.1)

✅ Runs end-to-end in Docker (`start-redirectmap.bat` → `docker compose up -d --build` → http://localhost:5175).
✅ **Multi-old-site sitemap discover → one new site**, with path-similarity Match % + live verify.
✅ **Every URL shown (union of both sites)** — a URL with no counterpart still appears as a one-sided row (old-only → ติดปัญหา "ระบุ URL ใหม่"; new-only → ไม่ต้อง Redirect "หน้าเฉพาะเว็บใหม่").
✅ **Verify** — both sides probed; verdict = one of 4 checklist statuses ([`errors.md`](errors.md) §2).
✅ **Content-aware detection** — soft-error pages (200-but-broken), body has-content/H1-only, per-row file diff.
✅ **HTTP Basic Auth to gated sites — auto-detected** — any host that answers `401` (a page during verify, or a sitemap during discover) is added to the Login list automatically; the user only fills username/password (the host is also prefilled from the URLs already typed). Creds are sent on discover + verify so the gated site probes through.
✅ **Per-row expandable detail** (▸) — full HTTP/redirect/final-URL/body/file findings.
✅ **web.config** + **`.xlsx` checklist export** + **CSV import/export** (client-side).
✅ **SSRF guard** active by default; **Cancel** reaches the backend (499); Vite HMR + backend `--reload`.

| Feature | State |
|---|---|
| Multi-old discover · verify · per-row file+body · web.config · `.xlsx` · CSV | ✅ built |
| HTTP Basic Auth to **gated target sites** (per-host user/pass, e.g. UAT) | ✅ built |
| Page-login gate (login to use the **tool**) | ❌ removed (plugin is open; re-add via main RBAC on merge) |

## 4. Architecture at a glance

Layering: `routers/redirect.py` (thin: parse → service → map errors to HTTP) → `services/*`.
Stateless ⇒ **no `repositories/` layer**.

| Module | Job |
|---|---|
| [`main.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/main.py) | FastAPI app; redirect router + `GET /api/health`; CORS |
| [`config.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/config.py) | env-driven `Settings` — mappings are **never** hardcoded |
| [`schemas.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/schemas.py) | Pydantic request/response + `STATUS_*` |
| [`routers/redirect.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/routers/redirect.py) | the 4 endpoints + `_run_cancellable` (499 on disconnect) |
| [`services/discover_service.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/discover_service.py) | old sitemap (+ new for matching) → proposed `old→new` rows ([matching.md](matching.md)) |
| [`services/filescan_service.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/filescan_service.py) · [`file_compare_xlsx.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/file_compare_xlsx.py) | **File Audit** (v0.3): whole-site BFS crawl of both sites → compare every document by filename ([file-audit.md](file-audit.md)) · compare-table xlsx |
| [`services/verify_service.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/verify_service.py) | probe both sides + deep file/body + soft-error override → `RowVerdict` |
| [`services/probe.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/probe.py) | HTTP probe (HEAD→GET, browser UA, retries) + body-returning GET |
| [`services/page_inspect.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/page_inspect.py) | pure-regex HTML inspect: `extract_files` + `body_signal` (has_body/thin/error) |
| [`services/credentials.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/credentials.py) | request-supplied HTTP Basic Auth → `host → httpx.BasicAuth` map (`build_auth_map` / `auth_for`) for gated sites |
| [`services/sitemap.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/sitemap.py) · [`net_guard.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/net_guard.py) | sitemap fetch/parse (takes optional `auth`) · SSRF guard (reused from Compare) |
| [`services/webconfig.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/webconfig.py) · [`checklist_xlsx.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/checklist_xlsx.py) | rows → IIS XML · `ExportRow`s → `.xlsx` (openpyxl): 3 template sheets + a `ผลตรวจ` sheet mirroring the on-screen table |

**Endpoints** (all `/api/redirect/*`, open): `POST /discover` · `POST /verify` (`deepCheck` default
true, streamed in chunks of 25) · `POST /webconfig` · `POST /export` · `POST /filescan` (whole-site
File Audit crawl — [file-audit.md](file-audit.md)) · `POST /fileexport` (compare-table xlsx) +
`GET /api/health`. `discover` + `verify` + `filescan` accept an optional
`credentials: [{host, username, password}]` list (HTTP Basic Auth, matched to a probed URL by host).
Errors: `BlockedURLError`→400 · `SitemapError`→502 · disconnect→499.

**Frontend** ([`Frontend/src/`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src)):
[`App.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/App.jsx) (top bar, no login) ·
[`screens/screens-redirect.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-redirect.jsx) (the one screen) ·
[`lib/api.js`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/lib/api.js) ·
[`data/redirect-rows.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/data/redirect-rows.jsx) (localStorage rows + Basic-Auth creds · CSV · `STATUSES`).
Vite dev-proxies `/api` → `127.0.0.1:8002` (180s); verify streamed in chunks of 25.

**Settings** (env — [`config.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/config.py)):
`redirect_timeout_seconds` · `redirect_default_concurrency` (8) / `_max_concurrency` (100) ·
`redirect_max_rows` (2000) · `redirect_probe_retries` / `_backoff_seconds` · **`redirect_body_min_chars`
(40)** · `redirect_file_exts` · `redirect_ssrf_block_private` (true) · `redirect_url_allowlist` ·
`cors_origins`. **Deps (6):** `fastapi · uvicorn · pydantic · pydantic-settings · httpx · openpyxl`.

**Ports** 5175/8002 — see [`../../architecture/ports.md`](../../architecture/ports.md). Code
hot-reloads (bind mount + `--reload`/HMR); **env changes need `docker compose up -d`** to recreate.
