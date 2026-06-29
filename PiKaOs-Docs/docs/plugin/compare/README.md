---
title: Compare (plugin) — docs index
type: index
status: active
keywords: [compare, uat vs production, sitemap coverage, deep diff, stateless, plugin, lifted feature, ports 5174 8001]
related: [./overview.md, ./errors.md, ./decisions.md, ../../features/compare.md]
summary: >
  File map + entry point for the plugin Compare app (UAT vs Prod coverage + deep diff).
  Read first; the lifted engine is documented in ../../features/compare.md, this folder owns only the plugin deltas.
updated: 2026-06-20
---

# Compare — plugin docs (read this first)

The **UAT vs Production** website compare tool, extracted as the **first** app in the plugin
line. It maps Production's `sitemap.xml` onto a UAT host to report URL **coverage**, plus an optional
**deep** body/heading/SEO/image/link/file diff. **Stateless** — no DB/redis; results + saved sites
live in the browser. **No login** (open tool).

> **AI-first, English** (token-cheap, unambiguous) per the shared router
> [`../../../../CLAUDE.md`](../../../../CLAUDE.md). Code lives in
> [`../../../../PiKaOs-Plugin/PiKaOs-Compare/`](../../../../PiKaOs-Plugin/PiKaOs-Compare);
> the repo `README.md` is GitHub-facing, **knowledge lives here**. This folder is kept separate on
> purpose — Compare is slated to fold back into the main PiKaOs system (see [`integration.md`](integration.md)).
>
> **The compare *engine* is NOT documented here — it is the lifted parent code.** For the *how*
> (the two modes, the deep block/heading diff, streaming, per-side auth, saved sites, the frontend
> screen internals) read [`../../features/compare.md`](../../features/compare.md). This folder owns
> only what the **plugin build changes**: status, errors, decisions, merge-back.

Ports **5174** (frontend) / **8001** (backend) — see the registry
[`../../architecture/ports.md`](../../architecture/ports.md). Runs in Docker via
[`start-compare.bat`](../../../../PiKaOs-Plugin/PiKaOs-Compare/start-compare.bat) or
`docker compose up -d --build`, then open **http://localhost:5174**. Extracted 2026-06-16 (v0.1).

## File map (1 file = 1 concept)

| File | Owns | Status |
|---|---|---|
| [`overview.md`](overview.md) | What it does · the two modes · what works today · **deltas from the in-PiKaOs Compare** · architecture-at-a-glance (layering · endpoints · deps · ports) | ✅ runs |
| [`errors.md`](errors.md) | **Error taxonomy** — domain errors → HTTP · coverage states · deep states · frontend mapping · the real-world operational traps (proxy timeout, WAF) · known issues/cleanup found in this build | ✅ as-built |
| [`decisions.md`](decisions.md) | **Design choices + alternatives considered/rejected** (stream-in-batches, no iframe preview, stdlib parser, chrome exclusion, polite concurrency, per-host auth, …) | ✅ rationale |
| [`integration.md`](integration.md) | Folding Compare back into the main PiKaOs system — what to re-gate, what to drop, the engine divergence risk | 🟡 plan |

## At a glance

- **One screen** ([`screens-compare.jsx`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Frontend/src/screens/screens-compare.jsx)) — inputs (URLs · direction · saved sites · deep toggle) + a streamed results table with per-row expandable deep detail. No nav/router.
- **Backend** = FastAPI, **open**, stateless: `POST /api/compare/{plan,batch,deep}` (streamed) + legacy `POST /api/compare` (one-shot) + `GET /api/health`. Every endpoint is cancellable (client abort → 499).
- **Deps trimmed** to `fastapi · uvicorn · httpx · pydantic · pydantic-settings` — no DB/JWT/auth libs. Content extraction is **stdlib `html.parser`** (no HTML-parser dep). Outbound fetches are **SSRF-guarded**.
