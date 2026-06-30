# PiKaOs-App — composition root

The **App** layer assembles **PiKaOs-Core** (base infra + the agent-runtime platform) with the enabled
**plugins** and runs/tests the whole system. It holds **no business logic and no infrastructure** — only
wiring: the entrypoints (`main`, `worker`), the plugin/module registry (`modules`), the dynamic plugin
loader (`plugin_loader`), the full-stack `docker-compose`, and integration/e2e tests.

## Where the App layer actually lives

Per the **monorepo decision** (one repo; isolation comes from CI gates, not folder boundaries), the App
composition root is **not** a separate Python package. It lives at the Backend package root —
`PiKaOs-Core/Backend/app/{main,worker,modules,plugin_loader}.py` — sitting **above** `app/core/` (Core)
and `app/plugins/` (the features). The three layers are separated **logically**, and the separation is
enforced statically by import-linter (`PiKaOs-Core/Backend/.importlinter`):

```
app/                      ← the App composition root (this layer)
  main.py  worker.py      ← entrypoints
  modules.py              ← Base + plugin registry, ENABLED_MODULES, /health plugin_states
  plugin_loader.py        ← manifest discovery, topo boot order, dynamic router/job load
  core/                   ← PiKaOs-Core (Base): infra + identity/access + agent-runtime
  plugins/<id>/           ← features (manifest plugins) — knowledge, …
```

## Dependency rule (CI-enforced)

- **Core ↛ plugins** — remove any plugin and Core still imports.
- **Core ↛ App composition** — Core never reaches up into `main/worker/modules/plugin_loader`. The one
  prior breach (`core/routers/health.py` reading `modules.plugin_states()`) was **inverted via
  `app.state`**: the App registers the provider at startup and Core merely renders it.
- **Plugin ↛ sibling plugin** — features talk only through Core contracts (DI container + Event Bus).

Status: ✅ **layered + enforced.** A physical extraction into a standalone deployable (own Dockerfile,
Core consumed as a package) is intentionally **deferred** — it buys nothing under the monorepo while the
boundaries are already gated. Contract:
[`PiKaOs-Docs/docs/architecture/plugin-architecture.md`](../PiKaOs-Docs/docs/architecture/plugin-architecture.md) §1, §2, §4.
