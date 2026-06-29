---
title: PiKaOs documentation map (index)
type: index
status: active
keywords: [docs index, map, navigation, reading order, router, architecture, features, plugin, process]
related: [../../CLAUDE.md, ./pikaos-dev-rules.md, ./GLOSSARY.md, ./process/session-handoff.md]
summary: >
  The top-level docs map: which doc owns which topic and in what order to read. Start here after
  the router (CLAUDE.md); open only the doc your task needs (progressive disclosure).
updated: 2026-06-20
---

# docs/ — PiKaOs documentation map (read this first)

> Index for humans + AI: which doc owns which topic, and in what order to read.
> Rules (mandatory): the shared cross-project router is [`../../CLAUDE.md`](../../CLAUDE.md);
> the full PiKaOs rules (§0–§6) live in [`pikaos-dev-rules.md`](pikaos-dev-rules.md) in this folder.
> Project overview (GitHub): [`../README.md`](../README.md).
> **All docs are written in English** (AI-first — keeps them token-cheap); Thai only for *content*
> (UI strings, seed data, chat), never doc prose.

Docs are split by **4 jobs** — open only what you need (saves tokens + avoids getting lost):

| Job | Its home |
|---|---|
| **Dev rules** (PiKaOs hard rules §0–§6) | [`pikaos-dev-rules.md`](pikaos-dev-rules.md) |
| **Where am I** (status, handoff across sessions) | [`process/session-handoff.md`](process/session-handoff.md) |
| **How to work** (patterns / approach) | [`process/playbook.md`](process/playbook.md) |
| **What we hit / decided** (experience) | [`process/lessons.md`](process/lessons.md) |
| **What we're building** (blueprint + features) | [`architecture/`](architecture) · [`features/`](features) |
| **What does this term mean** (domain vocabulary) | [`GLOSSARY.md`](GLOSSARY.md) |
| **Start a new doc** (copy-to-create scaffolds) | [`templates/`](templates/README.md) |
| **Spin up / refactor a project** (the scaffold kit) | [`new-project/`](new-project) |

## Reading order for a new session (minimum — don't over-read)

1. [`process/session-handoff.md`](process/session-handoff.md) — status: what's done / what's pending / starting prompt
2. [`process/playbook.md`](process/playbook.md) + [`process/lessons.md`](process/lessons.md) — how to work + don't repeat mistakes
3. [`pikaos-dev-rules.md`](pikaos-dev-rules.md) (PiKaOs rules §0–§6) + the shared router [`../../CLAUDE.md`](../../CLAUDE.md) — hard rules + **Task router** pointing to the owning `.md`
4. Everything else **only as the router / tables below point you**, per the task at hand

## architecture/ — target system + risks + stack

| File | Owns | Read when |
|---|---|---|
| [`system-design.md`](architecture/system-design.md) | Engine blueprint: arq worker · agent loop · HERMES · WS · data model/ER · build order | touching the engine/WS/schema in any way |
| [`data-model.md`](architecture/data-model.md) | **As-built ER — table by table** (column/FK/index/status), written for non-technical successors + the rule to update it when schema changes | changing schema / want to know what a table stores / handing off |
| [`rbac.md`](architecture/rbac.md) | **Access control as-built** — the 31-key permission catalog · 4 roles · effective-perm math (deny wins, admin=all) · where it's server-enforced vs FE-only · the view/manage/delete split model + remaining split candidates | touching permissions/roles · adding a guarded endpoint · deciding how fine to split a permission |
| [`database-design.md`](architecture/database-design.md) | **DB/ER design rules** — clarity-first naming/keys/normalization · performance (indexing/N+1/pagination) · **when to split a database** (bounded context) | designing/changing a schema · deciding whether to split a DB |
| [`design-review.md`](architecture/design-review.md) | Critical review of the blueprint — risks P0–P2 (resume/side-effect, RBAC, WS leak) | before an architecture decision |
| [`risk-mitigation.md`](architecture/risk-mitigation.md) | Design that fixes all 15 risks + revised build order — **read before building the engine** | before writing any engine code |
| [`tech-stack.md`](architecture/tech-stack.md) | Real stack (versions) + what's to be added + dependency policy (even "add nothing" is written down) | adding/upgrading a dependency |
| [`dependency-audit.md`](architecture/dependency-audit.md) | **System-wide buy-vs-build audit** — every hand-rolled piece, the library that could replace it, verdict (SWAP/ADD-later/KEEP) + risk flags (arq maintenance, litellm/AGPL/abandoned) | deciding whether to adopt a lib vs hand-roll · periodic dep review |
| [`knowledge-rag.md`](architecture/knowledge-rag.md) | How the whole system stores docs/knowledge — **decision-locked: markdown = truth · pgvector = throwaway cache** (Hermes+Obsidian) + vault layout + when to enable vector | touching document storage / RAG / codex |
| [`plugin-architecture.md`](architecture/plugin-architecture.md) | **★ Strict Core + Plugins contract (target, adopted from the kit)** — Core = infra + agent runtime; every feature a removable plugin (manifest · loader · Event Bus · DI · contract tests · removal-isolation CI). Supersedes modularity.md | building the plugin system · adding/removing a plugin · the migration |
| [`modularity.md`](architecture/modularity.md) | **(light model — superseded by [plugin-architecture.md](architecture/plugin-architecture.md))** Modular Monolith · module = bounded context · FK into core only · ENABLED_MODULES | historical · per-department footprint |
| [`extraction-plan.md`](architecture/extraction-plan.md) | **Per-feature assessment → Base/plugin roadmap**: reduce Main to Base (infra+core+engine); everything else = a plugin (own-app == in-main packaging, easy-out/easy-in). World State → own-app; backend plugin folders | extracting a feature · planning what moves where |
| [`monorepo-consolidation.md`](architecture/monorepo-consolidation.md) | **Why PiKaOs is ONE repo of folders** (D2 revised — separate-repo split reversed) + what the consolidation did + remaining steps (monorepo remote, move CI to root `.github/`, internal core/↔plugins/ layout) | understanding the repo layout · finishing the consolidation (remote/CI) |
| [`deploy.md`](architecture/deploy.md) | **Deploy: single machine, 4 separate stacks (dev default) ↔ split servers per component** — 3 env files · per-stack compose (`deploy/`) · sizing+cost · prod checklist (Redis auth/secrets) | deploying / planning machines / splitting servers by cost |
| [`release-and-rollback.md`](architecture/release-and-rollback.md) | **SaaS update + rollback system (design)** — one versioned release (FE+BE+migrations+flags) · 24/7 zero-downtime (Docker Swarm) · instant rollback · single air-gap on-prem bundle · expand-contract migrations · feature-flag kill switch | designing/building the release pipeline · zero-downtime deploy/rollback · on-prem bundling |
| [`ports.md`](architecture/ports.md) | **Host-port registry for the whole system** (main 5173/8000 + ollama 11434 opt-in + plugin offsets) — single source of truth | **before creating a new app / changing / reserving a port** |
| [`versions.md`](architecture/versions.md) | **Version registry** — every app's version + UAT(plugin)↔Production(main) drift + pending promotions — single source of truth (rule: dev-rules §6.4–§6.5) | **before bumping a version / promoting a plugin into main** |

## features/ — one feature per file

| File | Owns | Status |
|---|---|---|
| [`room-3d.md`](features/room-3d.md) | Room 3D: Three.js scene + procedural avatars + life-sim (2 renderers / 1 data model · `guildos.rooms.v2`) — dev-rules §1.7 points here | ✅ live |
| [`compare.md`](features/compare.md) | Compare UAT vs Production (`/api/compare*` + Compare Content screen) — the one outbound feature | ✅ live |
| [`telegram-integration.md`](features/telegram-integration.md) | Telegram 2-way agent chat channel: link-to-user + RBAC (`chat.read`/`chat.use`, per-command) · command registry · webhook/polling · reuses `llm_connections` pattern | 🟡 design (backbone laid) |
| [`compare-hardening.md`](features/compare-hardening.md) | Compare/audit risks (SSRF P0 · authz/rate-limit P1 · robustness) + fix design — **read before exposing to real users** | 🟡 design done |
| [`checklist-audit.md`](features/checklist-audit.md) | Audit a site against a checklist: input adapters (CSV/IA/emmx/PDF) · Discovery §3.0 · matching · verification · IA output | 🟡 design done |
| [`sitemap-generate.md`](features/sitemap-generate.md) | Generate mode: URL → IA diagram (tree builder · module/component classifier · AI Local→API · export) | 🟡 design done (G1–G3) |
| [`checklist-templates/`](features/checklist-templates) | Template JSON converted from real customer files (TIPAK/SEAFCO/WD) | ⚠️ WD stuck at `verified:false` |

Relationships: compare → is the infra base for → checklist-audit → which generate shares Discovery+legend with.
dev-rules §2.6–2.7 point to this section.

## plugin/ — the PiKaOs-Plugin line (own Docker, own ports, build-first)

**Big new features are built as plugin apps first, then folded into main** (drop login; own DB +
Docker when stateful; built re-integration-ready). The line-wide contract + app index lives in
[`plugin/README.md`](plugin/README.md); the how-to (extraction + re-integration) is
[`pikaos-dev-rules.md` §6](pikaos-dev-rules.md). One subfolder per app.

| Folder | Owns | Status |
|---|---|---|
| [`plugin/compare/`](plugin/compare/README.md) | **Website Compare** (UAT vs Prod, ports 5174/8001, stateless): plugin deltas · status · **error taxonomy** · design choices/alternatives · merge-back. Engine = the in-PiKaOs feature [`features/compare.md`](features/compare.md) (not duplicated) | ✅ runs (v0.1) |
| [`plugin/redirectmap/`](plugin/redirectmap/README.md) | **URL Redirect Map** (old→new, ports 5175/8002, stateless): multi-old-site sitemap discover · verify (HTTP status **+ soft-error/body/file** content detection) · IIS `web.config` · `.xlsx` checklist — slated to fold into the main app | ✅ built · 🟡 to integrate |

Relationship: RedirectMap is the **second** plugin after Compare ([`features/compare.md`](features/compare.md)) and reuses its `net_guard`/sitemap/probe patterns; merge-back plan in [`plugin/redirectmap/integration.md`](plugin/redirectmap/integration.md).

## process/ — plans + handoff

| File | Owns | Read when |
|---|---|---|
| [`session-handoff.md`](process/session-handoff.md) | Latest work status + starting prompt for a new session — **update every time you finish meaningful work** | start/end of every session |
| [`playbook.md`](process/playbook.md) | Working patterns + approach: the one-pass loop · decision order · checking · commit/doc discipline · style | start of every session / unsure how to work |
| [`ai-runbooks.md`](process/ai-runbooks.md) | **Runbooks for recurring tasks** (R1 pause/resume · R2 new session/move machine · R3 remove lib/unused file · R4 audit deps/versions · R5 incident/rollback · R6 release/deploy/promote · R7 expose open plugin safely · R8 create/manage a skill) — trigger→steps→done | doing one of those recurring tasks |
| [`lessons.md`](process/lessons.md) | Experience + decision log: locked decisions · traps hit for real · known-but-unfixed risks | before touching something that may have been decided/missed before |
| [`improvement-plan.md`](process/improvement-plan.md) | Master plan phases A–F (hardening → engine → HERMES → data migration → RAG → prod) + acceptance criteria per phase | picking the next task / checking dependency order |

## templates/ — copy-to-create scaffolds

| File | Owns | Use when |
|---|---|---|
| [`templates/README.md`](templates/README.md) | index of templates + the rule (copy, fill `<…>`, delete guidance) | starting any new doc |
| [`templates/frontmatter.md`](templates/frontmatter.md) | the **YAML frontmatter standard** every doc starts with + field rules | every new `.md` (and to learn the schema) |
| [`templates/feature-doc.md`](templates/feature-doc.md) | skeleton for a new in-PiKaOs feature | new `features/<x>.md` |
| [`templates/plugin-app-docs.md`](templates/plugin-app-docs.md) | the 5-file doc set for a new plugin app | new `plugin/<app>/` |
| [`templates/unreleased-block.md`](templates/unreleased-block.md) | pending-promotion changelog block (UAT ahead of main) | when a plugin's version runs ahead (§6.5) |

## new-project/ — the scaffold kit (how this structure is created)

The portable prompts that generate **this** architecture — kept here so the conventions can be
regenerated or applied to another project. The `.md` prompts are the source of truth; the HTML is a
presentation snapshot (dev-rules §6 / no-invention rule apply).

| File | Owns | Use when |
|---|---|---|
| [`new-project/new-project-scaffold.md`](new-project/new-project-scaffold.md) | **Scaffolder** — bootstrap a new umbrella project from zero (router · frontmatter · registries · plugin lifecycle · runbooks · enforcement) | starting a brand-new project |
| [`new-project/knowledge-refactorer.md`](new-project/knowledge-refactorer.md) | **Refactorer** — bring an existing project's Markdown into this architecture, non-destructively | restructuring existing docs |
| [`new-project/principles.html`](new-project/principles.html) | **Visual overview** of the structure & workflows (mermaid) — for onboarding/presenting | explaining the structure to someone |

## Rules for this folder

- **Every `.md` starts with YAML frontmatter** per [`templates/frontmatter.md`](templates/frontmatter.md)
  (`title · type · status · keywords · related · summary · updated`) — it's what lets an agent rank
  relevance + walk the `related:` graph without reading bodies. Bump `updated` on every meaningful change.
- 1 file = 1 topic with a clear owner; a new topic big enough → new file in the matching
  category + update this index in the same commit.
- Docs link to real code with relative paths from the file itself (PiKaOs code = `../../PiKaOs-Core/Backend/...`)
  — fix the links when you change structure.
- **There is one CLAUDE.md for the whole system** at the umbrella root `PiKaOs-Projects/CLAUDE.md`
  (a thin router shared by all projects) + a tool-agnostic `PiKaOs-Projects/AGENTS.md` pointer + an
  `PiKaOs-Projects/llms.txt` LLM navigation map ([llmstxt.org](https://llmstxt.org/) format) beside it;
  there are **no per-repo CLAUDE.md stubs** (each repo keeps only `README.md` for GitHub). **Knowledge
  lives in `docs/` only** — README holds no knowledge, the router holds no detail.
- **Write docs in English** (AI-first, token-cheap); Thai only for content, never doc prose.
