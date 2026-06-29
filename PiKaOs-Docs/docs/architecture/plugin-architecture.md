---
title: Plugin architecture — strict Core + Plugins contract (PiKaOs)
type: architecture
status: design
keywords: [plugin, architecture, core, app, manifest, loader, event-bus, dependency-injection, contract-test, removability, import-linter, isolation, namespacing, migration]
related: [./modularity.md, ./extraction-plan.md, ./monorepo-consolidation.md, ./system-design.md, ../plugin/README.md, ./versions.md, ./ports.md]
summary: >
  The enforceable Core + Plugins contract PiKaOs is migrating to, adopted from the new-project kit
  (the source of truth). Core = infrastructure only; the AI/agent runtime and every feature are
  removable plugins that talk only through contracts / the Event Bus / DI — never plugin→plugin
  imports. Defines the manifest, load order, communication channels, isolation, and the CI gates.
updated: 2026-06-29
---

# Plugin architecture — strict Core + Plugins (PiKaOs target contract)

> **Upstream source of truth.** This contract is adopted from the kit at
> `/home/pika/Documents/MyProject/new-project/examples/plugin-architecture/system-design.md` — when the
> kit and this doc disagree, **the kit wins**; update this doc to match (see [[new-project-kit-is-source-of-truth]]).
> This file tailors the kit's generic (TypeScript) contract to PiKaOs's stack (FastAPI · arq · Vite/React)
> and decisions. It **supersedes** the light modular-monolith model in [modularity.md](modularity.md),
> which now links here; the concrete move order is [extraction-plan.md](extraction-plan.md).

> **The one litmus test.** *Any plugin can be removed (its migrations run down) and **PiKaOs-Core still
> boots, and every other plugin still works**.* Every rule below exists to keep that true. If it is ever
> false, the architecture is broken — fix the coupling, don't work around it.

## 0. PiKaOs decisions (where this differs from the generic kit)

- **Core = base infrastructure + the agent-runtime platform** (D1, 2026-06-29): identity/RBAC, config,
  storage, db/cache, the plugin framework (Loader · Router · DI container · Event Bus), **and `engine`** —
  the agent runtime (ws stream + `agent_runner` + worker jobs). PiKaOs is an **agent-ops platform**: the
  agent runtime is the platform **every plugin attaches to**, so it belongs in Core, not in a feature
  plugin. This is a deliberate, documented widening of the kit's "Core = pure infra" — justified because
  here the runtime *is* the shared platform. No **feature** business logic lives in Core.
- **The AI runs on its own server, still part of Core.** `engine`'s heavy execution (the arq worker,
  `deploy/docker-compose.ai.yml`) is a **separate deploy tier** of Core — Core is split across servers, not
  split into a plugin. "AI on another server" = a deployment fact, not a plugin boundary.
- **Single monorepo** (D2 — **revised 2026-06-29**, supersedes the earlier "full repo split"): the kit is
  itself **one git repo** with `core/`/`app/`/`plugins/` *folders*, and isolation is enforced by the CI
  gates (import-linter · manifest · removal-isolation), **not** by repo boundaries — so separate git repos
  bought overhead (cross-repo packaging, version drift) without isolation. `PiKaOs-Projects/` is therefore
  **one repo**: `PiKaOs-Core/` (incl. `engine`), `PiKaOs-App/` (composition root), `PiKaOs-Plugin/<id>/`
  *features*, and `PiKaOs-Docs/` are **folders** in it. The **own-app** plugins (Compare, RedirectMap) are
  the only things that stay separate git repos (own remotes + deploy). See
  [monorepo-consolidation.md](monorepo-consolidation.md) for the consolidation record + remaining steps (remote, CI move).
- **Stack mapping:** the kit's `dependency-cruiser` (JS) → **`import-linter`** (Python) for the backend; the
  TS `index.ts` lifecycle → a Python plugin package exposing `register()/boot()/shutdown()/enable()/disable()`.

## 1. Target structure

```
PiKaOs-Projects/                    the monorepo root (one git repo): CLAUDE.md · AGENTS.md · llms.txt
├── PiKaOs-Core/                    base infra + agent-runtime platform — knows no FEATURE
│   └── app/ { config · db · cache · crypto · deps · auth · rbac · storage · settings
│              · plugin_loader · router · container(DI) · event_bus · main(framework)
│              · engine/ (ws stream · agent_runner · worker jobs) }   # the runtime plugins attach to
│        # engine's heavy execution = the arq worker, deployed on its own server tier (docker-compose.ai.yml)
├── PiKaOs-App/                     composition root — NO logic, NO infra; only wiring + run/test
│   ├── plugins.config.(py|toml)    the enabled-plugin set (the §13 removal matrix toggles this)
│   ├── main.py                     build Core → validate manifests → topological boot → serve
│   ├── deploy/                     docker-compose for the FULL stack (Core + enabled plugins + datastores)
│   └── tests/ { integration · e2e(saga) }
├── PiKaOs-Plugin/<id>/             one self-contained vertical slice per FEATURE
│   │   (knowledge · world · telegram · compare · redirectmap · …)   # engine is Core, not here
│   ├── manifest.json               the contract (§3)
│   ├── config.schema.json          validated config + feature flags (§11)
│   ├── __init__.py                 exports register()·boot()·shutdown()·enable()·disable() (§10)
│   ├── backend/ { api · services · repositories · models · validation · jobs · events
│   │              · database/{migrations,seeds} }   # owns its tables (<id>_*)
│   ├── frontend/ { pages · components · routes · state · i18n · assets }
│   └── tests/ { unit · integration · contract }     # contract/ pins each consumed contract (§13)
└── PiKaOs-Docs/
```

## 2. The litmus rules (MUST / MUST NOT)

1. **Core contains zero business logic** — no feature endpoint/page/service/table/route/permission/config in Core.
2. **A plugin is removable** — delete its folder + run migrations down → Core and every *other* plugin still work.
3. **No plugin→plugin imports** — a plugin MUST NOT import another plugin's modules; cross-feature talk uses §5 only.
4. **Extend, never modify** — add features as plugins; never edit Core to add a feature (Open/Closed).
5. **Every global key is namespaced with the plugin `id`** (route · permission · event · DI token · DB table · menu · config key — §6).
6. **A plugin owns its tables only** — never read/write another plugin's tables; go through the owner's published contract (§7).
7. **Dependencies are acyclic** — a cycle is a hard boot failure, not a runtime workaround.

## 3. The plugin manifest (the contract)

Every plugin ships `manifest.json`; the Loader reads it **before any plugin code runs**. Validated against the
schema (canonical upstream: kit `reference/manifest.schema.json` → copied into `PiKaOs-Core`).

```jsonc
{
  "id": "knowledge",                 // globally unique · lowercase · the MANDATORY namespace prefix (§6)
  "name": "Knowledge / RAG",
  "version": "0.1.0",                // plugin semver
  "coreVersion": "^0.1.0",           // Core API range it is compatible with (§4)
  "dependencies": [],                // plugin ids that MUST boot first (topological)
  "optionalDependencies": [],        // used if present, degraded-but-functional if absent
  "provides": ["knowledge.Retriever"],            // contracts registered into the DI container
  "consumes": ["core.User", "core.Storage"],      // contracts resolved via DI (never imports)
  "permissions": ["knowledge.view", "knowledge.ingest"],
  "routes": ["/api/knowledge/*"],
  "events": { "emits": ["knowledge.ingested"], "listens": [] },
  "config": { "schema": "./config.schema.json" },
  "migrations": "./backend/database/migrations"
}
```

The Loader **refuses boot** when: `coreVersion` is incompatible · a hard `dependencies` entry is missing · the
graph has a cycle · a `route`/`permission`/`event`/`token` collides · a key is not `id`-prefixed · a `consumes`
contract was never `provide`d.

## 4. Load order, dependency resolution & versioning

- **Discovery automatic; order computed.** Loader reads all manifests → builds the dependency graph → **topological
  sort** → runs **`register()` for all** (so every `provides` exists in the container) → **`boot()` in dependency
  order**. **Cycle = hard failure** with a named error.
- **Version compat:** each plugin declares `coreVersion`; the Loader won't load a plugin whose range excludes the
  running Core. Record every plugin + Core version in [versions.md](versions.md) (registry rule — same commit).
- **Migration ordering:** each plugin owns its migrations; they run in **plugin dependency order** (down in reverse)
  so a soft reference into an upstream table never precedes it. (PiKaOs: same Alembic flow; no cross-plugin FK.)

## 5. Communication — the only three channels

```
Plugin ─▶ Core/owner Interface ─▶ Plugin    synchronous contract, resolved via DI (needs an answer now)
Plugin ─▶ Event Bus            ─▶ Plugin    async fire-and-forget; publisher ignorant of subscribers (PREFER)
Plugin ─▶ DI Container         ─▶ Shared Service  a Core-owned or plugin-provided contract
```

- **Prefer events** for anything not needing a synchronous answer.
- **Contracts are owned & versioned** — breaking a published interface is a **major** bump, coordinated via `dependencies`.
- **Cross-plugin writes use a saga + compensating actions**, never one DB transaction across plugins.
- **PiKaOs note:** the current `engine`↔`knowledge` link (`agent_runner.set_engine_runtime(provider, tools, retriever)`)
  becomes **Core's `engine` consuming the `knowledge.Retriever` contract** via DI — Core defines the interface, the
  knowledge plugin `provides` the impl, the container injects it; no direct import (§13 contract test pins it).

## 6. Namespacing — no silent collisions

Every globally-visible key MUST be prefixed with the plugin `id`: permission `knowledge.ingest` · event
`knowledge.ingested` · route `/api/knowledge/*` · DB table `knowledge_*` (or schema) · DI token `knowledge.Retriever`
· menu id · config key. The Loader validates prefixes at boot; a collision is a boot failure.

## 7. Shared data & cross-cutting entities

- Widely-shared entities (User, Department/Tenant, AuditLog) are **owned by Core** (`core.User`); plugins consume the
  interface, **never read its table**.
- A plugin needing another plugin's data calls that plugin's **published service contract**, never SQL into its tables.
- Cross-feature reporting that needs joins uses a **read model / projection fed by events**, not cross-schema queries.
- PiKaOs already follows the seed of this: **no cross-module FK; cross-module refs are soft (bare UUID)**.

## 8. Fault isolation

Each lifecycle call runs inside a boundary — an exception is caught, logged with the plugin id, and the plugin is
marked **degraded** (it doesn't crash Core or others, unless a hard dependant required it). Event Bus delivery is
isolated (a failing subscriber never fails the publisher); synchronous contract calls use **timeouts + circuit
breakers**. Logs/metrics are scoped + tagged by plugin id.

## 9. Security boundaries (least privilege)

- **Capability, not ambient authority** — a plugin resolves only the contracts it declared in `consumes`; the
  container refuses an undeclared token.
- **Authz at the contract edge** — every cross-plugin call + route carries the caller's permission context; the
  framework checks the namespaced permission.
- **Data-scope enforcement** — shared services apply department/row-level scoping centrally.
- **Secrets per the always-on rule** — gitignored env behind the prod boot-guard; never in a manifest or the
  browser-shipped frontend bundle (`VITE_*`).

## 10. Lifecycle

```
register()          register services/contracts into the DI container — NO cross-plugin calls yet
boot()              wire routes · menus · permissions · listeners · scheduled jobs — in dependency order
shutdown()          release · flush · deregister — in reverse dependency order
enable()/disable()  toggle at runtime without redeploy — idempotent (§11)
```

## 11. Config, feature flags & runtime enable/disable

Config is **schema-validated** (`config.schema.json`) and **config-driven, not hardcoded** (read from one settings
object, editable from the "จัดการเครื่องมือ" tools screen + DB). Feature flags gate risky paths. A plugin can be
**disabled without redeploy** — the Loader runs `disable()` and unregisters its routes/menus/listeners; because
nothing imports it, the rest keeps running.

## 12. Layering inside every plugin

`HTTP/route layer → service/business-logic layer → repository/data-access layer`. All data access in the repository
layer; async I/O; config from one settings object. Keep this even in small plugins so merge-back stays mechanical.

## 13. Testing strategy (how isolation is proven, not assumed)

| Level | Scope | Guarantees |
|---|---|---|
| **Unit** | one plugin, deps mocked | business-logic correctness |
| **Integration** | one plugin vs real DB + in-memory bus | migrations + repo + events wire up |
| **Contract (consumer-driven)** | the *consuming* plugin pins a `consumes` contract; the *provider's* CI verifies it | a provider can't silently break a consumer across the no-import boundary |
| **Isolation** | boot the App with the plugin **disabled** | proves §2.2 — Core + others still boot (CI matrix) |
| **E2E (saga)** | the cross-plugin flow incl. the failure path | compensating actions actually compensate |

## 14. Observability

Structured logs tagged `{plugin.id, request.id, department.id}`; per-plugin metrics + lifecycle (boot time, degraded
count); a trace id propagated through bus events so a saga is one trace; `/health` reports Core + each plugin's state
(`active`/`degraded`/`disabled`) + version **from the manifest** (never hardcoded → ties to [versions.md](versions.md)).

## 15. Enforcement — every rule is a CI gate

| Rule | Gate (PiKaOs) |
|---|---|
| No plugin→plugin imports (§2.3) · Core ↛ plugins (§2.1) | **import-linter** contracts (Python) — fail on a forbidden import |
| Manifest valid (§3) | JSON-schema-validate every `manifest.json` (ajv/CI) |
| Namespacing (§6) · acyclic graph (§4) | Loader self-check at boot + CI |
| Removability (§2.2) | CI matrix boots the App once per plugin with that plugin disabled in `plugins.config` |
| Contracts honored (§13) | consumer-driven contract tests run in the provider's pipeline |
| Version config-driven | no-hardcode guard; version flows manifest → `/health` → [versions.md](versions.md) |

## 16. Migration order (PiKaOs — see extraction-plan.md for live status)

Each phase leaves the system runnable + verifiable:
0. **This contract** (docs) ✅
1. **Foundation** ✅ (2026-06-29) — manifest + Python Loader (topological, `coreVersion` semver, namespacing +
   acyclic self-check) in [`plugin_loader.py`](../../../PiKaOs-Core/Backend/app/plugin_loader.py); `modules.py`
   drives the plugin tier from manifests (Base = infra/core/engine hardcoded as Core); `knowledge` is the first
   manifest plugin. Backend tests green. *(Physical `core/` move = deferred Phase 1b — mechanical, logic-free.)*
2. **Enforcement gates** ✅ (2026-06-29) — three gates wired into the **`architecture` CI job** (lightweight, no
   stack): **import-linter** ([`.importlinter`](../../../PiKaOs-Core/Backend/.importlinter)) forbids Core→plugins
   + plugin→sibling (the one engine→knowledge import is a documented Phase-3 `ignore_imports`);
   **manifest schema validate** ([`scripts/check_manifests.py`](../../../PiKaOs-Core/Backend/scripts/check_manifests.py)
   vs `manifest.schema.json`); **removal-isolation** as in-process pytest
   ([`tests/test_isolation.py`](../../../PiKaOs-Core/Backend/tests/test_isolation.py)) — `/api/knowledge` routes
   appear only when enabled, Base survives every plug-out. *(A full container-boot matrix can layer on later.)*
3. **Communication** ✅ (2026-06-29) — DI container ([`container.py`](../../../PiKaOs-Core/Backend/app/container.py))
   + Event Bus ([`events.py`](../../../PiKaOs-Core/Backend/app/events.py), fault-isolated per §8) + a plugin
   lifecycle (`register()`/`boot()` + `jobs`) the Loader drives. The `engine`↔`knowledge` coupling now goes
   **only** through the `knowledge.Retriever` contract ([`contracts.py`](../../../PiKaOs-Core/Backend/app/contracts.py)):
   knowledge `register()`s the impl into the container, the worker resolves it for the engine, and the
   ingestion job moved into the plugin (`jobs.py`) — so **Core statically imports zero plugin code** (the
   import-linter `ignore_imports` exception was removed). A consumer-driven contract test
   ([`tests/test_plugin_contract.py`](../../../PiKaOs-Core/Backend/tests/test_plugin_contract.py)) pins the
   binding against the engine's `Retriever` interface. *(DI wired at the worker composition root; the App
   root unifies web+worker wiring in Phase 5.)*
4. **Namespacing + `/health`** ✅ (2026-06-29) — `/api/health` now returns a `plugins[]` array, each
   `{id, version, state}` with **version read from the manifest** (§14, never hardcoded → versions.md) and
   state `active`/`disabled` (disabled plugins still listed). Route namespacing (§6) is now Loader-enforced:
   a manifest `routes` entry must carry the plugin's `/{id}` segment, so two plugins can't collide on a URL.
5. **Monorepo consolidation** ✅ (2026-06-29, replaces the old "repo split") — D2 revised to a single repo
   ([monorepo-consolidation.md](monorepo-consolidation.md)): `PiKaOs-Core`/`PiKaOs-Docs`/`PiKaOs-App` collapsed from
   separate git repos into **folders** of `PiKaOs-Projects/` (history bundled + on the old remotes; code
   byte-identical). Own-app plugins (Compare, RedirectMap) stay separate repos. The internal `core/`↔
   `plugins/` folder move + the `PiKaOs-App` composition root remain (Phase 1b + below). Remaining: pick the
   monorepo remote + move CI workflows to root `.github/` with `PiKaOs-Core/` path prefixes.
6. **Frontend** — per-plugin frontend modules (pages/routes/i18n/state).

## 17. Design principles (the why)

SOLID · Dependency Inversion · Interface Segregation · Event-Driven · Loose Coupling / High Cohesion · Separation of
Concerns · Open/Closed · Least Privilege · DRY · KISS.
