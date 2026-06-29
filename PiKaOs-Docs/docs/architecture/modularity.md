---
title: Modularity / Extractable Systems (Modular Monolith)
type: architecture
status: active
keywords: [modularity, modular monolith, bounded context, modules, extraction, soft reference, core, footprint]
related: [./system-design.md, ./knowledge-rag.md, ./data-model.md, ../features/compare.md]
summary: >
  Owns the rules for extracting each system as a self-contained module for per-department
  local deploy. Read before adding a module, FK across modules, or organizing tables.
updated: 2026-06-21
---

# PiKaOs — Modularity / Extractable Systems (Modular Monolith · per-system footprint)

> **⚠️ Superseded (2026-06-29) by [plugin-architecture.md](plugin-architecture.md)** — the strict Core +
> Plugins contract (manifest · loader · Event Bus · DI · contract tests · removal-isolation CI), adopted
> from the new-project kit (`/home/pika/Documents/MyProject/new-project/examples/plugin-architecture/`) as
> the source of truth. This file is the **light precursor** (the `ENABLED_MODULES` seam still applies); read
> plugin-architecture.md for the target the code is migrating to.

> **Decision-locked design** (2026-06-16) — owner of "extract each system out for per-department local deployment".
> Pairs with [system-design](system-design.md) (§7 data model) · [knowledge-rag.md](knowledge-rag.md) (markdown/light).
> Status: 🟡 **principles locked · ER organized by module (baseline) · Base/plugin seam (`ENABLED_MODULES`)
> built ✅ ([`app/modules.py`](../../../PiKaOs-Core/Backend/app/modules.py)) · plugin code moving into
> `app/plugins/<name>/` one at a time (compare ✅ 2026-06-27)** — see [extraction-plan.md](extraction-plan.md).

---

## 0. The decision (locked)

Build as a **Modular Monolith** — a single codebase, but each "system" is a **self-contained module** (bounded
context: has its own models/migrations/routers/services/repos). Target use case: finish building system A →
lift just module A + core and deploy it for one department to use **local, lightweight, not heavy on the machine** without dragging the whole monolith along.

**No splitting into microservices** — it conflicts with "lightweight / easy to deploy" (adds network/ops/infra) and is over-engineering for this scale.

**Footprint = per-system**: stateless systems need no DB at all; stateful systems use Postgres-lite.

---

## 1. Modules (bounded contexts)

| Module | Base/plugin | Tables/status | Depends on | Footprint when extracted to local |
|---|---|---|---|---|
| **core** (identity · access · tenancy) | **Base** | users · departments · user_departments · roles · permissions · role_perms · user_perms | — (foundation of everything) | Postgres (small) — every deployment must have it |
| **engine** (agent-ops) | **Base** | rooms · agents · quests · runs · run_steps | core | Postgres-lite (db+backend, worker) · Redis/MinIO = optional |
| **knowledge** (codex/documents) | plugin | documents (+ markdown in object store/files) | core | Postgres-lite + file storage |
| **compare** (UAT vs Prod) | own-app only | — **stateless** ([compare.md](../features/compare.md)) · the [PiKaOs-Compare plugin](../plugin/compare/README.md) is now the **sole copy — in-main REMOVED 2026-06-29** | — | **No DB** — own-app, not in main |
| **telegram** (chat channel) | plugin | telegram_connections · telegram_links · telegram_link_codes ([telegram-integration.md](../features/telegram-integration.md)) | core + engine | Postgres-lite |
| **audit/sitemap** (designed) | plugin | — stateless | core (auth) | No DB |

> **The Base is the shared platform** (2026-06-27) — `core` (auth/RBAC/departments) **+ `engine`** (the
> agent runtime). Every deployment runs the Base; **plugins attach to it** and are opt-in via
> `ENABLED_MODULES` (§2.5). core depends on no one; engine depends only on core.
>
> **own-app == in-main** (2026-06-27) — an own-app plugin is just a plugin's *own-app packaging*
> (build-first, heavy/self-contained), the same re-integration-ready code that also runs as an in-main
> `app/plugins/<name>/` plugin. The concrete per-feature roadmap is **[extraction-plan.md](extraction-plan.md)**.

---

## 2. The iron rules of modularity (extraction rules)

1. **FK across modules is allowed → only to core** (e.g. `agents.owner_id → users`, `*.department_id → departments`).
   FK crossing into **another non-core module is forbidden** — use a **soft reference** (store a bare UUID, no FK) instead
   so a module can be lifted out without dragging another module's schema along.
   *(Why deferring `subtasks` in phase B was correct: it has FK `brief_doc_id → documents` = engine→knowledge crossing modules — when actually built in phase C, use soft-ref.)*
2. **1 module = owner of its own tables.** No module writes another module's tables (only via service interface).
3. **core = least common denominator** — as small as everything every module must share (auth/identity/departments). Don't stuff system-specific things into core.
4. **stateless must be truly stateless** — compare/audit must not secretly write to the DB; being stateless is what makes them liftable and lightweight.
5. **enable/disable modules at deploy time** — config `ENABLED_MODULES` controls which **plugins** this
   build loads on top of the **Base** → a department gets only what it needs.
   ✅ **built (2026-06-21) · Base/plugin split (2026-06-27)** — [`app/modules.py`](../../../PiKaOs-Core/Backend/app/modules.py)
   registry. The **Base** (`infra`=health · `core`=auth/llm-config/storage · **`engine`**=agent runtime)
   **always loads** — it's the platform plugins attach to. **Plugins** (`knowledge`/`compare`, `telegram`
   later) are opt-in. `ENABLED_MODULES` semantics: **`""`/unset = Base only (the clean/prod default)** ·
   `"*"` = all plugins (full build) · comma-list = those plugins. Dev runs the full build via
   `ENABLED_MODULES=*` in `Backend/.env`. `main.register_routers` gates routers; `worker._active_functions`
   gates that module's arq jobs the same way. e.g. `ENABLED_MODULES=compare` → `infra,core,engine,compare`
   routers + `ping`+`agent_run` worker jobs (engine is Base, so `agent_run` always loads).

---

## 3. Target code structure — Base flat, plugins under `app/plugins/<name>/`

```
Backend/app/
  modules.py     the REGISTRY (Base + plugins → routers/jobs, gated by ENABLED_MODULES)
  config · db · crypto · deps · main · worker            ── Base wiring
  routers/       health · auth · llm_config · settings_config · storage · ws   (Base: infra+core+engine)
  services/  repositories/                                (Base services/repos)
  plugins/                                                ── one folder per PLUGIN (opt-in)
    (compare/ REMOVED 2026-06-29 — own-app PiKaOs-Compare is the sole copy)
    knowledge/   __init__ · router · ingestion/retrieval/summarize/answer/knowledge_service · chunking · converters · doc_chunks · documents · retriever   ✅ moved 2026-06-27
    telegram/    __init__ · adapter · commands · service · router · poller   ← built here
  services/embeddings.py  ← stays Base (the vector(N) type + codec are used by db/models/config, not knowledge-only)
```

> **Decoupling pattern (the engine↔knowledge case, 2026-06-27).** The engine (Base) used to import the
> knowledge plugin's `retrieval_service` for RAG — a Base→plugin dependency that breaks rule §2. Fixed by
> **dependency injection**: the engine declares a `Retriever` Protocol and takes one via
> `set_engine_runtime(provider, tools, retriever)`; the **worker** (composition root) injects the knowledge
> plugin's `KnowledgeRetriever` **only when knowledge is active**, else `None` (agent runs without RAG).
> This is the canonical fix when the Base seems to need a plugin — inject an interface, never import down.

> **Folder naming (2026-06-27):** plugins live under **`app/plugins/<name>/`** — *not* `app/modules/`,
> which would collide with the registry file `app/modules.py`. The registry keeps the name `modules.py`
> (it registers Base **modules** + **plugins** alike); the **`plugins/`** folder holds the opt-in plugin code.

The **Base stays flat** (`app/routers`, `app/services`, `app/repositories`). Moving a plugin into
`app/plugins/<name>/` is done **one at a time** (compare ✅ + knowledge ✅ done 2026-06-27), per
[extraction-plan.md](extraction-plan.md). **Models + `alembic/` stay central for now** (the ER is already
module-sectioned, §4; relocating ORM models is the riskiest step — a later sub-phase). Each plugin treats
§2 as a contract (no FK across non-core; cross-module refs stay soft UUIDs).

> **The seam exists ahead of the move (2026-06-21).** [`app/modules.py`](../../../PiKaOs-Core/Backend/app/modules.py)
> already maps each module → its routers/jobs and gates them by `ENABLED_MODULES`, so plug-and-play
> works **while the code is still flat**. When a plugin's folder moves into `app/plugins/<name>/` (compare
> ✅ done), only the imports in `modules.py` change — the registry, `ENABLED_MODULES`, and every call site stay put.

---

## 4. Effect on ER / schema (done — baseline)

- migration baseline (`0001_baseline`) organizes tables into **sections by module** (core → knowledge → engine);
  FK across modules into core only (per §2.1) — see [system-design §7](system-design.md).
- Defer `subtasks`/`tools_config`/`notifications` to the phase they're actually used (cut cross-module FK + tables no code touches yet).
- `stub_tool_writes` = engine test fixture split into a separate migration (not mixed with the domain schema).

## 5. Non-goals

- ❌ No splitting into microservices / no service-to-service network calls.
- ❌ No separate DB per module within a single deployment (modules can share the same schema/DB, just keep FK per §2 rules).
- ❌ No moving code into `modules/` in one shot — do it one module at a time when ready (avoid regression).
