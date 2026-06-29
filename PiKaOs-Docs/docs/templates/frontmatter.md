---
title: Frontmatter standard (every doc starts with this)
type: reference
status: active
keywords: [frontmatter, metadata, yaml, schema, type, status, related]
related: [./README.md, ../README.md]
summary: >
  The canonical YAML frontmatter block every doc under docs/ must start with, plus the allowed
  values per field — so an AI can rank relevance and traverse `related:` without reading bodies.
updated: 2026-06-20
---

# Frontmatter standard

Every `.md` under `docs/` **starts** with this block (the very first line is `---`). It is what lets an
agent judge relevance + walk the doc graph **without** opening each body.

```yaml
---
title: <Human/AI-readable title>
type: <rule | reference | architecture | feature | process | index | prompt | template | glossary>
status: <active | design | built | draft | deprecated>
keywords: [<5-10 lowercase search terms>]
related: [<./sibling.md>, <../other/doc.md>]   # relative paths, the docs an agent should read next
summary: >
  <1-3 lines: what this doc owns + when to read it. Written for the agent, not marketing.>
updated: <YYYY-MM-DD>   # the date of the last meaningful change (today, when you edit)
---
```

## Field rules

- **type** — pick the single best fit. `index` = a README that routes to others; `reference` = a lookup
  table / registry; `rule` = an operating contract; `architecture`/`feature`/`process` by folder.
- **status** — `design` = not built yet; `built` = code exists; `active` = current rule/reference;
  `deprecated` = kept for history, don't follow.
- **keywords** — the terms someone (or an agent) would grep for; lowercase, no duplicates of `title`.
- **related** — the **next docs to read**, as relative paths from this file. This is the doc graph —
  keep it accurate so traversal works.
- **summary** — the one thing the agent needs to decide "open this or not". Use `>` (folded scalar).
- **updated** — bump to the edit date on every meaningful change (pairs with the docs-discipline rule).

> Optional fields seen in older docs (`domain`, `service`) are fine to keep; the seven above are the
> required set. Indexes/registries still get frontmatter — they are docs too.
