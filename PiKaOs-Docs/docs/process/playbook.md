---
title: Playbook — Workflow + conventions for this repo
type: process
status: active
keywords: [workflow, work loop, verify, docs discipline, conventions, commit, communication style, process]
related: [./session-handoff.md, ./lessons.md, ./improvement-plan.md, ../pikaos-dev-rules.md]
summary: >
  Owns the work loop for PiKaOs (read status, read rules, decide reuse-first, act, verify,
  update docs). Read at the start of a session to continue work without burning tokens.
updated: 2026-06-27
---

# Playbook — Workflow + conventions for this repo

> "How to work on PiKaOs the right way" — process, not content rules (rules live in [`../../../CLAUDE.md`](../../../CLAUDE.md)).
> Goal of this file: open a new chat and continue working immediately, without getting lost or burning tokens.

## 1. One work loop (do this every time)

1. **Read status** → [`session-handoff.md`](session-handoff.md) "Work status" section: what's done / what's pending.
2. **Read rules + routing** → [`../../../CLAUDE.md`](../../../CLAUDE.md) (especially the **Task router** at the top) →
   open only the .md that owns the topic the router points to. **Don't read all of docs/** — wastes tokens + gets you lost.
3. **Check lessons** → [`lessons.md`](lessons.md): was this ever decided/botched before? If so, follow it.
4. **Act** — fix in the module that owns the topic (not the barrel), cite real code, don't guess.
5. **Verify** → §3 below.
6. **Update docs in the same commit** → §4. If the work is significant: update `session-handoff.md` + (if there's a new lesson) `lessons.md`.

> **Don't loop (CLAUDE.md always-on rule 9).** A *dev loop* = repeating the same edit/retry/build when it
> **isn't fixing the problem**. After **~2 failed tries of the same approach, STOP** — don't repeat it:
> re-read the real error, form a *different* hypothesis, research it (rule 8 — verify on the web), or
> **ask the user**. Then record the **problem → root cause → fix** in [`lessons.md`](lessons.md) §E in the
> same commit, so it's never re-debugged from scratch.

## 2. Before writing code — decide in this order

- **Frontend component** → CLAUDE.md §1.1 decision order: reuse → extend → create new, every step. No hand-rolling.
- **Backend endpoint** → CLAUDE.md §2.1 layering + §2.2 recipe. SQL lives in `repositories/` only.
- **Large feature** → read the .md that owns the topic in [`../features/`](../features) to the end first (room-3d / compare / sitemap / audit).
- **Architecture/engine/schema** → read [`../architecture/`](../architecture) (risk-mitigation **before writing every line of the engine**).
- **Unsure whether the docs are enough** → say what's missing, **don't guess** (this project's golden rule).

## 3. Verify

- Frontend: compile check in the frontend stack — `docker compose -p pikaos-frontend -f deploy/docker-compose.frontend.dev.yml exec frontend npm run build`. **Don't** start the dev server yourself (CLAUDE.md §0 — `start.bat` only).
- Backend: `docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml exec backend pytest` (the backend stack must be running — CLAUDE.md §2.5).
- Need to run the real app → **ask first** ("want me to run it, or will you?"); if you run it use
  `start.bat` / `docker compose up -d` (stop with `stop.bat`) — never a hidden dev server ([§0](../pikaos-dev-rules.md)).

## 4. Docs discipline + commit

- **Change structure/behavior/dependency → update docs in the same commit** (CLAUDE.md always-on rule 5, Docs discipline). Stale docs are debt.
- 1 file = 1 topic with an owner; big enough topic → new file in the matching category + add a line in [`../README.md`](../README.md).
- CLAUDE.md ≤ 300 lines (hard rule §8): when it overflows → pull into a topic .md, leave a pointer.
- Docs cite code via relative links; after changing structure, chase down all links (0 broken).

## 5. Communication style + doc format

- Answer in Thai, concise, to the point, cut filler. Every proposal cites real code.
- Analysis docs use the format: **Current Understanding → Observation → Recommendation →
  Alternative Options → Pros / Cons → Impact**. Write prose, not bullets, unless necessary.
- Always offer alternatives with **pros/cons/impact** — don't commit to a single choice without naming alternatives.

## 6. Things to "not do" (short summary — details/reasons in [`lessons.md`](lessons.md))

- Don't run the dev server yourself · don't hand-roll a UI primitive · don't write SQL outside `repositories/` ·
  don't touch the room data model (`guildos.rooms.v2`) · don't add a dependency without checking the policy ([tech-stack §4](../architecture/tech-stack.md)) ·
  don't trust IA from a PDF/image without human review ·
  **don't loop** — don't repeat a failing fix more than ~twice (§1 guard) · **don't build from stale memory** —
  verify a lib/version/API is current + stable on the web first (CLAUDE.md rule 8).
