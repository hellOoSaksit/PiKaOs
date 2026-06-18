# CLAUDE.md — PiKaOs project dev rules

PiKaOs — a Thai-first multi-agent "agent-ops" workspace. This file is the single
contract for anyone (human or AI) working in the repo: the rules that **aren't
obvious from the code**. Read it before changing anything.

> **Reuse before you build (hard rule).** Never open a task by writing something new. First find an
> existing component / helper / service / pattern / setting to **reuse or extend** (search the codebase +
> read the owning doc); create new only when nothing fits — then completely, per the section that owns it.
> Work like an experienced senior: the **smallest change that fits the existing design** beats a fresh
> implementation. This is the spirit behind §1.1 (UI), §2.1–2.2 (backend), §5 (data) — it applies everywhere.

The repo is a small monorepo:

| Folder | What it is | Source of truth |
|---|---|---|
| [`Frontend/`](Frontend) | Vite + React SPA (the UI) | `Frontend/src/` |
| [`Backend/`](Backend) | FastAPI service (auth, API, WS) | `Backend/app/` |
| [`docker-compose.yml`](docker-compose.yml) | Postgres · Redis · MinIO · backend | — |

> Static design deliverables live in the **PiKaOs-docs** repo (sibling checkout) at
> [`../PiKaOs-docs/design-system/`](../PiKaOs-docs/design-system) — see the [design guide](../PiKaOs-docs/design-system/Design%20System/README.md).

Overview: [`README.md`](README.md) · Visual design: the [design guide](../PiKaOs-docs/design-system/Design%20System/README.md) ·
Docs map (architecture / features / process): **[docs/README.md](../PiKaOs-docs/docs/README.md)** — start there.

---

## Task router — find the rule + the owning doc, then act

This file holds the **rules**; *how* to work + past decisions live in
[playbook](../PiKaOs-docs/docs/process/playbook.md) + [lessons](../PiKaOs-docs/docs/process/lessons.md); deep docs under
[docs/README.md](../PiKaOs-docs/docs/README.md). Match your task → read what it points to **first**, then work.

| You're asked to… | Read first |
|---|---|
| Run / serve the app | **§0** — `start.bat` only |
| Add / extend a UI component | **§1.1** + [`screens-library.jsx`](Frontend/src/screens/screens-library.jsx) |
| Add / change UI text | **§1.2** (i18n) |
| Touch login / session | **§1.3** (client) + **§4** (flow) |
| Style / theme / tokens | **§1.4** + [design guide](../PiKaOs-docs/design-system/Design%20System/README.md) |
| Work in a big screen (world/extra/secondary) | **§1.6** (barrels) |
| Touch the 3D room / avatars / life-sim | [docs/features/room-3d.md](../PiKaOs-docs/docs/features/room-3d.md) |
| Add / change a backend endpoint | **§2.1** (layering) + **§2.2** (recipe) |
| Change the DB schema | **§2.3** (migrations) + update [data-model.md](../PiKaOs-docs/docs/architecture/data-model.md) |
| Work on Compare (UAT vs Prod) | [docs/features/compare.md](../PiKaOs-docs/docs/features/compare.md) |
| Work on Sitemap-generate / checklist-audit | [sitemap-generate.md](../PiKaOs-docs/docs/features/sitemap-generate.md) · [checklist-audit.md](../PiKaOs-docs/docs/features/checklist-audit.md) |
| Add / extend seed or app data | **§5** |

---

## 0. Running — `start.bat` only (hard rule)

**Never run the web app / dev server through a background `cmd`.** No backgrounded
`npm run dev`, `start /b`, `run_in_background`, hidden/detached shell, or `vite`
spawned behind the scenes. **The whole stack runs in Docker** (frontend included). The
app is launched **only** by double-clicking [`start.bat`](start.bat), which: (1) ensures
the Docker engine is up — running [`fix-docker.bat`](fix-docker.bat) (admin/UAC) if not;
(2) `docker compose up -d --build` (Postgres, Redis, MinIO, backend, worker, **frontend**);
(3) opens the browser at `http://localhost:5173` and exits. **No cmd tabs** — watch logs in
Docker Desktop (or `docker compose logs -f <service>`).

- Verifying changes: a one-shot `docker compose exec frontend npm run build` (frontend
  compile check) and `docker compose exec backend pytest` (backend) are fine. To
  **run/serve** the UI, use `start.bat` — never start the dev server yourself.
- If a running app is needed, ask the user to launch `start.bat`.

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
[design guide §2–§6](../PiKaOs-docs/design-system/Design%20System/README.md). Tokens in
`src/styles/styles.css` (`:root` = pro, `[data-theme="pro-dark"]`; accent named
`--gold` for history). No hardcoded colors — derive with `color-mix`. Motion uses
`var(--spring)`/`var(--spring-soft)` inside `@media (prefers-reduced-motion: no-preference)`.
`src/styles/index.css` import order: `ui-kit.css` → `styles.css` → `components.css` →
`world.css` → `kit-overlays.css` → `dashboard.css` → `rbac.css` → `fx.css`.

### 1.5 Preview build artifact
`../PiKaOs-docs/design-system/PiKaOs App Preview.html` (design deliverables live in the
**PiKaOs-docs** repo) is generated from all of `src/` — **never
edit it directly**; edit `src/` then rebuild. Invariant: the hook preamble
(`const { useState… } = React`) appears once; top-level name collisions across files
are forbidden.

### 1.6 Screen modules — split big files via barrels (hard rule)
When a screen file grows large it's split into focused modules in a sibling folder,
and the original filename stays as a **thin barrel** that re-exports the same public
surface (and keeps any `window.*` side-effects). This is why imports never change when
a file is split — consumers still import from `screens-<name>.jsx`.

Current barrels and their folders:

| Barrel | Folder | What lives there |
|---|---|---|
| [`screens-world.jsx`](Frontend/src/screens/screens-world.jsx) | [`world/`](Frontend/src/screens/world) | sprite · chat · exports · sessions · doc editor · room-aside · lobby · build sandbox · `World` |
| [`screens-extra.jsx`](Frontend/src/screens/screens-extra.jsx) | [`extra/`](Frontend/src/screens/extra) | `codex` · `recall` · `dashboards` (Mana/Treasury/Chronicle/QuestLog/Watchtower) · `settings` |
| [`screens-secondary.jsx`](Frontend/src/screens/screens-secondary.jsx) | [`secondary/`](Frontend/src/screens/secondary) | `AgentDrawer` · `QuestDrawer` · `QuestBoard` (+`TaskDetail`) · `Agents` · `Meeting` · `task-utils` |

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
Large enough to own its doc → **[docs/features/room-3d.md](../PiKaOs-docs/docs/features/room-3d.md)**.
The live room is a real-3D Three.js scene; **two renderers, one data model** —
[`lib/room-three.jsx`](Frontend/src/lib/room-three.jsx) (3D) +
[`lib/room-tiles.jsx`](Frontend/src/lib/room-tiles.jsx) (2D thumbnails) share `FURN.draw3d`
and avatar identity via [`lib/avatar-style.js`](Frontend/src/lib/avatar-style.js).
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
4. Thin route in `routers/<area>.py` (map errors → HTTP) — **a write endpoint declares its permission with `Depends(require_perm("<perm>"))`** (`deps.py` → `rbac_service`; design: [risk-mitigation §2](../PiKaOs-docs/docs/architecture/risk-mitigation.md)); then `include_router` in `main.py`.
5. Test in `tests/` (hits the live server — see 2.5).

### 2.3 Migrations (Alembic)
Schema changes go through migrations in `Backend/alembic/versions/`. Base tables are in
`0001_baseline` (modular, organized by bounded context — [modularity.md](../PiKaOs-docs/docs/architecture/modularity.md)); `0005_doc_chunks` turns on the `vector` extension for RAG (knowledge-rag.md §3). Autogenerate a new one:
`docker compose exec backend alembic revision --autogenerate -m "what changed"`, review
it, then it applies automatically on the next container start (entrypoint runs
`alembic upgrade head` → `scripts/seed.py` → uvicorn).

**Every schema change updates the ER doc in the same commit (hard rule).** When you add/drop
a table or column, change an FK/index, or move a table's status, update
[data-model.md](../PiKaOs-docs/docs/architecture/data-model.md) — the as-built, table-by-table
reference written for non-technical successors (each column says what it stores; each FK says
what happens on delete; status legend = LIVE / ENGINE / unused / TEST). A stale ER doc is worse
than none. The truth is the migration + `models.py`; the doc summarizes them, never guesses.

### 2.4 Seeding
`Backend/scripts/seed.py` mirrors the 6 frontend users and is **idempotent** (skips
existing usernames). All seeded users share `SEED_PASSWORD` (dev default `pikaos123`).
Default login: `somchai` / `pikaos123` (admin).

### 2.5 Tests
`Backend/tests/` use httpx against the **live** server (avoids async-loop issues with
the module-level engine/redis). Run: `docker compose exec backend pytest`.

### 2.6 Compare module (UAT vs Production) — the one *outbound* feature
The compare path (`POST /api/compare` + `/api/compare/deep`, plus the Compare Content screen) is
large enough to own its doc → **[docs/features/compare.md](../PiKaOs-docs/docs/features/compare.md)**. Highlights: Production sitemap = source
of truth; **stateless** (no DB → no `repositories/` layer); coverage runs the whole sitemap in
parallel; **deep mode** streams in batches to dodge the 120s proxy timeout; stdlib-only HTML parse
(no new dep). Read it before touching the compare path.

### 2.7 Sitemap Generate / Audit (designed, not built)
"URL in → IA diagram out" (ShareInvestor-style) + AI classify (Local→API) owns its doc →
**[docs/features/sitemap-generate.md](../PiKaOs-docs/docs/features/sitemap-generate.md)**; companion:
[docs/features/checklist-audit.md](../PiKaOs-docs/docs/features/checklist-audit.md) (template→audit + Discovery §3.0).
Read both before touching the audit/sitemap path (incl. `screens-sitemap.jsx`).

---

## 3. Infrastructure ([`docker-compose.yml`](docker-compose.yml))

Services (each health-checked; backend waits for the rest to be healthy):

| Service | Image | Ports | Purpose |
|---|---|---|---|
| db | `pgvector/pgvector:pg16` | 5432 | Postgres + pgvector (RAG `doc_chunks` — [knowledge-rag.md](../PiKaOs-docs/docs/architecture/knowledge-rag.md)) |
| redis | `redis:7-alpine` | 6379 | refresh tokens, denylist, future WS bus |
| minio | `minio/minio` | 9000 / 9001 | object storage (bucket `pikaos`) |
| backend | build `./Backend` | 8000 | FastAPI (docs at `/api`… , `/docs`) |
| worker | build `./Backend` | — | arq engine jobs (out-of-process, B2) |
| frontend | build `./Frontend` | 5173 | Vite dev server (hot reload via bind mount) |

Secrets come from the root `.env` (gitignored; copy from `.env.example`):
`POSTGRES_*`, `JWT_SECRET`, `MINIO_*`, `SEED_PASSWORD`. **Never commit `.env` or
hardcode secrets.** The **frontend now runs in compose** (whole stack in Docker); its
Vite dev server proxies `/api` and `/ws` to `backend:8000` over the compose network
(`VITE_PROXY_TARGET`), with `VITE_POLL=true` so hot reload fires on the Windows bind mount.

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
| [`data.jsx`](Frontend/src/data/data.jsx) | core demo content + nav | `GUILD` · `QUESTS` · `CHAT` · `ACTIVITY` · `MANA` · `KNOWLEDGE` · `TREASURY` · `NAV` · `byId` |
| [`data-users.jsx`](Frontend/src/data/data-users.jsx) | RBAC seed | `PERMISSIONS` · `ROLES_SEED` · `ROLE_PERMS_SEED` · `USERS_SEED` · `AUDIT_SEED` · `fmtTok` · `load/save` (`guildos-*-v2`) |
| [`data-workflows.jsx`](Frontend/src/data/data-workflows.jsx) | workflows + tool runs | `WORKFLOWS_SEED` · `TOOL_RUNS_SEED` · `WF_TRIGGER` · `WF_STATUS` · `simulateRun` (`guildos-workflows/​toolruns-v1`) |
| [`office-data.jsx`](Frontend/src/data/office-data.jsx) | iso-office map | `FURNI` · `FLOORS` · `seedOffice` · iso math (`guildos-offices-v1`) |
| [`compare-sites.jsx`](Frontend/src/data/compare-sites.jsx) | saved Compare sites (Prod/UAT + creds) | `loadSites`/`saveSites`/`newSiteId` (`guildos.compare.sites.v1`) — ⚠ stores creds incl. passwords plaintext (local dev only; [compare.md §4b](../PiKaOs-docs/docs/features/compare.md)) |
| [`i18n/<lang>-<lexicon>.json`](Frontend/src/data/i18n) | UI strings | one file = 1 language + 1 vocabulary (`en-formal` master · `th-formal` · `ja-formal`) — see §1.2 |

Conventions: localStorage keys are namespaced `guildos.*` / `guildos-*`; each data file
also exposes its own `load*/save*` helpers (don't touch `localStorage` directly from
screens). `byId` (in `data.jsx`) resolves agents/quests by id across screens. Live
room/agent layouts persist under `guildos.rooms.v2`, tasks under `guildos.works.v1`.

**Backend** — seed + schema are the source of truth, not ad-hoc inserts:
- [`Backend/scripts/seed.py`](Backend/scripts/seed.py) — idempotent user seed (mirrors the 6 frontend users; shared `SEED_PASSWORD`); default login `somchai` / `pikaos123`.
- [`Backend/alembic/versions/`](Backend/alembic/versions) — schema (`0001_baseline` = all domain tables by module, plain Postgres; `0002_stub_tool_sink` = test fixture); change schema via migrations (§2.3), never by hand.

---

## 6. How to write a CLAUDE.md

A CLAUDE.md is the project's **operating contract** — the rules and intent that code
alone doesn't reveal. Write it so a newcomer (human or AI) can act correctly without
asking. Principles:

1. **Only non-obvious, load-bearing rules.** If the code already shows it, leave it
   out. Capture decisions, constraints, "always/never", and *why*.
2. **Imperative and specific, with the reason.** "Never hand-roll `<select>` — use
   `ui/Dropdown.jsx`, so theming + a11y stay consistent" beats "be consistent".
3. **Link to the source of truth; don't duplicate it.** Point at the file/guide that
   owns the detail (e.g. design tokens live in the design guide). Duplication goes stale.
4. **Scannable structure.** Short numbered sections, headings, tables, code fences.
   Mark non-negotiables `(hard rule)`. A reader should find a rule in seconds.
5. **Runnable as written.** Every path, command, and grep must work if pasted. Use
   clickable links (`[file](path)`) for files.
6. **Recipes for the common paths.** "Add an endpoint", "add a component", "add an
   i18n string" — the steps people repeat.
7. **Keep it current.** Update it in the same change that alters structure; a stale
   rule is worse than none. Delete rules that no longer hold.
8. **Scope & the 300-line cap (hard rule).** One root CLAUDE.md is the whole-project
   contract (this file) — keep it **≤300 lines**. When it would overflow, or a single
   feature/use-case grows large, spin that section out to its own topic `.md` (e.g.
   [docs/features/compare.md](../PiKaOs-docs/docs/features/compare.md)) written to these same principles, and leave a **one-line
   pointer** here. Don't duplicate — the pointer links, the topic doc owns the detail.

Skeleton:

```markdown
# CLAUDE.md — <project> dev rules

<