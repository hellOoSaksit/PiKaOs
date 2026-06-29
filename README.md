<div align="center">

# PiKaOs

**A Thai-first, multi-agent “agent-ops” platform** — run, observe, and govern fleets of AI agents
with the discipline of production software, wrapped in a guild-flavored experience.

[![CI](https://github.com/hellOoSaksit/PiKaOs/actions/workflows/ci.yml/badge.svg)](https://github.com/hellOoSaksit/PiKaOs/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.137-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-5-646CFF?logo=vite&logoColor=white)
![Postgres](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)

</div>

---

## Overview

**PiKaOs** is a self-hostable platform for **operating AI agents** with the controls normally reserved
for production systems: identity & access control, out-of-process queued execution, live per-step
observability, quotas, and an auditable trail — presented through a **Thai-first**, game-flavored UI so
non-engineers can take part safely.

This repository is the **monorepo** for the platform. It is built on a **strict Core + Plugins**
architecture: a small, stable core provides the infrastructure and the agent runtime, while every
feature is a **removable plugin** that communicates only through published contracts — never by reaching
into another plugin.

## Architecture — Core + Plugins

The boundary between the platform and its features is **enforced, not merely encouraged**. Every rule is
a machine check in CI:

| Principle | How it is guaranteed |
| --- | --- |
| **Core never depends on a feature** | `import-linter` contracts fail the build on any Core → plugin or plugin → sibling-plugin import. |
| **Every plugin is removable** | A removal-isolation test boots the app with each plugin disabled and asserts the core and the others still run. |
| **Plugins declare a contract** | Each plugin ships a `manifest.json` (id, version, dependencies, provided/consumed contracts, routes, events), schema-validated in CI. |
| **Features talk through seams, not imports** | A dependency-injection container + an event bus connect plugins; cross-plugin calls resolve a declared contract. |
| **The loader enforces order & compatibility** | Topological boot by declared dependencies, semantic-version compatibility checks, and namespacing — verified at startup. |

The **agent runtime** (the engine: agent loop, worker jobs, and retrieval) lives in the core as the
platform every plugin attaches to. The first feature plugin — **Knowledge / RAG** — demonstrates the
contract model end to end.

## Repository layout

| Path | Description |
| --- | --- |
| [`PiKaOs-Core/`](PiKaOs-Core) | The platform — `Backend/` (FastAPI · arq worker · plugin framework · agent engine), `Frontend/` (Vite + React), and `deploy/` (Docker Compose stacks). |
| [`PiKaOs-App/`](PiKaOs-App) | Composition root — assembles the core with the enabled plugins and runs the full stack. |

Related projects live in their own repositories:

| Repository | Visibility | Purpose |
| --- | --- | --- |
| [**PiKaOs**](https://github.com/hellOoSaksit/PiKaOs) | Public | This monorepo — the platform (core + app). |
| [**PiKaOs-Plugin**](https://github.com/hellOoSaksit/PiKaOs-Plugin) | Public | Stand-alone “own-app” plugins (e.g. Website Compare, Redirect Map) that ship and deploy independently. |
| **PiKaOs-Docs** | Private | Internal design dossier, architecture decisions, and engineering knowledge base. |

## Tech stack

**Backend** — FastAPI, async SQLAlchemy + Alembic, an [`arq`](https://arq-docs.helpmanual.io/) worker on
Redis, PostgreSQL, and S3-compatible object storage (MinIO).
**Frontend** — React 18 + Vite, fully internationalized (Thai-first).
**Runtime** — Docker Compose, split into independent stacks (data · backend · AI worker · frontend) for
single-machine development or per-component deployment.

## Getting started

The platform’s full setup, run instructions, and the complete **Business / System Analysis dossier** are
in the core README:

➡️ **[`PiKaOs-Core/README.md`](PiKaOs-Core/README.md)**

```bash
git clone https://github.com/hellOoSaksit/PiKaOs.git
cd PiKaOs/PiKaOs-Core
# follow PiKaOs-Core/README.md to bring up the Docker Compose stacks
```

## Documentation

Architecture, design decisions, and the engineering knowledge base are maintained in the **private**
`PiKaOs-Docs` repository. This public README and the per-folder READMEs are the open entry points.

---

<div align="center">
<sub>Built as a modular monolith — one platform today, cut along clean seams so any capability can be
extracted and shipped on its own.</sub>
</div>
