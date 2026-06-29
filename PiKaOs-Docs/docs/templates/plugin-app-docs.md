---
title: Template — plugin app doc set (5 files)
type: template
status: active
keywords: [template, plugin, scaffold, overview, errors, decisions, integration]
related: [./README.md, ../plugin/README.md, ../plugin/compare/README.md, ../pikaos-dev-rules.md]
summary: >
  The 5-file doc set every plugin app gets under plugin/<app>/. Copy each section into the
  named file. Mirrors compare/ and redirectmap/. Engine of a *lifted* app is NOT duplicated — link
  the parent features/<x>.md instead.
updated: 2026-06-20
---

# Plugin app doc set — copy each section into `plugin/<app>/<file>.md`

A new plugin → a subfolder `plugin/<app>/` with these 5 files (1 concept each), a row in
[plugin/README.md](../plugin/README.md), a port row in [ports.md](../architecture/ports.md),
and a version row in [versions.md](../architecture/versions.md) — all same commit. Each file starts
with [frontmatter](frontmatter.md).

---

## → `<app>/README.md` (index, read first)

```markdown
---
title: <App> — plugin docs (read this first)
type: index
status: built
keywords: [<app>, plugin, <feature terms>]
related: [../README.md, ../../pikaos-dev-rules.md, ./overview.md, ./integration.md]
summary: <One line: what the app is + that knowledge lives here, not the repo README.>
updated: <YYYY-MM-DD>
---

# <App> — plugin docs

<One paragraph: what it does. Stateless or stateful. No login (open).>
Ports **<5176>** / **<8003>** — registry [`../../architecture/ports.md`](../../architecture/ports.md).
Version **v0.1.0** — registry [`../../architecture/versions.md`](../../architecture/versions.md).
Code: [`PiKaOs-Plugin/<Repo>/`](../../../../PiKaOs-Plugin/<Repo>/). Contract: [`../README.md`](../README.md).
<!-- LIFTED app: add → "Engine is NOT documented here; see ../../features/<x>.md." -->

## File map
| File | Owns | Status |
|---|---|---|
| [`overview.md`](overview.md) | what it does · data shape · workflow · architecture-at-a-glance | |
| [`errors.md`](errors.md) | error taxonomy · operational traps · known issues | |
| [`decisions.md`](decisions.md) | design choices + rejected alternatives | |
| [`integration.md`](integration.md) | merge-back into main | |
```

## → `<app>/overview.md`
<!-- What it does · the data shape · the step-by-step workflow · architecture-at-a-glance
     (layering · endpoints · deps · ports · version). For a LIFTED app, link the parent engine doc
     instead of re-describing the engine. -->

## → `<app>/errors.md`
<!-- Error taxonomy: domain errors → HTTP status · result/verdict states · frontend mapping ·
     real operational traps (proxy timeout, WAF/rate-limit, SSRF) · known issues / dead code. -->

## → `<app>/decisions.md`
<!-- Table: Decision | Why | Rejected alternative. The non-obvious choices only. -->

## → `<app>/integration.md` (write as you build — §6.3)
<!-- Folding into main: 1) re-gate auth (Depends + require_perm) 2) re-attach shell/nav/RBAC/i18n
     3) settings → tools screen + DB (no-hardcode) 4) stateful → port migrations + update data-model.md
     5) dedupe shared engine + drop dead code 6) free ports + version on retirement.
     Link [pikaos-dev-rules §6](../../pikaos-dev-rules.md). -->
