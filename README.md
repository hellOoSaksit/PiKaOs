<div align="center">

# PiKaOs

### Operate fleets of AI agents — with the discipline of production software.

A **self-hostable, Thai-first “agent-ops” platform**: run AI agents under real access control, reliable
out-of-process execution, live step-by-step observability, hard cost limits, and a full audit trail —
wrapped in an approachable, role-aware workspace so non-engineers can take part safely.

[![Release](https://img.shields.io/github/v/release/hellOoSaksit/PiKaOs?label=release)](https://github.com/hellOoSaksit/PiKaOs/releases)
[![CI](https://github.com/hellOoSaksit/PiKaOs/actions/workflows/ci.yml/badge.svg)](https://github.com/hellOoSaksit/PiKaOs/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.137-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-compose-2496ED?logo=docker&logoColor=white)

</div>

---

## Why PiKaOs?

Adopting LLM agents quickly hits **operational** walls, not modeling ones:

> *Who is allowed to run what? How do we stop a runaway job from draining the budget? What did the agent
> actually do, step by step? How do non-technical staff take part safely?*

Off-the-shelf chat UIs answer none of these. **PiKaOs is the control plane that does** — it treats an agent
run like a governed, observable, bounded production job, and makes the whole thing approachable for a
Thai-speaking, non-technical team.

## What it does

| | Capability | What you get |
| :--: | --- | --- |
| 🛡️ | **Governed runs** | Server-side **RBAC** — every action is permission-checked against role grants ± per-user overrides. Nothing runs that the caller isn’t allowed to run. |
| ⚙️ | **Reliable execution** | Runs are **queued and executed on a separate worker** (arq + Redis). A slow or crashed job can never take the API down. Each run is **replay-safe, cancellable**, and bounded. |
| 📡 | **Live observability** | Every agent step streams to the UI over **WebSocket (~1s)** as a real-time *worklog*; structured logs are stamped with run / task / agent IDs. |
| 💰 | **Cost &amp; blast-radius control** | **Atomic per-user token quotas** + per-run step and wall-clock ceilings keep spend and damage bounded by design. |
| 🧠 | **Knowledge / RAG** | A **markdown-as-truth** document store agents retrieve from — durable, diff-able, no vector-DB lock-in. Shipped as a removable plugin. |
| 🌐 | **Website Compare** | A stateless, **SSRF-guarded** tool that diffs a UAT site against production by sitemap coverage + deep content diff — shipped as its own app. |
| 🧾 | **Audit trail** | A reviewable record of **who ran what, when, and with what effect**. |
| 🇹🇭 | **Thai-first UX** | A role-aware, fully-internationalized interface with **zero hard-coded strings** — professional Thai vocabulary throughout. |
| 🧩 | **Pick what you install** | Features are plugins — a deployment loads only the ones it enables (see *Architecture* below). |
| 📦 | **Self-hostable** | The whole stack runs in **Docker**; individual capabilities can be extracted into lightweight, single-purpose deployments. |

## How it works

```mermaid
flowchart LR
  user([Operator / Admin]) -->|HTTPS · WebSocket| FE[React SPA]
  FE -->|/api · /ws| BE[FastAPI service]
  BE --> DB[(PostgreSQL)]
  BE --> RDS[(Redis)]
  BE --> OBJ[(MinIO / S3)]
  BE -. enqueue .-> RDS
  RDS -. job .-> WK[arq Worker]
  WK -->|provider adapter| LLM{{LLM providers}}
  WK --> DB
```

The React SPA talks to a **FastAPI** service for HTTP + WebSocket. Agent work is **enqueued to Redis** and
run by a **separate `arq` worker** that calls the LLM providers — so the request path stays fast and the
API stays up even when a job misbehaves. PostgreSQL holds the system of record; MinIO holds files; Redis
backs the queue, the live worklog stream, and the permission cache.

## Architecture — Core + Plugins

PiKaOs ships as **one deployable**, but is cut along clean seams: a small, stable **Core** provides the
infrastructure and the agent runtime, while every feature is a **removable plugin** that talks only through
published contracts. The boundary is **enforced in CI**, not just encouraged:

| Principle | How it’s guaranteed |
| --- | --- |
| **Core never depends on a feature** | `import-linter` fails the build on any Core → plugin import. |
| **Core never depends on the App layer** | A separate contract forbids Core → composition-root imports; cross-cutting needs are inverted (e.g. `/health` reads plugin state injected via `app.state`). |
| **Plugins never reach sideways** | A plugin importing a sibling plugin fails the build — features connect only through Core contracts. |
| **Every plugin is removable** | A removal-isolation test boots the backend with all plugins disabled (`ENABLED_MODULES=""`) and the frontend with none registered — Base must still build and run. |
| **Plugins declare a contract** | Each ships a schema-validated `manifest.json` (id, version, dependencies, contracts, routes, events) + a `config.schema.json`. |
| **Features connect through seams** | A dependency-injection container + an event bus on the backend; a route/nav registry on the frontend — never direct imports. |

**The plugins today.** *Knowledge / RAG* (full-stack: API, worker jobs, retrieval contract, UI) and the
*3D workspace map* (a self-contained front-end feature) are both plugins; *Website Compare* and *Redirect
Map* ship as stand-alone “own-app” plugins. Add a feature = one folder + a manifest, with **no Core edits**.

**Where it’s headed.** Because installed-vs-enabled is already a real distinction, the roadmap is a UI to
**choose what to install** — enable, disable, or uninstall a plugin (with its own schema) at the system
level, loading only what you pick. A broken plugin is fault-isolated (`degraded`), never fatal to Core.

This is the engineering payoff of a **modular monolith**: low footprint today, and any capability can be
**extracted and shipped on its own** tomorrow (as [Website Compare](https://github.com/hellOoSaksit/PiKaOs-Plugin) already is).

## Tech stack

**Backend** — FastAPI · async SQLAlchemy + Alembic · an [`arq`](https://arq-docs.helpmanual.io/) worker on
Redis · PostgreSQL 16 · MinIO (S3) · `import-linter`-enforced plugin boundaries.
**Frontend** — React 18 + Vite · a zero-runtime-dependency component kit · a front-end plugin registry · Thai-first i18n.
**Runtime** — Docker Compose, split into independent stacks (data · backend · AI worker · frontend).

## Repository layout

| Path | Description |
| --- | --- |
| [`PiKaOs-Core/`](PiKaOs-Core) | The platform — `Backend/` (API · worker · plugin framework · agent engine · `app/plugins/`), `Frontend/` (Vite + React · `src/plugins/`), `deploy/` (Docker stacks). |
| [`PiKaOs-App/`](PiKaOs-App) | Composition root — assembles Core with the enabled plugins and runs the full stack. |

| Related repository | Visibility | Purpose |
| --- | --- | --- |
| [PiKaOs-Plugin](https://github.com/hellOoSaksit/PiKaOs-Plugin) | Public | Stand-alone “own-app” plugins (Website Compare, Redirect Map). |
| PiKaOs-Docs | Private | Internal design dossier &amp; engineering knowledge base. |

## Getting started

The full setup, run scripts, and the complete **Business / System Analysis dossier** (with diagrams) live
in the core README:

➡️ **[`PiKaOs-Core/README.md`](PiKaOs-Core/README.md)**

```bash
git clone https://github.com/hellOoSaksit/PiKaOs.git
cd PiKaOs/PiKaOs-Core      # then follow the README to bring up the Docker stacks
```

## Contributing

`main` is protected and trunk-based: branch → pull request → green CI (`frontend` · `architecture` ·
`backend`) → squash-merge. Commits follow [Conventional Commits](https://www.conventionalcommits.org/);
versions are [SemVer](https://semver.org/) and published on the [releases page](https://github.com/hellOoSaksit/PiKaOs/releases).

---

<div align="center">
<sub>Built as a modular monolith — one platform today, cut along clean seams so any capability can be extracted and shipped on its own.</sub>
</div>
