# PiKaOs-App — composition root (placeholder)

The **App** assembles **PiKaOs-Core** (base infra + the agent-runtime platform) with the enabled
**PiKaOs-Plugin/<id>/** plugins and runs/tests the whole system. It holds **no business logic and no
infrastructure** — only wiring (`plugins.config`), the entrypoint (`main`), the full-stack
`docker-compose`, and integration/e2e (saga) tests.

Status: 🟡 **placeholder** — created during the folder-rename step so the target structure is visible.
Built out in **Phase 5** of the migration. Contract: [`PiKaOs-Docs/docs/architecture/plugin-architecture.md`](../PiKaOs-Docs/docs/architecture/plugin-architecture.md) §1, §2.17, §4.
