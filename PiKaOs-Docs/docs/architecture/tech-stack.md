---
title: Tech Stack (current, targets, policy)
type: architecture
status: active
keywords: [tech stack, dependencies, versions, react, vite, fastapi, postgres, redis, minio, upgrade policy]
related: [./system-design.md, ../process/improvement-plan.md, ./deploy.md, ./ports.md]
summary: >
  Reference for the whole-system stack — what's in use (pinned versions), what's planned, and
  the dependency selection/upgrade policy. Read before adding or bumping a dependency.
updated: 2026-06-27
---

# PiKaOs — Tech Stack (current + targets + policy)

> Reference doc for the whole-system stack: what's actually in use (versions from lockfile/requirements as of 2026-06-12),
> what's about to be added, and the dependency selection/upgrade policy.
> Read alongside [`system-design.md`](system-design.md) (architecture) ·
> [`improvement-plan.md`](../process/improvement-plan.md) (improvement plan) · [`../../../CLAUDE.md`](../../../CLAUDE.md) (rules).

---

## 1. Current stack ✅ (per actual files)

### Frontend — `Frontend/package.json`

| Layer | Actual | Version |
|---|---|---|
| UI runtime | React + ReactDOM | ^18.3.1 |
| Build/dev | Vite + @vitejs/plugin-react | ^5.4.11 / ^4.3.4 |
| Other dependencies | **None at all** | — |

Intentional highlight: **zero-dependency UI** — no router / state lib / component lib / CSS framework.
Everything is hand-built: UI kit in `src/components/ui/` (~30 components), custom i18n via `import.meta.glob`,
theming with CSS tokens (`styles.css`), navigation as state inside `App.jsx`.
Dev proxy: `/api`, `/ws` → `host.docker.internal:8000` (timeout 120s to support compare — `vite.config.js` `VITE_PROXY_TARGET`).

### Backend — `Backend/requirements.txt` (every package hard-pinned)

| Layer | Actual | Version |
|---|---|---|
| Runtime | Python (slim image) | 3.12 |
| Web | FastAPI + uvicorn[standard] | 0.137.1 / 0.49.0 |
| DB | SQLAlchemy[asyncio] + asyncpg + Alembic | 2.0.51 / 0.31.0 / 1.18.4 |
| Validation | pydantic + pydantic-settings | 2.13.4 / 2.14.1 |
| Auth | PyJWT + argon2-cffi | 2.13.0 / 25.1.0 |
| Cache/queue base | redis (asyncio) | 5.3.1 |
| Object storage | minio | 7.2.20 |
| Doc converters (RAG ingest, E6) | pypdf · mammoth | 5.1.0 / 1.8.0 |
| RAG vector codec | pgvector (asyncpg codec + sqlalchemy type) | 0.4.2 |
| HTTP client / tests | httpx · pytest · pytest-asyncio | 0.28.1 / 8.4.2 / 0.26.0 |

> Last minor/patch version update: 2026-06-16 (kept every existing major per §3.5; React 18/Vite 5 untouched).
> 2026-06-27: adopted **pgvector** 0.4.2 (MIT, official) for the asyncpg vector codec — replaces the
> hand-formatted `'[..]'::vector` string literal in `doc_chunks.py` (the one clear swap from the
> [dependency-audit](dependency-audit.md); raw-SQL search itself stays). Verify on the stack before pushing (R4).

### Infrastructure — `deploy/docker-compose.*.yml` (4 separate stacks, no root all-in-one)

The app runs as **4 compose projects on separate networks** talking via `host.docker.internal:<port>` (see [deploy.md §1](deploy.md) · [ports.md](ports.md)):

| Stack (project) | Compose | Service | Image | Notes |
|---|---|---|---|---|
| **data** `pikaos-data` | `docker-compose.data.yml` | db | `pgvector/pgvector:pg16` | Postgres 16 + pgvector (RAG `doc_chunks` — migration `0005`), healthcheck `pg_isready`, :5432 |
| | | redis | `redis:7` | refresh tokens / denylist / arq queue + pub/sub, :6379 |
| | | minio | `minio/minio` | object storage (bucket `pikaos`), :9000/9001 — ⚠️ tag pin, see §4 |
| **backend** `pikaos-backend` | `docker-compose.backend.yml` + `sim.yml` | backend | build `./Backend` | FastAPI :8000; entrypoint `alembic upgrade head` → seed → uvicorn; dev `sim.yml` = host.docker.internal URLs + `UVICORN_RELOAD` + bind-mount |
| **ai** `pikaos-ai` | `docker-compose.ai.yml` | worker | build `./Backend` | `arq app.worker.WorkerSettings` (out-of-process); talks to backend via Redis+Postgres |
| | | ollama | `ollama/ollama` | local model server :11434 — **opt-in** `--profile localai` |
| **frontend** `pikaos-frontend` | `docker-compose.frontend.dev.yml` | frontend | `node:22-alpine` | Vite dev :5173; proxy `/api`+`/ws` → `host.docker.internal:8000`; hot reload (bind mount + `VITE_POLL`). prod variant = nginx static (`frontend.yml`, :80) |

Every stack runs in Docker (including frontend) — `start.bat` brings up the 4 stacks in order (data→backend→ai→frontend) + opens the browser; `stop.bat` shuts everything down. View logs in Docker (rule CLAUDE.md §0).

---

## 2. Stack to be added 🟡 (per decision log in system-design.md §3)

| Task | Decided option | Short rationale | Add when (phase in improvement-plan) |
|---|---|---|---|
| Job queue / worker | **arq** | reuses existing Redis, async-native, lighter than Celery, Temporal is overkill | B |
| LLM SDKs | `openai` · `anthropic` (official SDK) + local via OpenAI-compatible endpoint | multi-provider adapter; wrapped under a single `llm` interface — **check latest SDK version on install day** | B–C |
| Rate limiting | token-bucket on Redis (hand-written ~50 lines) | not worth adding a lib for a single pattern | C |
| Structured logging | stdlib `logging` + JSON formatter | no OTel needed until there are multiple services | B |
| Embeddings | provider via the same adapter; **single platform dimension + `embedding_model` column** | don't tie the dimension to OpenAI ([risk-mitigation §5.3](risk-mitigation.md)) | E |
| Doc → markdown converters | `pypdf` (text-PDF) + `mammoth` (docx) | ✅ **added E6 (2026-06-21)** — lightweight pure-python, called via existing in-worker ingest (no SDK/service); scanned-PDF OCR deferred | E |

**Pre-approved successors** (from the [dependency-audit](dependency-audit.md) — adopt when the trigger hits, via R4):
- **MarkItDown** (MS, MIT) replaces pypdf+mammoth **when pptx/xlsx/image-OCR/table fidelity is needed** — one lib, more formats, in-memory `convert_stream`. (PyMuPDF4LLM rejected: AGPL.)
- **rapidfuzz** (MIT) — ✅ **adopted plugin-first (2026-06-27)**: replaces `difflib` similarity in RedirectMap Discover (path match, v0.4.1) + Compare `bodySim` (v0.1.2). Main's `compare_service.py` still on difflib → fold in on merge-back (§6).
- official `anthropic`/`openai` SDKs: re-evaluate at **C2** (streaming + per-provider backoff) — their only deps (httpx/pydantic/anyio) are already in-stack. **litellm rejected**: Mar-2026 PyPI supply-chain compromise.

**Intentionally "not added"** (decided — don't pull in without reviewing this doc):
Celery/Temporal (overkill) · Kafka/RabbitMQ (Redis pub/sub is enough) · other ORM/Prisma ·
GraphQL (REST + WS is enough) · additional frontend framework (Next/Redux/Tailwind — conflicts with zero-dependency +
existing design tokens) · Casbin/OPA (a direct RBAC model in Postgres is enough).

---

## 3. Risks of the current stack + recommendations

### 3.1 `passlib` is unmaintained (most important in this section)
**Observation**: `passlib` 1.7.4 was released back in 2020 and the project is dormant — it works with Python 3.12 today
but is debt that comes due at the next Python upgrade.
**Recommendation**: move to calling **`argon2-cffi` directly** (the lib passlib already wraps — already in the image).
There's a single change point, `security.py` (`hash_password`/`verify_password`), which is a well-designed abstraction layer.
**Impact**: existing hashes are standard argon2id → verification continues uninterrupted, no password reset needed. ~half a day's work (phase A).

### 3.2 `minio:latest` is not pinned
The `latest` image means `docker compose pull` can pick up new behavior unintentionally on any given day.
→ pin to a versioned tag (pick the version on the fix day) to match the already-pinned db/redis (phase A — one line).

### 3.3 Frontend has no lint / test / typecheck at all
`package.json` only has dev/build/preview. ~30k lines of JSX whose only compile check is `npm run build`.
**Recommendation** (most worthwhile first): (1) **ESLint + react-hooks plugin** — catches hook-order/dependency bugs,
the main React bug class that the build misses; (2) **Vitest** for `src/lib/` + `src/data/` only
(pure functions: 4-layer i18n fallback, `resolvePerms`, `simulateRun`, iso math) — no need to test components first;
(3) TypeScript = ⚪ future, done incrementally later (`checkJs` + JSDoc first) if the team grows.
**Cons**: adds ~5 devDependencies — runtime stays zero-dependency per the original philosophy.

### 3.4 No CI
The "pre-ship checks" rule in CLAUDE.md §1.1 (grep `<select>`, build, pytest) is entirely manual.
→ 1 GitHub Actions file: `npm run build` + ESLint + `pytest` (spin compose in the job) + grep the component-first rule.
This turns the rules in CLAUDE.md into something the machine enforces, not human memory (phase A).

### 3.5 Major versions that "don't need a rushed upgrade"
React 18 / Vite 5 / SQLAlchemy 2 / Pydantic 2 / Postgres 16 are all correct majors and still maintained —
**don't upgrade a major alongside engine work** (always a separate PR). React 19 / next-gen Vite: wait until phases A–C are done,
then evaluate as separate work, because the UI kit is entirely hand-written and migrating requires eyeball regression
(no component tests yet).

### 3.6 `arq` is in maintenance-only mode (2026)
The job queue ([§2](#2-stack-to-be-added--per-decision-log-in-system-designmd-3)) is now maintenance-only upstream — it still ships fixes (Python 3.14)
and was the right async-native pick over Celery, so **no action now**. Flag: a future Python bump that
arq doesn't follow is the re-evaluation trigger (closest async-native successor = ReArq; heavy fallback = Celery).
Surfaced by the [dependency-audit](dependency-audit.md).

---

## 4. Dependency policy (use to decide next time)

1. **Add a new lib only when** it solves a problem that (a) costs more than 1 day to write yourself and (b) is a core path the lib
   does more correctly (crypto, vendor SDK, migration). Small patterns (rate-limit, lock) are hand-written on Redis/Postgres.
2. **Keep pinning consistent as before**: backend hard-pinned (already good) · frontend uses caret + lockfile (acceptable) ·
   **docker images must not be `latest`** (fix minio).
3. **Upgrades are always separate work** — one PR per 1 major, run the full check; don't bundle into a feature PR.
4. **Verify on the install day, not from memory or this doc** (CLAUDE.md always-on rule 8 — verify currency):
   before adopting or bumping any lib, confirm on the web its latest **stable** release + breaking changes +
   that it's **still maintained** (not deprecated/EOL) — don't copy versions from this doc and use them
   unchecked; if you can't confirm, say so, don't assume. Applies doubly to **LLM vendor SDKs** (the decision
   log states "verify each SDK when implementing").
5. Every dependency add/remove → update this doc in the same commit (CLAUDE.md always-on rule 5, Docs discipline).
6. **Prefer a good maintained library over hand-maintaining equivalent code** — the team would rather the
   upkeep (security patches, edge cases, new formats) fall on the library than on us. When a candidate is
   mature, well-maintained, and sensibly licensed, lean **buy** within rules 1–5. **Hard stops** (don't adopt):
   AGPL, abandoned, or a recent supply-chain incident. The system-wide survey + verdicts live in
   [dependency-audit.md](dependency-audit.md); adopt every change through the **safe-upgrade + rollback** loop in
   [ai-runbooks R4](../process/ai-runbooks.md#r4--audit-dependencies--versions) so a bad upgrade can't take the system down.

---

## 5. Runtime topology overview (4 separate stacks — start.bat)

Each box = **a compose project on a separate network**; they talk via the host (`host.docker.internal:<published-port>`) like truly separate servers
— no all-in-one. `start.bat` brings them up in order data → backend → ai → frontend; `stop.bat` shuts everything down.

```
Windows host (start.bat / stop.bat)  — host.docker.internal bridges across projects
 │
 ├─ [pikaos-frontend]  Vite dev server :5173 ── proxy /api,/ws ──▶ host.docker.internal:8000
 │
 ├─ [pikaos-backend]   backend (FastAPI, uvicorn) :8000
 │       └─▶ host.docker.internal → db :5432 · redis :6379 · minio :9000/9001   (external, sim.yml)
 │
 ├─ [pikaos-ai]        worker (arq — same image as backend, different entrypoint)
 │       ├─▶ host.docker.internal → redis (queue) + db + minio   (talks to backend via queue/DB, not HTTP)
 │       └─▶ LLM providers (OpenAI / Anthropic / local) · ollama :11434 (opt-in --profile localai)
 │
 └─ [pikaos-data]      db (postgres:16+pgvector) :5432 · redis :6379 (refresh/denylist · arq queue · pub/sub quest:<id>)
                       · minio :9000/9001 (bucket pikaos: md/img/log/pdf + large tool outputs)
```

worker = the same `build: ./Backend` image + `command: arq app.worker.WorkerSettings`, just in a different project (`pikaos-ai`)
— no new image/language/database anywhere in the system; it can be a separate project because it talks via Redis/Postgres, not inter-service HTTP. The main strength of this design.
