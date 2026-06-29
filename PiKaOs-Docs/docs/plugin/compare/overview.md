---
title: Compare (plugin) — overview, status & deltas
type: reference
status: built
keywords: [compare, sitemap coverage, two pages, deep diff, streaming, ssrf guard, per-side auth, deltas, endpoints, layering]
related: [./README.md, ./errors.md, ../../features/compare.md, ./integration.md]
summary: >
  What the plugin Compare does, what works at v0.1, its endpoints/architecture, and the deltas from
  the in-PiKaOs Compare engine. Read for the plugin surface + status.
updated: 2026-06-20
---

# Compare (plugin) — overview: what it does, what works, what's different

> The *how* of the engine lives in [`../../features/compare.md`](../../features/compare.md). This
> page is the plugin **surface + status + deltas** only.

## What it does

Compare a **UAT** site against **Production** and report the differences as data. Two modes (a
frontend toggle):

- **Sitemap coverage** (default) — Production's `sitemap.xml` is the source of truth. Each path is
  domain-swapped onto the UAT host and both sides are probed → `match · redirect · missing_on_uat ·
  broken_on_uat · prod_error · error` (+ UAT-only "extra" URLs if a UAT sitemap is given).
- **Two pages (direct)** — deep-diff any two exact URLs, even unrelated sites (no sitemap, no path
  matching).

On top of coverage, **deep mode** fetches full HTML of the first N matched pages and diffs
title/meta/canonical/og, the **H1–H6 heading outline**, the body **block-by-block**, image &
internal-link existence, and **downloadable files by filename**. Differing body blocks/headings are
**jump-links into the live page** (native scroll-to-text-fragment). Full behavior: parent doc §0–§4b.

## What works today (v0.1)

✅ Runs end-to-end in Docker (`start-compare.bat` → up → http://localhost:5174).
✅ Coverage — streamed plan → batches, live table, progress bar, **Cancel** (reaches the backend).
✅ Two-pages direct deep-diff.
✅ Deep diff — meta/headings/body-blocks/images/links/files; **incremental** (raise the page count →
fetches only the new pages); jump-to-live-page.
✅ **Per-side login** (HTTP Basic / header) for login-gated PROD or UAT; auto-prompt on 401/403; held
in memory only.
✅ **Saved sites** + per-run session cache (browser storage).
✅ **SSRF guard** on by default.
✅ Backend `--reload` + frontend hot reload via bind mounts (Windows polling).

## Architecture at a glance

Layering is the lifted parent stack — `routers/compare.py` → `services/compare_service.py` →
`services/{content,sitemap,net_guard}.py`. Stateless ⇒ **no `repositories/` layer**.

| Method + path | Purpose |
|---|---|
| `POST /api/compare/plan` | read sitemap(s) → URL pairs to probe (fast, no probing) |
| `POST /api/compare/batch` | probe one chunk of pairs + classify (client streams `COV_BATCH=30`) |
| `POST /api/compare/deep` | deep-compare one batch of pairs (client streams `DEEP_BATCH=2`) |
| `POST /api/compare` | **legacy one-shot** (coverage + inline deep) — frontend never calls it; back-compat only |
| `GET /api/health` | liveness → plain `{status, app, version}` |

- **Cancellation:** every endpoint runs in `_run_cancellable(request, coro)` — polls
  `request.is_disconnected()` and cancels the task on abort so in-flight outbound probes stop (→ **499**).
- **Frontend client** ([`lib/api.js`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Frontend/src/lib/api.js)):
  `coveragePlan` · `coverageBatch` · `compareDeep`, each with an `AbortSignal`. No token logic.
- **Deps** ([`requirements.txt`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/requirements.txt)):
  `fastapi · uvicorn · httpx · pydantic · pydantic-settings`. **Settings**
  ([`config.py`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/app/config.py)): `compare_*`
  tunables (timeout · concurrency/ceiling · retries · deep limits/caps · body-sim threshold · text/block caps)
  + CORS + SSRF — no db/redis/minio/auth keys.
- **Ports** 5174/8001 — changing them means changing every place in
  [`../../architecture/ports.md`](../../architecture/ports.md)'s reservation rules.

## Deltas from the in-PiKaOs Compare

This is the *only* substantive difference from [`../../features/compare.md`](../../features/compare.md).

| Dimension | Full PiKaOs Compare | Plugin (this app) |
|---|---|---|
| **Auth** | every endpoint `Depends(get_current_user)` (JWT) | **gate dropped — endpoints open**; no token / refresh-on-401 in `api.js` |
| **App shell** | sidebar nav (id `compare`), RBAC, dashboards, world | one screen, no nav, no RBAC ([`App.jsx`](../../../../PiKaOs-Plugin/PiKaOs-Compare/Frontend/src/App.jsx) renders it directly) |
| **Backend deps** | full stack (sqlalchemy/asyncpg/alembic/redis/minio/pyjwt/argon2 …) | trimmed to **5** packages |
| **Settings** | full `config.py` | only `compare_*` + CORS + SSRF |
| **Deploy** | 4-stack `deploy/` | single `docker-compose.yml` (2 services) + `start-compare.bat`, ports 5174/8001 |
| **Tests** | `tests/test_compare.py` (mocked transport) | **none shipped** — engine still accepts an injected `_client`, so they port over ([`errors.md`](errors.md) §known issues) |

The compare **engine is the byte-for-byte lifted parent code** — same modes, deep diff, streaming,
per-side `_HostAuth`, saved sites. Don't re-document it; fix it in both places (divergence risk —
[`integration.md`](integration.md)).
