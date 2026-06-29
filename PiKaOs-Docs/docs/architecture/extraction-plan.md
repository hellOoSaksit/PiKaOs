---
title: Extraction plan — reduce PiKaOS-Main to Base + plugins (own-app + in-main) (assessment)
type: architecture
status: design
keywords: [extraction, base, plugin, own-app, in-main, modular monolith, world state, knowledge, compare, telegram, frontend screens, backend modules, footprint, build status]
related: [./modularity.md, ../features/telegram-integration.md, ../features/compare.md, ../features/room-3d.md, ../plugin/README.md, ./deploy.md]
summary: >
  Per-feature assessment of every PiKaOS-Main screen + backend module: build status, coupling, and
  footprint → a target (Base / in-main plugin / own-app plugin) and the order to extract them. The Base is
  infra+core+engine (the agent runtime); everything else is opt-in. Reality check: most sidebar items
  are frontend-only stubs with no backend, so backend plugin-extraction is bounded to knowledge,
  compare, and telegram. The one heavy built feature worth its own app is World State (Three.js).
updated: 2026-06-27
---

# Extraction plan — Base + plugins (own-app + in-main)

> **Goal (user, 2026-06-27):** *"move everything out of Main, leave only the Base, assess each — e.g.
> World State could become its own app."* + *"separate the backend into a plugin system too."* This
> doc is the **assessment** + the **ordered move plan**. The mechanism + rules live in
> [modularity.md](modularity.md); this is the concrete per-feature roadmap.

## 0. One concept: Base + plugins (own-app = a plugin's own-app packaging)

**Unifying principle (user, 2026-06-27): `own-app == in-main` — a plugin is the same thing either way.**
We build a system **separately (own-app-first) and merge it back later** — the whole point is
**easy-out / easy-in**. So there are only **two buckets**, and "own-app" is not a third — it's just one
*packaging form* of a plugin:

- **Base** — the platform every deploy runs: identity/RBAC/config (**core**) + the agent runtime
  (**engine**). Plugins attach to it. Never extracted.
- **Plugin** — everything else: a bounded context that is **easy to remove / easy to add**. It exists in
  **two interchangeable packagings of the same re-integration-ready code**:
  - **own-app packaging** — own app/repo/Docker, own ports, can drop login ([plugin rules](modularity.md)).
    The incubator: build-first here, and the right deploy form when a plugin is **heavy / self-contained**
    (e.g. World State's Three.js bundle) or wanted on its own box. This is the `PiKaOs-Plugin/` line.
  - **in-main packaging** — code under `app/modules/<name>/`, **off unless `ENABLED_MODULES` lists it**.
    The integrated form: co-located with the agent/DB when that helps (e.g. knowledge RAG).

  Same plugin, two ways to ship it; folding a plugin into Main (or lifting a module out to its own app)
  is a packaging move, not a rewrite — which is exactly the "easy-out / easy-in" we're optimizing for.
  (Promotion/merge-back follows [dev-rules §6.4–6.5](../pikaos-dev-rules.md) + [versions.md](versions.md).)

> **Reality check (drives everything below).** Of the sidebar's ~15 items, only **6 are BUILT with a
> real backend** (Agents, World State, Compare, Codex, Recall, Manage Tools/Settings). The rest are
> **frontend-only stubs** (localStorage/mock, no API): My Dashboard, Quest Board, Workflows, Sitemap
> Match, User Management, Roles, Audit, and the misc dashboards. So **"extract the backend into
> plugins" is bounded to the modules that actually have a backend: knowledge, compare, telegram.** The
> stubs are moved as *frontend shells* (or deferred until their backend is built).

---

## 1. Per-feature assessment

| Feature (sidebar) | Frontend file | Backend | Built? | Footprint / coupling | **Target** |
|---|---|---|---|---|---|
| **My Dashboard** | screens-me.jsx | — | stub (mock) | agent-ops cockpit | **Base** (engine UI) — keep, wire later |
| **Agents** | secondary/Agents.jsx | engine (store) | built | core agent roster | **Base** (engine) |
| **Quest/Task Board** | secondary/QuestBoard.jsx | — | stub (localStorage) | engine UI (no API yet) | **Base** (engine) — backend = engine CRUD phase D |
| **Workflows** | screens-workflows.jsx | — | stub (mock run) | future Activepieces | **plugin** `workflows` (when backend built) |
| **World State** (3D room) | screens-world/* | — | **built** | **Three.js ~0.184, TipTap; no backend; self-contained** | **OWN-APP** ⭐ (`PikaOS-World`) |
| **Sitemap Match** | screens-sitemap.jsx | — | stub (localStorage) | fuzzy-match trainer | **plugin** `sitemap` (or fold into RedirectMap plugin) |
| **Compare Content** | screens-compare.jsx | **compare** | built | stateless, **shipped own-app** | **OWN-APP** (PiKaOs-Compare) — **in-main REMOVED 2026-06-29** (own-app is the sole copy) |
| **Codex (Knowledge)** | extra/codex.jsx | **knowledge** | built | RAG, stateful (docs+pgvector+MinIO) | **plugin** `knowledge` (plugin-able later) |
| **Recall (Search)** | extra/recall.jsx | **knowledge** | built | RAG search/answer | **plugin** `knowledge` (same module) |
| **User Management** | screens-admin.jsx | core (partial) | stub (localStorage) | identity | **Base** (core) — needs real backend |
| **Manage Tools** | screens-tools.jsx | **core** (llm/storage/settings) | built | system config | **Base** (core) |
| **Permissions / Roles** | screens-rbac.jsx | core (partial) | stub | RBAC admin | **Base** (core) |
| **Audit Log** | screens-rbac.jsx | — | stub | core admin | **Base** (core) — needs backend |
| **Settings** | extra/settings.jsx | **core** (settings) | built | per-user/global config | **Base** (core) |
| misc dashboards (Mana/Treasury/Chronicle/Watchtower/Quest Log) | extra/dashboards.jsx | — | stub | cosmetic | **Base** stubs — keep or cut, no backend |
| **Telegram** (new) | — (admin UI later) | **telegram** | backbone | channel into engine | **plugin** `telegram` |

⭐ = the user's named own-app candidate. Per §0, **own-app and in-main are the same bucket (a plugin)** —
"own-app" just means *this plugin is best packaged as its own app* (heavy/self-contained), still
re-integration-ready. Read every non-Base row as **a plugin**; the Target column notes its packaging.

**Backend modules that actually exist → their target:**

| Backend module | Routers/jobs | Target | Move to |
|---|---|---|---|
| infra · core · engine | health · auth/llm/storage/settings · ws + agent_run | **Base** | stay `app/` (Base) |
| knowledge | `/api/knowledge/*` + ingest_document | **plugin** | `app/modules/knowledge/` |
| compare | `/api/compare/*` | **own-app only** — in-main REMOVED 2026-06-29 | — (was `app/plugins/compare/`) |
| telegram | (to build) + poller | **plugin** | `app/modules/telegram/` |

---

## 2. Backend → a real plugin system (`app/modules/<name>/`)

The seam already exists (`app/modules.py` registry + `ENABLED_MODULES`, Base/plugin split done
2026-06-27). What remains is **moving each plugin's code into its own folder** so it's physically
self-contained ([modularity.md §3](modularity.md)):

```
app/
  modules.py   the REGISTRY (Base + plugins, gated by ENABLED_MODULES) — keeps this name (no app/modules/ folder)
  (Base stays flat: config · db · crypto · deps · main · worker · routers/{health,auth,llm_config,
   settings_config,storage,ws} · services/{agent_runner,…} · repositories/{runs,quests,users,…})
  plugins/                                                        ← one folder per plugin (the "plugin" naming)
    (compare/ REMOVED 2026-06-29 — own-app PiKaOs-Compare is the sole copy)
    knowledge/ router + services (ingestion/retrieval/summarize/answer/knowledge) + repos (doc_chunks, documents)
    telegram/  adapter + commands + service + router + worker poller (built fresh here)
```

> **Why `app/plugins/`, not `app/modules/`:** the registry file is `app/modules.py`, so a sibling
> `app/modules/` package would collide. Plugins live in **`app/plugins/<name>/`**; the registry keeps its
> name. Plugin = the user's term (own-app == in-main, §0).

**Rules for the move (per [modularity.md §2/§5](modularity.md)):**
- Move **routers + services + repositories** into `modules/<name>/`; **leave `models.py` + `alembic/`
  central for now** (the ER is already module-sectioned; relocating ORM models/Base metadata is the
  riskiest step — a later sub-phase, one module at a time, no big-bang).
- Only `app/modules.py` import lines change; the registry, `ENABLED_MODULES`, and call sites stay put.
- No new cross-module FK; cross-module references stay soft (bare UUID).
- **Verify after each move** (the bind mount caches — `docker compose restart backend` then `pytest`;
  see [lessons.md §E](../process/lessons.md)).

---

## 3. Frontend extraction

- **Base screens stay in Main:** Login · My Dashboard · Agents · Quest Board · Manage Tools · Settings ·
  User Management · Permissions · Audit (core + engine UI).
- **Plugin screens** (toggle with their backend plugin; can hide from nav when the plugin is off):
  Codex · Recall (knowledge) · Compare (compare) · Sitemap · Workflows (when built) · a Telegram admin
  screen (telegram).
- **Plugin (lift the screen out):**
  - **World State → `PikaOS-World`** ⭐ — built, heavy (Three.js + TipTap), **no backend**, self-contained
    room/3D/life-sim ([room-3d.md](../features/room-3d.md)). Strongest plugin candidate: it adds the
    biggest bundle to Main and shares nothing but the agent roster (pass as data). Own Vite app, own
    port (reserve in [ports.md](ports.md)); re-integration-ready.
  - **Compare → PiKaOs-Compare** (exists) · **RedirectMap → PiKaOs-RedirectMap** (exists).

> Nav is config-driven ([data.jsx](../../../PiKaOs-Core/Frontend/src/data/data.jsx) + the
> "จัดการเครื่องมือ" nav editor) and permission-gated — a plugin's nav item simply isn't shown when the
> user/build lacks it, so hiding an extracted feature is a config edit, not a code change.

---

## 4. Order of execution (lowest-risk first, verify each)

1. **Base established** ✅ (2026-06-27) — engine→Base, knowledge/compare→plugins, `ENABLED_MODULES` semantics.
2. **Backend plugin folders** ✅ **2026-06-27** — **compare** → `app/plugins/compare/` (router + service +
   net_guard + content + sitemap) and **knowledge** → `app/plugins/knowledge/` (router + ingestion/retrieval/
   summarize/answer/knowledge services + chunking/converters + doc_chunks/documents repos). **embeddings +
   the `vector(N)` type stay Base** (used by db/models/config). The engine↔knowledge coupling was broken by
   **injecting a `Retriever` into the engine runtime** (`agent_runner.set_engine_runtime(provider, tools,
   retriever)`) — the knowledge plugin supplies `KnowledgeRetriever`, wired by the worker **only when
   knowledge is active**; engine imports zero knowledge code → Base-only build = `infra,core,engine`.
   217 tests green. Next: build **telegram** into `app/plugins/telegram/`. *(models/alembic stay central.)*
   **Compare since REMOVED from main (2026-06-29)** — fully covered by the PiKaOs-Compare own-app, so the
   in-main `app/plugins/compare/` + its schemas/config/tests were deleted; main keeps only `knowledge`.
3. **World State → `PikaOS-World` plugin** — scaffold a plugin (build-first rules), lift
   `screens-world/*`, reserve ports, drop login, re-integration-ready. Remove the heavy screen from Main.
4. **Stubs** — leave in Base as frontend shells until their backend exists (engine CRUD phase D for
   Quest Board/Dashboard; user/RBAC backend for admin screens); extract only once real.
5. **Models/alembic per-module** (optional, later) — relocate each module's ORM models + migrations into
   `modules/<name>/`, one at a time, only if the central file becomes the bottleneck.

Each step leaves the system runnable and is independently verifiable on the live stack.

---

## 5. Open decisions (confirm before the big moves)

- **World State → plugin now, or after the Base/backend plugin moves?** (recommend: after step 2.)
- **Knowledge:** keep as an in-main plugin (co-located with the agent for RAG) **or** also extract to a
  `PikaOS-Knowledge` plugin? (recommend: in-main plugin now — the agent needs RAG locally; revisit.)
- **Compare in-main:** ✅ **RESOLVED (2026-06-29)** — the in-main compare module was **removed** (the
  PiKaOs-Compare own-app fully covers it); main no longer ships a compare mirror.
