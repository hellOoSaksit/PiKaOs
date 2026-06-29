---
title: Glossary — PiKaOs domain terms
type: glossary
status: active
keywords: [glossary, terms, definitions, vocabulary, UAT, HERMES, RAG, compare, redirectmap]
related: [./README.md, ./pikaos-dev-rules.md, ./architecture/system-design.md]
summary: >
  Central definitions for the non-obvious, load-bearing terms used across PiKaOs docs and code,
  so an AI agent resolves a term once here instead of re-inferring it from scattered usage.
updated: 2026-06-20
---

# GLOSSARY.md — PiKaOs domain terms

One line per term: what it means + the doc/code that owns it. Only **non-obvious, load-bearing** terms
(skip generic web/Python words). Link with `[term](#anchor)` or just use the word — this is the
single place its meaning is defined. Thai terms appear where the term *is* Thai in the product.

## Platform & lifecycle

- **PiKaOs (main)** — the umbrella platform: Vite+React `Frontend/` + FastAPI `Backend/`, run as 4 Docker
  stacks. The "Production" copy in the [UAT↔Production model](pikaos-dev-rules.md) (§6.4).
- **PiKaOs-Plugin** — a big feature shipped as its **own** Docker app (frontend+backend, +own DB if
  stateful), login dropped, port-offset to coexist. The "UAT" copy. Contract: [plugin/README.md](plugin/README.md).
- **Lifted** — engine code **copied** from main into a plugin (vs **net-new** = built plugin-first,
  no parent). Copies can drift → [§6.4](pikaos-dev-rules.md).
- **Promotion** — folding a plugin (UAT) into main (Production); **gated on explicit user approval**
  ([§6.5](pikaos-dev-rules.md)). Tracked in [versions.md](architecture/versions.md).
- **Merge-back / integration** — the same act, from the plugin doc's point of view (`integration.md`).
- **UAT ↔ Production** — once a feature exists in both plugin (UAT) and main (Production), they are two
  versioned copies; UAT may run ahead, never silently — [pikaos-dev-rules §6.4](pikaos-dev-rules.md) ·
  [versions.md](architecture/versions.md).

## Backend & infra

- **4-stack** — main runs as 4 independent compose projects: `pikaos-data` · `pikaos-backend` · `pikaos-ai`
  · `pikaos-frontend`, reaching each other over the host ([pikaos-dev-rules §3](pikaos-dev-rules.md)).
- **Layering** — `routers/` (HTTP) → `services/` (logic) → `repositories/` (all SQL); deps/security/redis/
  storage helpers ([§2.1](pikaos-dev-rules.md)). SQL only in `repositories/`.
- **RBAC / `require_perm`** — server-side role-based access control; a write route declares its permission
  via `Depends(require_perm("<perm>"))` ([§2.2](pikaos-dev-rules.md), [risk-mitigation](architecture/risk-mitigation.md)).
- **net_guard / SSRF guard** — rejects URLs resolving to private/loopback/reserved IPs on every outbound
  probe; reused by Compare + RedirectMap. SSRF = Server-Side Request Forgery.
- **arq** — the async Redis-backed task worker (the `pikaos-ai` tier): agent loop + RAG ingest. Talks to
  backend via Redis+Postgres, never HTTP.
- **alembic** — DB migration tool; schema changes go through `Backend/alembic/versions/` ([§2.3](pikaos-dev-rules.md)).
- **seed / idempotent** — `Backend/scripts/seed.py` inserts demo users, skipping ones that already exist
  (safe to re-run). Default login `somchai` / `pikaos123`.
- **jti / denylist / refresh rotation** — JWT id; revoked-token set in Redis; refresh tokens are single-use
  and rotate on `/refresh` ([§4](pikaos-dev-rules.md)).

## Frontend

- **Barrel** — a screen file kept as a thin re-export of focused modules in a sibling folder, so imports
  never change when a big screen is split ([§1.6](pikaos-dev-rules.md)).
- **Component-first** — reuse `components/ui/` → extend → create-new (last resort), never hand-roll
  select/modal/toast ([§1.1](pikaos-dev-rules.md)).
- **i18n pack** — `data/i18n/<lang>-<lexicon>.json`; screens call `t("ns.key")` only ([§1.2](pikaos-dev-rules.md)).
- **Room / life-sim / FURN** — the Three.js 3D room: two renderers, one data model (`guildos.rooms.v2`);
  `FURN` = furniture registry with `draw3d` ([room-3d.md](features/room-3d.md)).
- **Dashboards (Mana/Treasury/Chronicle/QuestLog/Watchtower)** — themed status screens; **Mana** = capacity/
  energy, **Treasury** = budget/cost, **Chronicle** = history/audit, **QuestLog** = tasks, **Watchtower** =
  monitoring ([§1.6](pikaos-dev-rules.md)).
- **Quest / Agent / Guild** — the game-metaphor names for task / AI-worker / org used across the UI.

## AI / knowledge (RAG)

- **HERMES** — the multi-agent orchestration layer that wraps complex queries (later phase; not tied to
  basic search) ([system-design.md](architecture/system-design.md)).
- **RAG** — Retrieval-Augmented Generation: retrieve doc chunks → ground the LLM answer in them.
- **pgvector** — Postgres extension storing embedding vectors; **decision-locked as a throwaway cache** —
  markdown is the truth ([knowledge-rag.md](architecture/knowledge-rag.md)).
- **bge-m3 / embedder / reindex** — the embedding model (1024-dim); `POST /api/knowledge/reindex` re-embeds
  existing docs after switching embedder ([knowledge-rag.md](architecture/knowledge-rag.md)).
- **codex / recall** — the knowledge-base UI screen / the hybrid retrieval+answer endpoint contract.

## Compare & RedirectMap (the two plugins)

- **Coverage mode** — Compare maps Production's `sitemap.xml` onto a UAT host to report URL coverage
  ([compare.md](features/compare.md)).
- **Deep mode** — Compare fetches full HTML and diffs body/title/meta/headings/images/links, block-by-block
  ([compare.md](features/compare.md)).
- **Symbol** — a stock ticker / project tag grouping a migration's URLs in RedirectMap (e.g. `WHA-ID`).
- **Many-old → one-new** — RedirectMap's core shape: several old sites consolidate onto one new site; 1
  mapping row = 1 `web.config` rewrite rule ([plugin/redirectmap/](plugin/redirectmap/README.md)).
- **Soft-error page** — a page returning 200 (or 404) whose **body** is actually an error/maintenance
  screen; detected by scanning the first ~800 chars ([redirectmap/errors.md](plugin/redirectmap/errors.md)).
- **Thin page** — has an `<h1>` but almost no body content (an incomplete-migration stub).
- **web.config** — the IIS URL-Rewrite XML RedirectMap generates for the 301s.
- **`_BLOCKED_CODES` (WAF codes)** — `401/403/405/406/429/503` treated as "loads in a browser", not
  "missing", because a WAF/CDN returns them to bots ([redirectmap/errors.md](plugin/redirectmap/errors.md)).

## Conventions

- **Registry** — a single-source-of-truth table the whole system reads before acting:
  [ports.md](architecture/ports.md) (host ports), [versions.md](architecture/versions.md) (versions).
- **No-hardcode** — system settings live in the **"จัดการเครื่องมือ"** tools screen + DB, not scattered
  literals ([CLAUDE.md always-on rule 2](../../CLAUDE.md)).
- **Progressive disclosure** — read only the doc your task needs; the router + indexes point you there.
