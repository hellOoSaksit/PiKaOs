---
title: Plugin line — index & shared contract
type: index
status: active
keywords: [plugin, pikaos-plugin, docker app, port offset, modularity, re-integration, merge-back, stateless, coexist]
related: [./compare/README.md, ./redirectmap/README.md, ../architecture/ports.md, ../pikaos-dev-rules.md]
summary: >
  Index + the shared contract every PiKaOs-Plugin app obeys (coexist, no-login, self-contained,
  re-integration-ready). Read first before building or extracting any plugin.
updated: 2026-06-20
---

# plugin/ — the PiKaOs-Plugin line (read this first)

> Owns: the **PiKaOs-Plugin line** — big features built (or lifted) as their own
> Docker apps (frontend + backend, **+ their own DB when stateful**) that **run side-by-side**
> with the main stack and with each other (port-offset, see below). This is the index + the shared
> contract every plugin obeys.
> All docs here are **English** (AI-first); Thai only for content. See the router
> [`../../../CLAUDE.md`](../../../CLAUDE.md) + the docs map [`../README.md`](../README.md).

## When to build a plugin (the default for big features)

**A big new system starts here, not inside main.** When a feature is large enough to be its own
deliverable — a whole screen + its own endpoints, optionally its own data — build it as a
**PiKaOs-Plugin first**, then fold it into main later:

- **Ship it alone, fast** — one `start-*.bat`, one `docker compose up`, no PiKaOs platform needed;
  a department can run just this tool. See [`../architecture/modularity.md`](../architecture/modularity.md)
  (per-department local install) — a plugin is the most extreme cut of that idea.
- **Prove it in isolation** before it inherits main's auth, shell, RBAC, i18n and schema.
- **Build it re-integration-ready from day one** (see the contract) so folding it back into main is
  mechanical, not a rewrite.

This applies whether the feature is **stateless** (Compare, RedirectMap — no DB) or **stateful**
(brings its own DB). Small additions to an existing screen are **not** plugins — extend main per
[pikaos-dev-rules §1–§2](../pikaos-dev-rules.md). The full how-to (extraction + re-integration
checklists) is [pikaos-dev-rules §6](../pikaos-dev-rules.md).

## The contract every plugin obeys

| Rule | Detail |
|---|---|
| **Coexists** | Host ports are **offset** so all apps run at once — single registry [`../architecture/ports.md`](../architecture/ports.md). Inside the container the original ports stay (frontend 5173 / backend 8000); only the **host** side is remapped. |
| **No login (this line, v0.x)** | The auth gate (`Depends(get_current_user)`) is dropped → endpoints are **open**. Put it behind a network boundary / reverse proxy if exposed. Re-gate on merge-back. |
| **Self-contained** | Own `docker-compose.yml` + `start-*.bat` + `.env.example`. Deps trimmed to only what the feature needs. |
| **Own data, own Docker (when stateful)** | Stateless feature → 2 services (frontend + backend), localStorage/CSV for state (Compare, RedirectMap). **Stateful feature → add its own DB** (and redis/minio if needed) as services **in its own compose project** — never share or reach into main's datastores. The DB stays **internal to the plugin's network** (`db:5432` inside the project) and is **not published to the host by default**, so it can't collide; publish an **offset** host port only if you need host access, and register it ([ports.md](../architecture/ports.md)). Schema runs through the **same Alembic flow** as main ([pikaos-dev-rules §2.3](../pikaos-dev-rules.md)) so it ports back cleanly. |
| **Re-integration-ready** | Keep lifted/parent code aligned with main and the merge-back boundaries clean **as you build** — write the app's `integration.md` (or a Merge-back section) up front, not after. |
| **Versioned, gated promotion — UAT ↔ Production** | Each copy carries a **version** (`vMAJOR.MINOR`, declared once in `config.py` → `/api/health` + README + doc header). The plugin (UAT) may run **ahead** of main (Production); the gap is tracked by version + an `## Unreleased — pending promotion to main` changelog in the app's doc — **main's docs are not touched**. **Production is never updated until the user explicitly approves promotion**; then code + the pending changelog fold into main + main docs, main bumps to the new version, the two **reconverge**. Net-new features built plugin-first flow the same way (merged **into** main on approval). Full rule: [pikaos-dev-rules §6.4–§6.5](../pikaos-dev-rules.md). |
| **Deps & shared engine come FROM main (one-way)** | A plugin takes its libraries + **versions** + lifted engine (`net_guard`/`sitemap`/probe/UI-kit/scaffold) from **main** — main is upstream for that shared layer. Main may upgrade them independently **only if non-breaking AND the change is propagated to the plugin** (same commit, version bumped). The *feature* flows the other way (UAT→main). Full rule: [pikaos-dev-rules §6.6](../pikaos-dev-rules.md). |
| **README = GitHub** | Each app's `README.md` is its GitHub overview; the **knowledge lives here** in `docs/plugin/`. |

## Apps (one subfolder per app)

| App | Docs | Code | Ports (host) | State | Status |
|---|---|---|---|---|---|
| **Website Compare** | [`compare/`](compare/README.md) | [`PiKaOs-Plugin/PiKaOs-Compare/`](../../../PiKaOs-Plugin/PiKaOs-Compare/) | 5174 / 8001 | stateless | ✅ runs (v0.1) |
| **RedirectMap** | [`redirectmap/`](redirectmap/README.md) | [`PiKaOs-Plugin/PiKaOs-RedirectMap/`](../../../PiKaOs-Plugin/PiKaOs-RedirectMap/) | 5175 / 8002 | stateless | ✅ built · 🟡 to integrate |

Both apps use the same **subfolder** layout (`README.md` index + `overview`/`errors`/`decisions`/`integration`,
1 concept each). They differ only in depth: **Compare** is a *lifted* feature, so its docs are **thin** —
they link the in-PiKaOs engine doc [`../features/compare.md`](../features/compare.md) instead of
duplicating it. **RedirectMap** is *net-new* (no parent), so its engine is **documented in-folder**.

## Reading order

1. This file — the contract.
2. The app's subfolder `README.md` — its file map, then **status / errors / decisions / merge-back**.
3. For a *lifted* app, the **parent feature doc** under [`../features/`](../features) for the **shared
   engine behavior** — the app doc links it instead of duplicating it.

## Rules for this folder

- 1 subfolder = 1 app (`<app>/` with a `README.md` index + topic files —
  `overview`/`errors`/`decisions`/`integration`, 1 concept each). A new plugin → new subfolder +
  a row in the table above + a row in [`../architecture/ports.md`](../architecture/ports.md)
  (incl. any **published** datastore port), same commit.
- Every plugin doc carries a **Merge-back** section (or `integration.md`) — written as the app is
  built, per the [re-integration-ready contract](#the-contract-every-plugin-obeys).
- Don't duplicate a parent feature doc — **link it** and document only what the plugin changes.
- Links are relative from the file (plugin code = `../../../PiKaOs-Plugin/...` from a flat
  `<app>.md`, `../../../../PiKaOs-Plugin/...` from inside an app subfolder).
