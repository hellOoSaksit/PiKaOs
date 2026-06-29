---
title: PiKaOs dev rules (operating contract)
domain: pikaos
type: rule
service: pikaos
status: active
keywords: [dev rules, conventions, frontend, backend, deploy, migrations, layering, auth, seed, plugin, extraction, re-integration]
related: [./README.md, ./architecture/ports.md, ./plugin/README.md, ../../CLAUDE.md]
summary: >
  The full PiKaOs operating contract — running, frontend, backend, infra, auth, data files,
  plugin apps — relocated out of CLAUDE.md so the shared root router stays thin. The root
  CLAUDE.md points here for all PiKaOs §-references.
updated: 2026-06-20
---

# PiKaOs dev rules — the operating contract

The rules for working in the **PiKaOs** app (`../../PiKaOs-Core/`) that **aren't obvious from
the code**. The shared router [`../../CLAUDE.md`](../../CLAUDE.md) holds always-on rules + the
map and points here for the PiKaOs `§`-references below. Read the relevant `§` before changing
anything. `Frontend/…`, `Backend/…`, `deploy/…` paths in this file are inside
[`../../PiKaOs-Core/`](../../PiKaOs).

> **All code — clarity first ([CLAUDE.md](../../CLAUDE.md) always-on rule 7).** Every section below
> assumes it: write for the next reader, simplest thing that works (KISS), small single-purpose
> units, intention-revealing names, comments explain *why* not *what*, and **match the style of the
> file you're in**. The §-specific rules are *how* that principle applies per layer.

---

## 0. Running — ask first, then start script / compose (hard rule)

**Before you launch or serve ANY app or stack, ASK first — _"Want me to run it, or will you run it
yourself?"_ — and wait for the answer.** Then:
- **User says you run it** → use the **sanctioned path only**: a **start script** (`start*.bat`) or
  `docker compose up -d` for that stack.
- **User will run it** → **wait, don't launch.**

**Either way, never a backgrounded/hidden dev server** — no `npm run dev`, `start /b`, `vite`,
`run_in_background`, or detached shell spawned behind the scenes (it leaks processes + hides logs).
**The whole stack runs in Docker** (frontend included): the app is launched by
[`start.bat`](../../PiKaOs-Core/start.bat), which: (1) ensures
the Docker engine is up — running [`fix-docker.bat`](../../PiKaOs-Core/fix-docker.bat) (admin/UAC) if not;
(2) brings up the **4 separate stacks** (each its own compose project/network — see §3), in order:
`pikaos-data` (db·redis·minio) → `pikaos-backend` (API, hot-reload) → `pikaos-ai` (arq worker) →
`pikaos-frontend` (Vite dev, hot-reload); (3) opens `http://localhost:5173` and exits. Stop everything
with [`stop.bat`](../../PiKaOs-Core/stop.bat). **No all-in-one, no cmd tabs** — watch logs in Docker Desktop
(or `docker compose -p pikaos-<stack> logs -f`).

- Verifying changes: a one-shot frontend compile check (`docker compose -p pikaos-frontend -f
  deploy/docker-compose.frontend.dev.yml exec frontend npm run build`) and backend tests (§2.5) are
  fine — those don't need to ask. To **run/serve** the app, **ask first** (above): then either you run it
  via `start.bat` / `docker compose up -d`, or the user does — but always confirm which, every time.

---

## 1. Frontend (`Frontend/src/`)

> All `src/…` paths in this section are relative to `Frontend/`. Run npm + greps there.

### 1.1 Component-first (hard rule)
The UI kit is in `src/components/ui/`; app-level primitives in
`src/components/components.jsx` (Btn, Panel, PageHead, Avatar, Badge, StatTile …).
Decision order — **don't skip**:
1. **Reuse** from `src/components/ui/` + `components.jsx` (Button, Spinner, Checkbox,
   Switch, Segmented, Field, Badge, Tooltip, Progress, Modal, Toast, StatusPopup,
   Select/Menu/MultiSelect, Tags, TextFormatToolbar, Highlight, Input, DatePicker,
   SoftDeleteRow, Todo, Search, Filter, LoadingPopup, Notifications, Letters3D, SaveBar).
2. **Extend** a component with a prop rather than duplicating.
3. **Create new** only when truly missing — and completely: new `ui/<Name>.jsx`
   (1 file/1 component, default export) → styles in `ui/ui-kit.css` (use tokens) →
   export in `ui/index.js` → add a `<Sec>` to `screens/screens-library.jsx` under
   "EXTENSIONS" with `isNew`.
4. Never hand-roll `<select>`, dropdown, modal, toast, switch, datepicker in screens.

Pre-ship: `grep -rn "<select" src/screens src/App.jsx` empty · no hand-rolled `dd`
dropdowns · modals via `ui/Modal.jsx` or `window.uiConfirm/uiAlert/uiLoading` ·
toggles via `ui/Switch.jsx` · inputs use class `bf-input` · new components appear in
`screens-library.jsx`.

### 1.2 i18n — no hardcoded UI strings
Data-driven. Files `src/data/i18n/<lang>-<lexicon>.json` (1 file = 1 language + 1
vocabulary style; packs: `en-formal` master, `th-formal`, `ja-formal`). `src/lib/i18n.jsx`
auto-scans the folder (`import.meta.glob`) — adding a file makes it appear in the picker; the
default lang+lexicon come from `isDefaultLanguage`/`isDefaultLexicon` flags (English + Formal).
**Screens call `t("ns.key", { var })` only.** New strings → add to **en-formal + th-formal**
first; other packs inherit via the 4-level fallback (lang+lexicon → lang+default → default-lang
+lexicon → master → key). Intentionally-Thai content (chat, `.md`, seed data) is content, not keyed.

### 1.3 Auth client
The browser side of login lives in three files:
`src/lib/api.js` (fetch wrapper — prefixes `VITE_API_BASE=/api`, attaches the access
token from memory+`localStorage["pikaos.access"]`, sends the refresh cookie, and
**refreshes once on 401** then retries) → `src/lib/auth.jsx` (`useAuth()` hook:
`{ user, ready, loggedIn, login, logout }`, revives the session on load) →
`src/screens/Login.jsx` (the form; calls `onLogin`). `App.jsx` gates on
`auth.ready`/`auth.loggedIn`. Don't call `fetch` to the backend directly from screens
— go through `api.js`.

### 1.4 Style / theme
Single indigo accent, two themes, **tokens only** — full governance is the
[design guide §2–§6](../design-system/Design%20System/README.md). Tokens in
`src/styles/styles.css` (`:root` = pro, `[data-theme="pro-dark"]`; accent named
`--gold` for history). No hardcoded colors — derive with `color-mix`. Motion uses
`var(--spring)`/`var(--spring-soft)` inside `@media (prefers-reduced-motion: no-preference)`.
`src/styles/index.css` import order: `ui-kit.css` → `styles.css` → `components.css` →
`world.css` → `kit-overlays.css` → `dashboard.css` → `rbac.css` → `fx.css`.

### 1.5 Preview build artifact
`../design-system/PiKaOs App Preview.html` (design deliverables live in the **PiKaOs-Docs**
repo) is generated from all of `src/` — **never edit it directly**; edit `src/` then rebuild.
Invariant: the hook preamble (`const { useState… } = React`) appears once; top-level name
collisions across files are forbidden.

### 1.6 Screen modules — split big files via barrels (hard rule)
When a screen file grows large it's split into focused modules in a sibling folder,
and the original filename stays as a **thin barrel** that re-exports the same public
surface (and keeps any `window.*` side-effects). This is why imports never change when
a file is split — consumers still import from `screens-<name>.jsx`.

Current barrels and their folders:

| Barrel | Folder | What lives there |
|---|---|---|
| [`screens-world.jsx`](../../PiKaOs-Core/Frontend/src/screens/screens-world.jsx) | [`world/`](../../PiKaOs-Core/Frontend/src/screens/world) | sprite · chat · exports · sessions · doc editor · room-aside · lobby · build sandbox · `World` |
| [`screens-extra.jsx`](../../PiKaOs-Core/Frontend/src/screens/screens-extra.jsx) | [`extra/`](../../PiKaOs-Core/Frontend/src/screens/extra) | `codex` · `recall` · `dashboards` (Mana/Treasury/Chronicle/QuestLog/Watchtower) · `settings` |
| [`screens-secondary.jsx`](../../PiKaOs-Core/Frontend/src/screens/screens-secondary.jsx) | [`secondary/`](../../PiKaOs-Core/Frontend/src/screens/secondary) | `AgentDrawer` · `QuestDrawer` · `QuestBoard` (+`TaskDetail`) · `Agents` · `Meeting` · `task-utils` |

Rules when working in these areas:
- **One module = one concern.** Edit the module, not the barrel — only touch the barrel to
  add/rename/remove an export.
- A file-private translator shared by several modules lives in a tiny helper
  (`world/wt.js`, `secondary/st.js`) exporting a live `wt`/`st` binding + a `setWt`/`setSt`
  setter; the top-level screen calls the setter once on render. Don't re-declare a local
  `wt`/`st` per module — import the shared one.
- Keep imports pointed at the **barrel** (`./screens-world.jsx`), not deep paths, unless you
  have a reason to — avoids churn and respects the name-collision invariant in §1.5.
- When a screen file gets unwieldy (the three above were >700 lines), mirror this pattern
  (folder + barrel) rather than inventing a new one.

### 1.7 Room system — Three.js room + procedural avatars
Large enough to own its doc → **[features/room-3d.md](features/room-3d.md)**.
The live room is a real-3D Three.js scene; **two renderers, one data model** —
[`lib/room-three.jsx`](../../PiKaOs-Core/Frontend/src/lib/room-three.jsx) (3D) +
[`lib/room-tiles.jsx`](../../PiKaOs-Core/Frontend/src/lib/room-tiles.jsx) (2D thumbnails) share `FURN.draw3d`
and avatar identity via [`lib/avatar-style.js`](../../PiKaOs-Core/Frontend/src/lib/avatar-style.js).
Hard rules that bite: **data model unchanged** (`guildos.rooms.v2`); `FURN` keys +
footprints + `draw3d` stable; shared geos/mats cached, never disposed. Read the doc
before touching the room/avatar/life-sim path.

---

## 2. Backend (`Backend/app/`)

FastAPI + async SQLAlchemy (asyncpg) + Redis + MinIO. Runs only as a Docker service.

### 2.1 Layering (hard rule) — keep each layer's job pure
```
routers/   HTTP only: parse request → call a service → shape the response (+ cookies/status)
services/  business logic: orchestrate repositories + security + redis. No FastAPI types in/out
repositories/  ALL SQL lives here (one module per aggregate). No raw queries anywhere else
deps.py    FastAPI dependencies (get_current_user, require_role)
models.py  SQLAlchemy ORM models     schemas.py  pydantic request/response
security.py  argon2 hashing + JWT     redis_client.py  refresh/denylist helpers
storage.py   MinIO (md/img/log/pdf)   config.py  settings (env only — never hardcode secrets)
```
Rules: no business logic in routers (push to `services/`); no SQL outside
`repositories/`; every DB/redis/network call is `async`; tokens only via `security.py`;
Redis only via `redis_client.py`; files only via `storage.py`; read config only from
`config.settings`.

### 2.2 Add an endpoint (recipe)
1. Request/response shapes → `schemas.py`.
2. New query? → add a function to `repositories/<aggregate>.py`.
3. Logic → a function in `services/<area>_service.py` (raise small domain errors).
4. Thin route in `routers/<area>.py` (map errors → HTTP) — **a write endpoint declares its permission with `Depends(require_perm("<perm>"))`** (`deps.py` → `rbac_service`; design: [risk-mitigation §2](architecture/risk-mitigation.md)); then `include_router` in `main.py`.
5. Test in `tests/` (hits the live server — see 2.5).

### 2.3 Migrations (Alembic)
Schema changes go through migrations in `Backend/alembic/versions/`. Base tables are in
`0001_baseline` (modular, organized by bounded context — [modularity.md](architecture/modularity.md)); `0005_doc_chunks` turns on the `vector` extension for RAG (knowledge-rag.md §3). Autogenerate a new one
(the backend stack must be up — see §0):
`docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml exec backend alembic revision --autogenerate -m "what changed"`,
review it, then it applies automatically on the next container start (entrypoint runs
`alembic upgrade head` → `scripts/seed.py` → uvicorn).

**Every schema change updates the ER doc in the same commit (hard rule).** When you add/drop a table or
column, change an FK/index, or move a table's status, update [data-model.md](architecture/data-model.md)
— the as-built, table-by-table reference for non-technical successors (each column = what it stores; each
FK = what happens on delete; status legend = LIVE / ENGINE / unused / TEST). A stale ER doc is worse than
none. Truth = the migration + `models.py`; the doc summarizes them, never guesses.

### 2.4 Seeding
`Backend/scripts/seed.py` mirrors the 6 frontend users and is **idempotent** (skips
existing usernames). All seeded users share `SEED_PASSWORD` (dev default `pikaos123`).
Default login: `somchai` / `pikaos123` (admin).

### 2.5 Tests
`Backend/tests/` use httpx against the **live** server (avoids async-loop issues with
the module-level engine/redis). Run against the running backend stack:
`docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml exec backend pytest`.

### 2.6 Compare module (UAT vs Production) — the one *outbound* feature
The compare path (`POST /api/compare` + `/api/compare/deep`, plus the Compare Content screen) is
large enough to own its doc → **[features/compare.md](features/compare.md)**. Highlights: Production sitemap = source
of truth; **stateless** (no DB → no `repositories/` layer); coverage runs the whole sitemap in
parallel; **deep mode** streams in batches to dodge the 120s proxy timeout; stdlib-only HTML parse
(no new dep). Read it before touching the compare path.

### 2.7 Sitemap Generate / Audit (designed, not built)
"URL in → IA diagram out" (ShareInvestor-style) + AI classify (Local→API) owns its doc →
**[features/sitemap-generate.md](features/sitemap-generate.md)**; companion:
[features/checklist-audit.md](features/checklist-audit.md) (template→audit + Discovery §3.0).
Read both before touching the audit/sitemap path (incl. `screens-sitemap.jsx`).

---

## 3. Infrastructure — 4 separate stacks ([`deploy/`](../../PiKaOs-Core/deploy))

The app runs as **4 independent compose projects**, each its own network — **no all-in-one**. Stacks
reach each other over the host (`host.docker.internal:<published-port>`), like real separate servers /
managed datastores. `start.bat` brings them up in order; `stop.bat` tears them down.

| Stack (project) | Compose file(s) | Service(s) | Host port | Notes |
|---|---|---|---|---|
| **data** `pikaos-data` | [`data.yml`](../../PiKaOs-Core/deploy/docker-compose.data.yml) | db (`pgvector/pgvector:pg16`) · redis (`redis:7`) · minio | 5432 · 6379 · 9000/9001 | volumes `pgdata`/`redisdata`/`miniodata`; published to host |
| **backend** `pikaos-backend` | [`backend.yml`](../../PiKaOs-Core/deploy/docker-compose.backend.yml) + [`sim.yml`](../../PiKaOs-Core/deploy/docker-compose.sim.yml) | backend (FastAPI) | 8000 | dev = `sim.yml` (host.docker.internal URLs + `UVICORN_RELOAD` + mount). Runs `alembic upgrade` + seed on boot |
| **ai** `pikaos-ai` | [`ai.yml`](../../PiKaOs-Core/deploy/docker-compose.ai.yml) | worker (arq) · ollama (opt-in) | — / 11434 | worker talks to backend via Redis+Postgres, never HTTP. Ollama behind `--profile localai` |
| **frontend** `pikaos-frontend` | [`frontend.dev.yml`](../../PiKaOs-Core/deploy/docker-compose.frontend.dev.yml) | Vite dev server | 5173 | hot reload; proxies `/api`,`/ws` → `host.docker.internal:8000`. (prod = nginx static `frontend.yml`, :80) |

> **Ports — read the registry before allocating (hard rule).** PiKaOs **owns** host ports `5173` ·
> `8000` · `5432` · `6379` · `9000/9001` (+ `11434` when local Ollama is on). The sibling
> **[PiKaOs-Plugin](../../PiKaOs-Plugin)** apps run **at the same time** on offset ports (Compare
> 5174/8001, RedirectMap 5175/8002, …). The one registry is **[ports.md](architecture/ports.md)** —
> read it before adding/changing/needing any port, never reuse one, and update it in the same commit when
> you change a port anywhere (compose, vite, start-*.bat, CORS).

Config is split **per component** (deploy-separable), each loaded via compose `env_file:` (copy each
`*.example`, all gitignored): **`Backend/.env`** = backend/data/ai stacks + Postgres/MinIO creds ·
**`.env.ai`** = LLM/embedding providers (backend · worker — shares `SECRET_KEY` with Backend/.env) ·
**`Frontend/.env`** = `VITE_*` only (**PUBLIC — never a secret**). `Backend/.env` keeps compose-name
URLs (`@db`/`@redis`/`minio`); `sim.yml` overrides them to `host.docker.internal` for the split. The
prod guard refuses to boot in `ENVIRONMENT=production` with dev defaults. **Never commit a `.env*`
(only `*.example`) or hardcode secrets.** **AI agents — key handling (any source, not only `.env`):**
treat every credential (API key, token, password, private key, connection string) as sensitive
*wherever you meet it* (`.env`, `config.py`, `.mcp.json`, a pasted snippet, a log, command output) —
never **print/echo/log/paste** a real value (redact to `****`, ≤ last 4 chars), never **hardcode** or
**commit** it (only `*.example` placeholders), keep it in a gitignored env file or secret manager read
via `config.py`. A real secret must never reach `Frontend/.env` (`VITE_*` ships to the browser). If a
key is found committed, logged, or in the bundle → **flag it and treat it as compromised (rotate)**.
The frontend's Vite dev server proxies `/api`,`/ws` to
`host.docker.internal:8000` (`VITE_PROXY_TARGET`), `VITE_POLL=true` for hot reload on the Windows bind
mount. Full deploy topologies (prod overlays, managed datastores, AI tier) → [deploy.md](architecture/deploy.md).

---

## 4. Auth flow (end-to-end)

`Login.jsx` → `useAuth().login` → `api.login` → **POST `/api/auth/login`** →
`auth_service.login` verifies argon2 (`security`) via `repositories.users`, then issues
a short-lived **access JWT** (returned in JSON) + an opaque **refresh token in Redis**
(httpOnly cookie, path `/api/auth`). `/refresh` rotates (single-use), `/logout` revokes
the refresh token + denylists the access `jti`, `/me` returns the current user **+ effective
`permissions[]`**. RBAC is now **server-side** (§2.2 — write routes gate on `require_perm` via
`rbac_service` + Redis cache); the frontend maps the account to a `u_<username>` slug for its admin UI.

---

## 5. Data files (where the seed/important data lives)

The app boots from **seed data + localStorage** (no backend reads yet for these). When a
feature needs data, read/extend the file that owns it — don't scatter literals in screens.

**Frontend** — `Frontend/src/data/`:

| File | Owns | Key exports |
|---|---|---|
| [`data.jsx`](../../PiKaOs-Core/Frontend/src/data/data.jsx) | core demo content + nav | `GUILD` · `QUESTS` · `CHAT` · `ACTIVITY` · `MANA` · `KNOWLEDGE` · `TREASURY` · `NAV` · `byId` |
| [`data-users.jsx`](../../PiKaOs-Core/Frontend/src/data/data-users.jsx) | RBAC seed | `PERMISSIONS` · `ROLES_SEED` · `ROLE_PERMS_SEED` · `USERS_SEED` · `AUDIT_SEED` · `fmtTok` · `load/save` (`guildos-*-v2`) |
| [`data-workflows.jsx`](../../PiKaOs-Core/Frontend/src/data/data-workflows.jsx) | workflows + tool runs | `WORKFLOWS_SEED` · `TOOL_RUNS_SEED` · `WF_TRIGGER` · `WF_STATUS` · `simulateRun` (`guildos-workflows/​toolruns-v1`) |
| [`office-data.jsx`](../../PiKaOs-Core/Frontend/src/data/office-data.jsx) | iso-office map | `FURNI` · `FLOORS` · `seedOffice` · iso math (`guildos-offices-v1`) |
| [`compare-sites.jsx`](../../PiKaOs-Core/Frontend/src/data/compare-sites.jsx) | saved Compare sites (Prod/UAT + creds) | `loadSites`/`saveSites`/`newSiteId` (`guildos.compare.sites.v1`) — ⚠ stores creds incl. passwords plaintext (local dev only; [compare.md §4b](features/compare.md)) |
| [`i18n/<lang>-<lexicon>.json`](../../PiKaOs-Core/Frontend/src/data/i18n) | UI strings | one file = 1 language + 1 vocabulary (`en-formal` master · `th-formal` · `ja-formal`) — see §1.2 |

Conventions: localStorage keys are namespaced `guildos.*` / `guildos-*`; each data file
also exposes its own `load*/save*` helpers (don't touch `localStorage` directly from
screens). `byId` (in `data.jsx`) resolves agents/quests by id across screens. Live
room/agent layouts persist under `guildos.rooms.v2`, tasks under `guildos.works.v1`.

**Backend** — seed + schema are the source of truth, not ad-hoc inserts:
- [`Backend/scripts/seed.py`](../../PiKaOs-Core/Backend/scripts/seed.py) — idempotent user seed (mirrors the 6 frontend users; shared `SEED_PASSWORD`); default login `somchai` / `pikaos123`.
- [`Backend/alembic/versions/`](../../PiKaOs-Core/Backend/alembic/versions) — schema (`0001_baseline` = all domain tables by module, plain Postgres; `0002_stub_tool_sink` = test fixture); change schema via migrations (§2.3), never by hand.

---

## 6. Plugin apps — build big features here first (hard rule)

A **big new feature is built as a [PiKaOs-Plugin](../../PiKaOs-Plugin) app first**, then folded
into main — not bolted straight onto the monolith. The line, its examples (Compare, RedirectMap) and
the line-wide contract live in **[plugin/README.md](plugin/README.md)**; read it before
starting one. This section is the **how-to** the contract points to.

> **Plugin vs. extend-main.** Plugin = a feature big enough to be its **own deliverable**
> (a whole screen + its own endpoints, optionally its own data) that a department could run alone.
> A small addition to an existing screen is **not** a plugin — extend main per §1–§2.

### 6.1 Bootstrapping a plugin (copy a sibling, don't start blank)
Copy the closest existing app (`PiKaOs-Compare` = stateless, plus a DB stack from main if stateful),
then:
1. **Reserve a port pair** — next free `517x / 800x` in [ports.md](architecture/ports.md); fix it in
   **every** place (§3 list: compose ×2 + `CORS_ORIGINS`, `vite.config.js` fallback, `start-*.bat`,
   `.env.example` + `config.py`, README) and add the registry row **same commit**.
2. **Drop login** — remove the auth gate (`Depends(get_current_user)`) from every route → endpoints
   are **open** (the v0.x line rule); strip the token / refresh-on-401 logic from `lib/api.js` and the
   `Login.jsx` / `auth.jsx` gate from `App.jsx`. Mount the one screen directly.
3. **Trim deps** — keep only what the feature needs (Compare/RedirectMap run on 5–6 packages, no
   JWT/auth libs). Keep the **layering** (§2.1) and the **SSRF guard** on any outbound fetch.
4. **Self-contained run** — own `docker-compose.yml` + `start-*.bat` + `.env.example`; runs via the
   start script / compose, **never a bare `npm run dev`** (§0).

### 6.2 Stateful plugin — its own DB, its own Docker (hard rule)
A plugin that needs to persist data **brings its own datastore as services in its own compose
project** — it must **never** share or reach into main's db/redis/minio.
- Add a `db` (and `redis`/`minio` if needed) service to the app's `docker-compose.yml`. The backend
  reaches it by **service name over the compose network** (`db:5432` inside the project), so the DB
  port **stays internal — do not publish it to the host by default** (no host port = no collision).
  Publish an **offset** host port (`5433`, `5434`, …) **only** if you need host access to inspect it,
  and then **register that port** in [ports.md](architecture/ports.md) too.
- Schema goes through the **same Alembic flow as main** (§2.3) — own `alembic/versions/`, `alembic
  upgrade head` on boot. Keeping the migration shape identical to main is what makes the tables port
  back cleanly on merge.
- Keep the **layering** (§2.1): SQL only in `repositories/`. A stateful plugin *has* a
  `repositories/` layer (stateless ones don't).

### 6.3 Re-integration-ready from day one (hard rule)
Build so the merge-back is **mechanical, not a rewrite**. Write the app's **Merge-back** section
(or `integration.md`) **as you build**, capturing: where the auth gate gets re-added, what shell/nav/
RBAC/i18n it will inherit, which tunables move to the **"จัดการเครื่องมือ"** tools screen + DB
(no-hardcode — CLAUDE.md always-on rule 2), and — for *lifted* apps — which engine files are **copies of main** (the
divergence risk). Re-integrating later (see [compare integration.md](plugin/compare/integration.md)
and [redirectmap integration.md](plugin/redirectmap/integration.md)):
1. **Re-gate auth** — put the router behind the main app's `Depends(get_current_user)` + a
   `require_perm` (§2.2, §4); restore `api.js` token/refresh logic.
2. **Re-attach the shell** — register the router in `main.py`; add a nav id + the routed screen; wire
   RBAC + i18n.
3. **Settings → config-driven** — move `.env`/`config.py` tunables to the tools screen + DB (no-hardcode).
4. **Stateful → fold the schema** — port the plugin's migrations into main's `alembic/versions/`
   chain and update [data-model.md](architecture/data-model.md) (§2.3).
5. **Dedupe + drop dead code** — converge copied engine code (one `sitemap.py`/`net_guard.py`/…) and
   delete each app's known dead code before it propagates back.
6. **Free the ports** on retirement — release the `517x/800x` (and any published DB port) in
   [ports.md](architecture/ports.md), same commit.

### 6.4 plugin ↔ main = UAT ↔ Production (hard rule)
Once a feature exists in **both** a plugin and main, treat them as **UAT (plugin) vs Production
(main)** — but **they do not auto-sync**. UAT running **ahead** of Production is allowed and expected;
what's mandatory is that the gap is **never silent**:

- **Docs are the single source of truth for each copy's state**, and **each copy declares its version**
  (§6.5). Within one copy, code + its owning doc change in the **same commit** (CLAUDE.md always-on rule 5) —
  that's intra-copy and always required.
- **Cross-copy promotion is explicit, never automatic** (§6.5). A change in UAT does **not** flow into
  Production until the user says so. While they differ, the delta is tracked by **version + a pending
  changelog** — drift is recorded, never implicit.
- **Lifted code stays convergeable.** A plugin's `services/*`, `schemas.py`, `net_guard`,
  sitemap/probe are copies of main's; when you DO promote, converge them to one copy. Long-term, factor
  the shared engine into **one package** both consume → no copies to drift.
  - ⚠️ **Measured drift (2026-06-20):** Compare's and RedirectMap's `net_guard.py` + `sitemap.py` have
    **already diverged ~fully** (≈100% of lines differ — RedirectMap's `sitemap` grew per-host auth +
    dual-sitemap matching) → they're now **independent implementations**, exactly this risk. The shared
    package is therefore a real **reconcile-two-behaviours** job (+ Docker build-context change), **not a
    mechanical merge** — do it with the stack running to verify, not blind.

### 6.5 Versioning + gated promotion (hard rule)
Every plugin and its main twin carry a **version** `vMAJOR.MINOR`, declared **once** (backend
`config.py` → surfaced in `/api/health` + README + the doc header — **no scattered literals**, see the
no-hardcode rule). Today Compare and RedirectMap are both **v0.1**, not yet in main.

- **UAT advances freely; Production waits.** New work in the plugin bumps **its** version
  (0.1 → 0.2). **main (Production) stays at its last-promoted version** (0.1) and is **not touched**.
- **Document the ahead-version in place, temporarily.** While UAT > Prod, the plugin's doc
  (`docs/plugin/<app>/`) carries the new version **plus an `## Unreleased — pending promotion to
  main` section**: the changelog of what 0.2 adds over the 0.1 that's live in main. **main's docs stay
  at 0.1, untouched.** This pending doc is the temporary 0.2 record — it lives in the plugin folder,
  not in main docs, until promotion.
- **Promote only on explicit approval.** When the user says **"update Production / promote v0.2"** (and
  only then): fold the plugin's code + the pending changelog into **main + main docs**
  (`docs/features/<x>.md`), bump **main to 0.2**, clear the `Unreleased` section, and the two versions
  **reconverge**. Until that word, do **not** modify Production — only UAT and its 0.2 doc move.
- **Bump rule.** Behaviour/endpoint/schema change → bump **MINOR**; same-version edits are doc/fix only.
  The version a copy reports = exactly what its code does.

### 6.6 Dependency direction — main is upstream for shared code/libs (hard rule)
Two flows run in opposite directions; don't mix them up:

- **The feature itself flows UAT → Production** — built plugin-first, promoted into main on approval
  (§6.4–§6.5).
- **Shared infrastructure flows main → plugin (one way).** A new plugin takes its **libraries,
  versions, scaffold, and lifted engine** (`net_guard`, `sitemap`, probe/UA policy, the UI kit, the
  vite/start scaffolding) **FROM main** — main is the **source of truth** for that shared layer. A
  plugin never invents a different version of a shared lib or a divergent engine; it copies main's.

Rules:
- **Pick deps from main.** When bootstrapping (§6.1), take each shared lib + its **version** from main's
  `requirements.txt` / `package.json`; trim to what the feature needs, never bump above main's pin
  without a reason. Run a quick audit: `grep` the dep + its version in main, match it.
- **Main may update independently — if it doesn't break, and it propagates.** Main can upgrade a shared
  lib or improve a shared engine on its own schedule, **provided (a)** the change is non-breaking for the
  plugin's use, **and (b)** the same change is applied to every plugin that carries that copy
  (the §6.4 sync, in the main → plugin direction) **in the same commit**, with the plugin's
  version bumped (§6.5). A shared-engine fix landed in main but not the plugin is the divergence bug
  §6.4 forbids.
- **Breaking shared change → coordinate, don't strand.** If a main upgrade WOULD break a plugin,
  either hold it until the plugin can take it, or upgrade both together. Never leave a plugin on
  an incompatible shared lib silently — record the gap in [versions.md](architecture/versions.md).
- **End state.** The long-term fix (§6.4) — one shared package both consume — makes this automatic: bump
  the package once, both sides get it. Until then, main → plugin propagation is manual and mandatory.
