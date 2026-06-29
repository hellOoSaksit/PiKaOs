---
title: Template — in-PiKaOs feature doc
type: template
status: active
keywords: [template, feature, scaffold]
related: [./README.md, ./frontmatter.md, ../features/compare.md]
summary: >
  Copy into features/<name>.md for a new in-PiKaOs feature. Mirrors the shape of the existing
  feature docs (compare.md, room-3d.md). Fill <placeholders>, delete guidance comments.
updated: 2026-06-20
---

<!-- COPY EVERYTHING BELOW THIS LINE into features/<name>.md, then fill <…> and delete <!-- … --> notes -->

---
title: <Feature name>
type: feature
status: <design | built | active>
keywords: [<terms>]
related: [../pikaos-dev-rules.md, <related feature/architecture docs>]
summary: >
  <What this feature is + when to read this doc.>
updated: <YYYY-MM-DD>
---

# <Feature name>

<!-- One paragraph: what it does, who/what triggers it, where it lives in the app. -->

## Surface

<!-- Backend endpoints (method + path + purpose) and the screen(s)/component(s) it adds.
     Link the real code: [routers/<x>.py](../../PiKaOs-Core/Backend/app/routers/<x>.py). -->

## How it works

<!-- The non-obvious mechanics only — the flow, the key decisions, the invariants that bite.
     Don't restate what the code plainly shows; document what an agent can't infer from it. -->

## Data / state

<!-- Tables touched (link data-model.md), localStorage keys, or "stateless — no DB". -->

## Risks / edge cases

<!-- SSRF, timeouts, rate-limits, auth, large payloads — and the mitigation. Link risk-mitigation.md
     or a hardening doc if one exists. -->

## Files

<!-- Bulleted map of the real code files (backend + frontend) with links. -->
