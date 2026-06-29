---
name: docs-check
description: >
  Validate the PiKaOs docs tree — run scripts/docs-lint.py to check that every doc has valid
  frontmatter and that all markdown links, heading anchors, and `related:` paths resolve. Use
  before committing doc changes, after editing/adding/moving any .md under PiKaOs-Docs/docs, or
  when asked to verify docs integrity / find broken links.
---

# docs-check — verify docs integrity

Run the validator and report the result.

## Steps
1. Run the linter:
   ```
   python PiKaOs-Docs/scripts/docs-lint.py
   ```
   (from the umbrella root `PiKaOs-Projects/`; use `python3`/`py` if `python` isn't on PATH).
2. If it exits non-zero, list each reported problem (broken link / anchor / `related:` / missing
   frontmatter field) with its file, and fix the offending doc — then re-run until it passes.
3. Report the summary line (doc count + "all valid", or the problems found).

## What it checks (so you can reason about a failure)
- **Frontmatter** — every `docs/**/*.md` starts with the 7-field block (`title · type · status ·
  keywords · related · summary · updated`); `type`/`status` from the allowed vocabulary
  ([templates/frontmatter.md](../../../PiKaOs-Docs/docs/templates/frontmatter.md)).
- **Links / anchors / related** — within-repo targets must exist; an `#anchor` must match a heading
  (GitHub slug). Cross-repo links (`../../PiKaOs-Core/…`) are checked only if the sibling is present.
- `templates/` bodies hold destination-relative skeleton links → skipped by design.

## Notes
- This is the same check the `docs-lint` CI workflow runs ([.github/workflows/docs-lint.yml](../../../PiKaOs-Docs/.github/workflows/docs-lint.yml)) — running it locally first keeps CI green.
- Pure read + validate; it edits nothing on its own. Fix findings with normal edits, then re-run.
