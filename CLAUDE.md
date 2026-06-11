# CLAUDE.md — PiKaOs project dev rules

PiKaOs — a Thai-first multi-agent "agent-ops" workspace. This file is the single
contract for anyone (human or AI) working in the repo: the rules that **aren't
obvious from the code**. Read it before changing anything.

The repo is a small monorepo:

| Folder | What it is | Source of truth |
|---|---|---|
| [`Frontend/`](Frontend) | Vite + React SPA (the UI) | `Frontend/src/` |
| [`Backend/`](Backend) | FastAPI service (auth, API, WS) | `Backend/app/` |
| [`design-system/`](design-system) | Static design deliverables — **not** built | the [design guide](design-system/Design%20System/README.md) |
| [`docker-compose.yml`](docker-compose.yml) | Postgres+pgvector · Redis · MinIO · backend | — |

Overview: [`README.md`](README.md) · Visual design: the [design guide](design-system/Design%20System/README.md).

---

## 0. Running — `start.bat` only (hard rule)

**Never run the web app / dev server through a background `cmd`.** No backgrounded
`npm run dev`, `start /b`, `run_in_background`, hidden/detached shell, or `vite`
spawned behind the scenes. The app is launched **only** by double-clicking
[`start.bat`](start.bat), which: (1) ensures the Docker engine is up — running
[`fix-docker.bat`](fix-docker.bat) (admin/UAC) if not; (2) `docker compose up -d`
(Postgres+pgvector, Redis, MinIO, backend); (3) opens visible Windows Terminal tabs
(**Frontend dev · Backend · Docker · Shell**).

- Verifying changes: a one-shot `npm run build` (frontend compile check) and
  `docker compose exec backend pytest` (backend) are fine. To **run/serve** the UI,
  use `start.bat` — never start the dev server yourself.
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
vocabulary style; packs: `en-formal` master, `th-formal`, `th-fantasy`,
`en-adventurer`, `th-wuxia`). `src/lib/i18n.jsx` auto-scans the folder
(`import.meta.glob`) — adding a file makes it appear in the picker. **Screens call
`t("ns.key", { var })` only.** New strings → add to **en-formal + th-formal** first;
flavors inherit via 4-level fallback. Intentionally-Thai content (chat, `.md` bodies,
seed data) is content, not keyed.

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
[design guide §2–§6](design-system/Design%20System/README.md). Tokens in
`src/styles/styles.css` (`:root` = pro, `[data-theme="pro-dark"]`; accent named
`--gold` for history). No hardcoded colors — derive with `color-mix`. Motion uses
`var(--spring)`/`var(--spring-soft)` inside `@media (prefers-reduced-motion: no-preference)`.
`src/styles/index.css` import order: `ui-kit.css` → `styles.css` → `components.css` →
`world.css` → `kit-overlays.css` → `dashboard.css` → `rbac.css` → `fx.css`.

### 1.5 Preview build artifact
`design-system/PiKaOs App Preview.html` is generated from all of `src/` — **never
edit it directly**; edit `src/` then rebuild. Invariant: the hook preamble
(`const { useState… } = React`) appears once; top-level name collisions across files
are forbidden.

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
4. Thin route in `routers/<area>.py` (map errors → HTTP), then `include_router` in `main.py`.
5. Test in `tests/` (hits the live server — see 2.5).

### 2.3 Migrations (Alembic)
Schema changes go through migrations in `Backend/alembic/versions/`. The pgvector
extension + base tables are in `0001_init`. Autogenerate a new one:
`docker compose exec backend alembic revision --autogenerate -m "what changed"`, review
it, then it applies automatically on the next container start (entrypoint runs
`alembic upgrade head` → `scripts/seed.py` → uvicorn).

### 2.4 Seeding
`Backend/scripts/seed.py` mirrors the 6 frontend users and is **idempotent** (skips
existing usernames). All seeded users share `SEED_PASSWORD` (dev default `pikaos123`).
Default login: `somchai` / `pikaos123` (admin).

### 2.5 Tests
`Backend/tests/` use httpx against the **live** server (avoids async-loop issues with
the module-level engine/redis). Run: `docker compose exec backend pytest`.

---

## 3. Infrastructure ([`docker-compose.yml`](docker-compose.yml))

Services (each health-checked; backend waits for the rest to be healthy):

| Service | Image | Ports | Purpose |
|---|---|---|---|
| db | `pgvector/pgvector:pg16` | 5432 | Postgres + pgvector |
| redis | `redis:7-alpine` | 6379 | refresh tokens, denylist, future WS bus |
| minio | `minio/minio` | 9000 / 9001 | object storage (bucket `pikaos`) |
| backend | build `./Backend` | 8000 | FastAPI (docs at `/api`… , `/docs`) |

Secrets come from the root `.env` (gitignored; copy from `.env.example`):
`POSTGRES_*`, `JWT_SECRET`, `MINIO_*`, `SEED_PASSWORD`. **Never commit `.env` or
hardcode secrets.** The **frontend is not in compose** — it runs via npm/`start.bat`;
Vite proxies `/api` and `/ws` to `localhost:8000`.

---

## 4. Auth flow (end-to-end)

`Login.jsx` → `useAuth().login` → `api.login` → **POST `/api/auth/login`** →
`auth_service.login` verifies argon2 (`security`) via `repositories.users`, then issues
a short-lived **access JWT** (returned in JSON) + an opaque **refresh token in Redis**
(httpOnly cookie, path `/api/auth`). `/refresh` rotates (single-use), `/logout` revokes
the refresh token + denylists the access `jti`, `/me` returns the current user. The
frontend keeps RBAC client-side for now and maps the account to a `u_<username>` slug
(moving RBAC server-side is future work).

---

## 5. How to write a CLAUDE.md

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
8. **Scope.** One root CLAUDE.md is the whole-project contract (this file). Add a
   nested `<folder>/CLAUDE.md` only when a subtree needs rules that would bloat the root.

Skeleton:

```markdown
# CLAUDE.md — <project> dev rules

<1–3 lines: what this is, where the source of truth lives, what to read first.>

## 0. <the one rule people most often get wrong> (hard rule)
<the rule + the why.>

## 1..N. <area>            e.g. Frontend / Backend / Infra
<layering, conventions, "never do X", recipes — link out for deep detail.>

## How to write a CLAUDE.md   (optional, if you want the convention captured)
```
