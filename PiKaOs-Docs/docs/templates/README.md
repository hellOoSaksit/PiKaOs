---
title: Doc templates (copy-to-create)
type: index
status: active
keywords: [templates, scaffold, frontmatter, feature, plugin, changelog]
related: [../README.md, ../pikaos-dev-rules.md, ./frontmatter.md]
summary: >
  Index of fill-in templates so a new doc starts deterministic and on-convention. Copy the
  matching template, fill the placeholders (<…>), delete the guidance comments.
updated: 2026-06-20
---

# templates/ — copy-to-create scaffolds

Start a new doc by copying the matching template, not from blank — keeps structure + frontmatter
uniform (AI-cheap to parse). Fill every `<placeholder>`, delete the `<!-- guidance -->` lines.

| Template | Use for | Lands in |
|---|---|---|
| [`frontmatter.md`](frontmatter.md) | the **YAML header every doc must start with** | top of any `.md` |
| [`feature-doc.md`](feature-doc.md) | a new in-PiKaOs feature | `features/<name>.md` |
| [`plugin-app-docs.md`](plugin-app-docs.md) | a new plugin app's **5-file doc set** | `plugin/<app>/` |
| [`unreleased-block.md`](unreleased-block.md) | the **pending-promotion changelog** when UAT runs ahead of main | the plugin's doc, under its header |

Rules: every new doc → add its row to the owning index ([../README.md](../README.md)) **same commit**;
docs are **English** (AI-first); 1 file = 1 concept.
