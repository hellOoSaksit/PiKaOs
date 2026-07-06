# Local dev — single generated compose (design)

**Date:** 2026-07-02
**Status:** approved, scoped to `PiKaOs-Core` local dev only
**Scope:** replaces the split 4-stack local-dev launcher (`data`/`backend`/`ai`/`frontend` as
separate `docker compose` projects) with one generated compose file, driven by the same
plugin-manifest compose-fragment mechanism `kernel-redesign.md` §3 defines for production
installs. Production/self-host deploy is explicitly **out of scope** — separate future spec.

## Why

- `PiKaOs-Core` finished the zero-datastore-kernel migration: datastores are now Tool plugins
  (`PiKaOs-Plugin-Tools-Postgres/-Redis/-MinIO`), each already shipping a `compose.fragment.yml`
  + `kind: tool` manifest entry (`provides`, `secrets`, `compose` fields — see
  `kernel-redesign.md` §2).
- The local-dev launcher (`start.bat`/`start.sh`) still hand-maintains 4 separate compose
  projects (`deploy/docker-compose.{data,backend,ai,frontend,frontend.dev,sim}.yml`) reflecting
  the pre-migration architecture — it never adopted the tool-plugin-fragment model.
- The merge logic already exists and is unit-tested: `PiKaOs-Core/Backend/app/core/
  compose_render.py` (`merge_fragments`, `load_tool_fragments`, `render_compose`) — see
  `tests/test_compose_render.py`. Only a CLI wrapper + launcher wiring is missing (the same gap
  `render_requirements.py` already closed for pip requirements).
- `Backend/worker-entrypoint.sh` already runs `arq app.plugins.redis.worker.WorkerSettings` — the
  worker's job registry is code-owned by the `redis` tool plugin already. The compose *service*
  definition hasn't caught up; it currently lives hardcoded in `docker-compose.backend.yml` /
  `docker-compose.ai.yml`.

## Design

### Base compose — `deploy/docker-compose.dev.yml` (new)
Kernel-only services: `backend` (FastAPI, hot-reload, bind-mounted code) and `frontend` (Vite dev
server, bind-mounted code). No datastores, no worker — those arrive via fragments.

### `Backend/scripts/render_compose.py` (new)
CLI wrapper around the existing `app/core/compose_render.render_compose()`, mirroring the shape of
`render_requirements.py`:
1. Read the enabled-plugin set the same way `compute_enabled.py` does (kernel plugin registry,
   local JSON — zero-datastore read).
2. Load every enabled `kind: tool` plugin's manifest + its `compose` fragment file.
3. Call `render_compose(base, enabled, manifests)` with `deploy/docker-compose.dev.yml` as base.
4. Write the merged document to `deploy/docker-compose.generated.yml` (gitignored, same treatment
   as `requirements.lock` — a build artifact, not source).

Run before `docker compose up`, same as `render_requirements.py` runs before `docker build`.

### `PiKaOs-Plugin-Tools-Redis/backend/compose.fragment.yml` (edit)
Add a second service, `worker`, using the `pikaos-backend` image with its command overridden to
run `worker-entrypoint.sh` (`arq app.plugins.redis.worker.WorkerSettings`) — alongside the
existing `redis` service. This makes the worker conditional on the `redis` tool plugin being
enabled, matching what the code already assumes.

### Launcher scripts (rewritten)
- `start.sh` / `start.bat`: Docker preflight (unchanged logic) → run `render_compose.py` → bring
  up ONE compose project (`docker compose -p pikaos -f deploy/docker-compose.generated.yml up -d
  --build`) → wait `/api/health` → open the browser. Replaces the current 4-stack sequential
  bring-up.
- `stop.sh` / `stop.bat`: `docker compose -p pikaos -f deploy/docker-compose.generated.yml down`.

### Retired
- `deploy/docker-compose.data.yml`, `.backend.yml`, `.ai.yml`, `.frontend.yml`,
  `.frontend.dev.yml`, `.sim.yml` — superseded by the base + generated file.
- `Frontend/dev.bat` — existed only to give `start.bat` a separate Windows Terminal tab for the
  frontend stack; unnecessary once it's one compose command.

### Untouched
- `fix-docker.bat` — standalone Windows Docker Desktop repair utility, unrelated.
- `scripts/upgrade-dep.sh` — the safe dependency-upgrade tool (`ai-runbooks.md` R4).
- `Backend/docker-entrypoint.sh`, `Backend/worker-entrypoint.sh` — still the in-container
  entrypoints; only *how they get launched* (via the generated compose instead of hand-written
  per-service compose files) changes.
- `deploy/docker-compose.prod.*.yml`, `.authtest.yml` — production/self-host is a separate,
  future spec (see `2026-07-02-hardening-and-fix-plan.md` Phase 1).

## Non-goals (this spec)
- Production/self-host single-server deploy (parked; separate spec later).
- Changing which plugins ship compose fragments beyond adding `worker` to `redis`.
- Any change to `PiKaOs-Core/Backend/app/core/compose_render.py`'s tested merge logic itself.

## Open risk to verify during implementation
- `docker-compose.sim.yml` (test-simulation overlay) — confirm nothing in CI depends on its
  specific file path before deleting; if CI references it directly, update `ci.yml` in the same
  commit.
