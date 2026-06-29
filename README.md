# PiKaOs

Monorepo for the **PiKaOs** platform — an agent-ops application (FastAPI · arq · Vite/React).

## Layout

| Folder | What it is |
|---|---|
| [`PiKaOs-Core/`](PiKaOs-Core) | The app — `Backend/` (FastAPI + agent runtime + plugin framework), `Frontend/` (Vite/React), `deploy/` (Docker stacks). |
| [`PiKaOs-App/`](PiKaOs-App) | Composition root — assembles Core + the enabled plugins and runs the stack. |

Features are **removable plugins** under `PiKaOs-Core/Backend/app/plugins/<id>/`, each declared by a
`manifest.json` and wired only through contracts / a DI container / an Event Bus — never plugin→plugin
imports. The boundaries are enforced in CI (import-linter, manifest validation, removal-isolation).

> Internal development docs, rules, and the knowledge base live in a **separate private repository**.

## Run

See [`PiKaOs-Core/README.md`](PiKaOs-Core/README.md) for the dev/run instructions (Docker compose stacks).
