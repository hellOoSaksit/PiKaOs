---
title: Template — Unreleased (pending promotion) changelog block
type: template
status: active
keywords: [template, changelog, unreleased, promotion, version, drift, UAT]
related: [./README.md, ../architecture/versions.md, ../pikaos-dev-rules.md]
summary: >
  Paste into a plugin app's README/overview doc when its UAT version runs ahead of the version
  promoted into main. Records exactly what the new version adds, so promotion is mechanical.
updated: 2026-06-20
---

# Unreleased block — pending promotion changelog

Paste the fenced block below into the plugin app's doc (under its header) **when UAT > Production**.
Update [versions.md](../architecture/versions.md) "Pending promotion" in the same commit. Clear the block
on promotion. The paths inside are written relative to the **destination** (`plugin/<app>/`), so they
resolve once pasted there.

```markdown
## Unreleased — pending promotion to main

> **UAT `v<new>`** ahead of **Production (main) `v<promoted>`**. Do **not** touch main until the user
> approves promotion ([pikaos-dev-rules §6.5](../../pikaos-dev-rules.md)). On approval: fold the items
> below into main + `features/<x>.md`, bump main in [versions.md](../../architecture/versions.md), delete
> this block.

### Added
- <new endpoint / screen / capability> — <1 line> (code: <link>)

### Changed
- <behaviour/schema change vs the version live in main> — <why>

### Fixed
- <fix not yet in main>

### Migration / promotion notes
- <schema migration to port into main's alembic chain> · <config tunable to move to the tools screen+DB>
  · <dead code to drop before it propagates back>
```
