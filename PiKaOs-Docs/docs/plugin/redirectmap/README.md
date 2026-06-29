---
title: RedirectMap (plugin) — docs index
type: index
status: active
keywords: [redirectmap, url redirect, web.config, iis 301, checklist xlsx, sitemap discover, stateless, net-new, ports 5175 8002]
related: [./overview.md, ./matching.md, ./file-audit.md, ./swapcheck.md, ./errors.md, ./decisions.md, ../compare/README.md]
summary: >
  File map + entry point for the plugin RedirectMap app (old→new URL mapping, verify, web.config, checklist).
  Read first; net-new (not lifted), so its engine is documented in this folder.
updated: 2026-06-22
---

# RedirectMap — plugin docs (read this first)

The **old-site → new-site URL redirect** tool, the **second** app in the plugin line (after
[Compare](../compare/README.md)). Map each old URL to its new target, **verify** both sides (HTTP
status **and** what the page actually contains), generate an IIS **`web.config`** for the 301s, and
round-trip the central **checklist** as CSV / `.xlsx`. **Stateless** — no DB/redis; mappings live in
the browser (localStorage) + the files you import/export. **No login** (open tool).

> **AI-first, English** (token-cheap, unambiguous) per the shared router
> [`../../../../CLAUDE.md`](../../../../CLAUDE.md). Code lives in
> [`../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap);
> the repo `README.md` is GitHub-facing, **knowledge lives here**. This folder is kept separate on
> purpose — RedirectMap is slated to fold into the main PiKaOs system (see [`integration.md`](integration.md)).
>
> Unlike Compare, RedirectMap is **net-new (not lifted from main)**, so it has **no parent feature
> doc** — its engine is documented here (concisely; the code is the source of truth). It reuses
> Compare's outbound patterns (SSRF guard, sitemap fetch, probe/UA policy).

Ports **5175** (frontend) / **8002** (backend) — registry
[`../../architecture/ports.md`](../../architecture/ports.md). Runs in Docker via
[`start-redirectmap.bat`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/start-redirectmap.bat) or
`docker compose up -d --build`, then open **http://localhost:5175**. v0.4.0.

## File map (1 file = 1 concept)

| File | Owns | Status |
|---|---|---|
| [`overview.md`](overview.md) | What it does · the **many-old → one-new** data shape · the 4-step workflow · what works today · architecture-at-a-glance (layering · endpoints · schemas · settings · deps · ports) | ✅ built |
| [`matching.md`](matching.md) | **The discover & fuzzy-matching engine** — path-similarity scoring (difflib) · the user-adjustable **auto-pick threshold (`matchThreshold`, default 95)** · exact-match · candidates · target-collision · one-sided rows · domain-swap fallback · how Match % is shown/reused | ✅ built |
| [`file-audit.md`](file-audit.md) | **The whole-site File Audit tab (v0.3)** — BFS crawl of both sites · every linked document gathered · **compare by filename** (`only_old` = missing on new) · `POST /filescan` + `/fileexport` · the tab/screen · compare-table xlsx · WAF/JS caveat | ✅ built |
| [`swapcheck.md`](swapcheck.md) | **The Swap-check tab (v0.4)** — pull old sitemap → pure same-path **domain swap** (`swapOnly`) → **follow-redirect probe** → final status + landing URL · browser/Google model (pass = real 200 incl. via server redirect · 404 just reported) · **reuses `/discover` + `/verify`, no new engine** | ✅ built |
| [`errors.md`](errors.md) | **Error taxonomy** — domain errors → HTTP · the 4 verify verdicts · **soft-error pages (200-but-broken)** · body/file content checks · frontend mapping · operational traps · known issues/cleanup | ✅ as-built |
| [`decisions.md`](decisions.md) | **Design choices + alternatives considered/rejected** (many→one shape, content-aware verdict, browser UA, regex inspect, streaming, no login, …) | ✅ rationale |
| [`integration.md`](integration.md) | Folding RedirectMap into the main PiKaOs system — what to re-gate, what to dedupe with Compare, what to drop | 🟡 plan |

## At a glance

- **Three tabs** (header switcher, no router) — **Redirect map** ([`screens-redirect.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-redirect.jsx)): a merged "pull + compare" panel (many old sites/URLs → **one** new site), a collapsible **Basic-Auth** subsection (per-host login for gated/UAT sites — auto-populated from any `401` the verify/discover run hits), and a results table with a per-row expandable detail. **File audit** ([`screens-fileaudit.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-fileaudit.jsx), v0.3): whole-site crawl of both sites → every document compared by filename → [`file-audit.md`](file-audit.md). **Swap check** ([`screens-swapcheck.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-swapcheck.jsx), v0.4): pull old sitemap → same-path domain swap → follow-redirect probe → final status/landing URL → [`swapcheck.md`](swapcheck.md). The three tabs **share** Symbol · new base · old list · Basic-Auth creds (lifted to App — switch tabs, data carries over).
- **Backend** = FastAPI, **open**, stateless: `POST /api/redirect/{discover,verify,webconfig,export,filescan,fileexport}` + `GET /api/health`. Discover/verify/filescan are cancellable (client abort → 499). **Swap check adds no endpoint** — it reuses `/discover` (with the `swapOnly` flag = skip new-sitemap matching) + `/verify`.
- **Deps trimmed** to `fastapi · uvicorn · httpx · pydantic · pydantic-settings · openpyxl` — no DB/JWT/auth libs. Detection is **stdlib/regex** (`page_inspect`), no HTML-parser dep.
