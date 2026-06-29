---
title: Repo split plan — PiKaOs-App composition root + features as their own repos (Phase 5)
type: architecture
status: design
keywords: [repo split, pikaos-app, composition root, packaging, entry-points, monorepo, submodule, docker context, phase 5, plugin]
related: [./plugin-architecture.md, ./extraction-plan.md, ./ports.md, ./versions.md, ../plugin/README.md]
summary: >
  How PiKaOs goes from one backend repo (Core with app/plugins/ inside it) to the kit's repo split —
  PiKaOs-Core (Base + engine), PiKaOs-App (the composition root that assembles + serves), and each
  feature under PiKaOs-Plugin/<id>/. Lays out the ONE decision that gates the move (how App depends on
  Core + plugins across separate git repos) with options + a recommendation, then the ordered, reversible
  steps. Status design: NOT executed — the dependency/deploy model needs sign-off (hard to reverse).
updated: 2026-06-29
---

# Repo split plan — Phase 5 (design, not yet executed)

Phases 1–4 of [plugin-architecture.md §16](plugin-architecture.md) made the Core + Plugins contract real
**in place** (manifest + Loader, CI gates, DI + Event Bus, per-plugin `/health`). Phase 5 is the physical
split into the kit's three-repo shape. It is **hard to reverse** (it spans `PiKaOs-Core`, the new
`PiKaOs-App`, and `PiKaOs-Plugin/<id>/`, plus the deploy stacks), so this doc gets sign-off **before** any
destructive move — everything below is the plan, nothing here is done yet.

## Target shape (kit §1)

```
PiKaOs-Core/        Base infra + the engine (agent-runtime). A library, not a deployable on its own.
PiKaOs-App/         the COMPOSITION ROOT — owns main.py + worker.py + deploy/; assembles Core + the
                    enabled plugins and serves. No business logic, only wiring (kit app/src/main.ts).
PiKaOs-Plugin/<id>/ each feature as its own repo (knowledge first). Manifest + router + register()/jobs.
```

Core stays a library: the engine and its arq worker remain a **Core deploy tier** (D1), but *which*
plugins run is the App's call, declared in one place (the App's enabled-plugin set + lockfile).

## The one decision that gates everything: how does App depend on Core + plugins?

The kit is a single TypeScript repo, so its App just relative-imports `../../core` and `../plugins/<id>`.
PiKaOs is an **umbrella of separate git repos** (each child has its own remote), so we need a Python +
Docker answer the kit doesn't give. Three viable models:

| Model | How App pulls Core + a plugin | Plugin discovery | Pros | Cons |
|---|---|---|---|---|
| **A. Installable packages + entry-points** *(kit-faithful target)* | `pikaos-core` and `pikaos-plugin-knowledge` are pip packages; App's `requirements.txt` pins them; each plugin advertises a Python **entry point** (group `pikaos.plugins`) | Loader switches from "scan `app/plugins/*`" to `importlib.metadata.entry_points(group="pikaos.plugins")` | true isolation + independent versioning; removing a plugin = drop one line in App reqs; matches own-app==in-main | needs a build/publish step (or `pip install git+https`/path), and a Loader change |
| **B. Git submodules** | App repo adds Core + each plugin as submodules; Docker build context includes them | unchanged (scan a vendored dir) | no packaging step | submodule friction; not real isolation; cross-submodule Docker context |
| **C. Workspace / path deps** *(stepping stone)* | umbrella stays a workspace; App references `../PiKaOs-Core` + `../PiKaOs-Plugin/<id>` as path deps (uv workspace or `pip -e`); Docker builds from the **umbrella root** so the context spans siblings | unchanged at first | least churn; runnable fast; keeps history in place | App isn't independently buildable without the siblings present; Docker context = whole umbrella |

**Recommendation:** target **A** (it's the only model that delivers the isolation Phases 1–4 were built
for — a plugin you can add/remove by editing one dependency line, discovered without the App knowing its
path). Get there via **C as a stepping stone**: stand up the App composition root with path deps first so
the system runs from `PiKaOs-App` end-to-end, *then* convert Core + knowledge to published packages and
flip the Loader to entry-points. Each hop stays runnable. **This recommendation needs your confirmation
before step 2 below — it changes how every deploy is built.**

> Verify-currency note (CLAUDE.md rule 8): confirm the current packaging tool before building — `uv`
> workspaces vs `pip`/`hatch`, and `importlib.metadata.entry_points(group=...)` (stdlib, the modern API)
> — against today's docs at execution time, not from memory.

## Ordered steps (each independently verifiable; reversible until step 3)

0. **This plan signed off** — pick the dependency model (A via C, or another). *(gate)*
1. **App composition root, additive** — in `PiKaOs-App/`, create `main.py` + `worker.py` that import Core
   and call the existing `modules.register_routers` / `plugin_loader.register_plugins`. Wire via model C
   (path deps), Docker built from umbrella root. Core's own `main.py` stays until step 4. **Reversible.**
2. **Core becomes a library** — package Core (`pyproject.toml`, name `pikaos-core`); App installs it.
   Move `deploy/` to the App (the App owns how the system runs). **Reversible (revert the move).**
3. **Move `knowledge` out** — `git mv` (history-preserving, or `git filter-repo` into the plugin repo)
   `PiKaOs-Core/Backend/app/plugins/knowledge/` → `PiKaOs-Plugin/knowledge/`; publish it as
   `pikaos-plugin-knowledge` with a `pikaos.plugins` entry point; flip the Loader to entry-point discovery.
   **First hard-to-reverse step — do only after 1–2 are green.**
4. **App is the only entrypoint** — delete Core's `main.py`; Core is import-only (engine + Base library).
   Re-point CI (the `architecture` + `backend` jobs move/extend to the App). Update [ports.md](ports.md) /
   [versions.md](versions.md) for the new app identities.

## What must stay true through the split (regression guards)

- The Phase-2 gates still pass: import-linter `Core ↛ plugins`, manifest schema, removal-isolation.
- `/health` still lists each plugin with its **manifest** version (§14).
- The engine still reaches `knowledge` only through the `knowledge.Retriever` DI contract — the split must
  not reintroduce a static import.
- Every step leaves a bootable stack (`docker compose up`) + green backend tests.

## Rollback

Steps 1–2 revert by undoing the additive files / the `deploy/` move. Step 3 is the cut line: keep the
`git mv` on a branch and tag Core at the pre-move commit; if the entry-point Loader or cross-repo build
misbehaves, restore `app/plugins/knowledge/` from that tag and re-pin the in-tree Loader. Do not delete
Core's `main.py` (step 4) until the App has served a full stack in CI.
