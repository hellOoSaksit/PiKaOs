---
title: Host Port Registry
type: reference
status: active
keywords: [ports, registry, reservation, host ports, frontend, backend, plugin, compose, collision]
related: [./deploy.md, ./tech-stack.md, ../pikaos-dev-rules.md, ../../../CLAUDE.md]
summary: >
  Single source of truth for host ports across the whole system. Read before creating an app,
  changing a port, or reserving a new one; update it in the same commit.
updated: 2026-06-20
---

# ports.md — host port registry for the entire PiKaOs system (read before every reservation)

> **Single source of truth for host ports.** Every app (main stack + all plugins) must **run simultaneously**
> with no port overlap. **Before creating a new app / changing a port / needing a new port → read this table first**, then reserve the next free pair.
> The hard rule lives in [`../../../CLAUDE.md`](../../../CLAUDE.md) (always-on rule 3, Registries) — this file is the "registry", CLAUDE.md is the "rule".

## Reservation table (host ports)

| App | Frontend | Backend | Other | Folder |
|---|---|---|---|---|
| **PiKaOs** (main — runs as 4 separate stacks: data/backend/ai/frontend, not all-in-one) | **5173** | **8000** | db **5432** · redis **6379** · minio **9000/9001** · ollama **11434** (opt-in `--profile localai`) | `PiKaOs-Core/` |
| **PiKaOs-Compare** | **5174** | **8001** | — (stateless) | `PiKaOs-Plugin/PiKaOs-Compare/` |
| **PiKaOs-RedirectMap** | **5175** | **8002** | — (stateless) | `PiKaOs-Plugin/PiKaOs-RedirectMap/` |
| _next plugin_ | _5176_ | _8003_ | _db/redis only if **published** (see rule 5)_ | — |

> Note: main's `5173` = **Vite dev server** (`pikaos-frontend`, dev default). The prod variant (nginx static,
> `docker-compose.frontend.yml`) listens on `:80` **inside the container** — the registered host port is always `5173`.

**Do not touch (reserved by main stack):** 5173 · 8000 · 5432 · 6379 · 9000 · 9001 · 11434 (when local Ollama is enabled)

## Reservation rules

1. **Frontend** starts at 5174 and counts up (`517x`) · **Backend** starts at 8001 and counts up (`800x`) — 1 pair per app.
2. Inside the container the app still listens on the original ports (frontend 5173 / backend 8000) — only change the **host** side that is mapped out
   (`"<host>:<container>"` in compose). main is now split into 4 stacks → ports live in `deploy/docker-compose.*.yml`
   (`docker-compose.data.yml` = db/redis/minio · `docker-compose.backend.yml` + `docker-compose.sim.yml` = backend ·
   `docker-compose.ai.yml` = ollama · `docker-compose.frontend.dev.yml` = Vite). A new plugin app copied from
   a sibling must be fixed **everywhere the port appears**:
   - `docker-compose.yml` (or that stack's compose) → `ports:` for both services + `CORS_ORIGINS`
   - `Frontend/vite.config.js` → host fallback (`127.0.0.1:<backend>`)
   - `start-*.bat` → the URL opened in the browser + the backend health-check URL
   - `.env.example` + backend `config.py` (`cors_origins` default) + README
   - then **add a row to this table** (in the same commit)
3. Container/volume names are already namespaced by the compose project (folder name) — the only real collision is the **host port**.
4. After changing a port → `grep -rn "<old port>"` in the app folder to catch anything missed.
5. **Stateful plugin datastores — internal by default, don't publish ([pikaos-dev-rules §6.2](../pikaos-dev-rules.md)).** A
   plugin's own db/redis/minio runs in its own compose project; its backend reaches it by **service name** over that network
   (`db:5432` inside), so the datastore needs **no host port and can't collide**. Leave it **unpublished**. Publish an **offset**
   host port (db `543x`, redis `638x`, …) **only** if you need host access to inspect it — and then **add it to the `Other` column
   above** (same commit). Never reuse main's `5432 / 6379 / 9000 / 9001`.

> Related: [`deploy.md`](deploy.md) (deployment), [`tech-stack.md`](tech-stack.md) (stack).
