---
title: Monorepo consolidation — one repo of folders (the revised Phase 5)
type: architecture
status: built
keywords: [monorepo, repo consolidation, single repo, folders, pikaos-app, composition root, git, remote, ci, phase 5, own-app]
related: [./plugin-architecture.md, ./extraction-plan.md, ./ports.md, ./versions.md, ../plugin/README.md]
summary: >
  Why PiKaOs is ONE git repo (PiKaOs-Core/, PiKaOs-Docs/, PiKaOs-App/ as folders) instead of the
  separate-repo split first planned, what was actually done in the consolidation, and the steps that
  remain (pick the monorepo remote, move CI to root .github/, then the internal core/↔plugins/ layout +
  PiKaOs-App composition root). Own-app plugins (Compare, RedirectMap) stay separate repos.
updated: 2026-06-29
---

# Monorepo consolidation (revised Phase 5)

> **History.** This file first proposed a *separate-repo* split (PiKaOs-Core / PiKaOs-App / PiKaOs-Plugin
> each its own git repo + cross-repo packaging). That was reversed on 2026-06-29 — see the decision below.
> Kept under the same `related:` graph so links don't break.

## The decision: one repo, not many

The new-project **kit (source of truth) is itself a single git repo** with `core/`, `app/`, `plugins/`
*folders* — the App relative-imports `../../core`; there are no per-plugin repos. And in PiKaOs the plugin
**isolation is already enforced by the CI gates** built in Phases 1–4 — `import-linter` (Core ↛ plugins,
plugin ↛ sibling), manifest schema, removal-isolation, the DI/Event-Bus contract — **none of which depend
on repo boundaries**. Separate git repos would have added real overhead (cross-repo packaging/entry-points,
multi-repo CI, version drift that `versions.md` exists to babysit) while adding **zero** isolation beyond
the gates. So D2 was revised: **`PiKaOs-Projects/` is one monorepo**; the projects are folders.

What stays separate: the **own-app** plugins under `PiKaOs-Plugin/` (Compare, RedirectMap) keep their own
git repos + remotes + deploy — they are shipped, independently-deployed apps. "own-app == in-main" still
holds: a plugin can run as its own Docker app from its folder without being its own git repo.

## What was done (2026-06-29)

- Removed the nested `.git` of `PiKaOs-Core`, `PiKaOs-Docs`, `PiKaOs-App`; un-ignored those folders in the
  umbrella `.gitignore` so their files are tracked here. Per-folder `.gitignore` files still apply
  (node_modules, `.env`, `__pycache__`, dist stay out). Secret scan at commit: only `*.example` env files
  staged, no real `.env`/keys.
- **History preserved**: bundled all three repos (`git bundle … --all`, verified restorable) as local
  backups, and their history still lives on the GitHub remotes (`PiKaOs`, `PiKaOs-docs`).
- Code is **byte-identical** — a pure git restructure; physical paths unchanged, so doc cross-links
  (`../../../PiKaOs-Core/Backend/…`) and the backend test suite are unaffected.
- Committed on branch `monorepo` (**not pushed** — the remote is the user's call).

## Remaining steps

1. **Pick the monorepo remote** (user decision) — reuse the `PiKaOs` GitHub repo (its root layout would
   gain `PiKaOs-Core/` nesting), or a fresh repo; archive the old `PiKaOs` / `PiKaOs-docs` remotes (history
   is also in the bundles). Then merge `monorepo` → `main` and push.
2. **Move CI to the root** — GitHub Actions only reads `/.github/workflows/`, so move
   `PiKaOs-Core/.github/workflows/ci.yml` + `PiKaOs-Docs/.github/workflows/docs-lint.yml` to the monorepo
   root `.github/workflows/` and prefix every path (`working-directory: PiKaOs-Core/Frontend`,
   `PiKaOs-Core/Backend/…`, `PiKaOs-Core/deploy/…`, `PiKaOs-Docs/scripts/…`). Left nested + inert until then.
3. **Internal layout** (separate from the git merge) — Phase 1b moves the backend Base into
   `PiKaOs-Core/Backend/app/core/`; the `PiKaOs-App/` composition root (one `main.py`+`worker.py` that
   assemble Core + enabled plugins) is built in-repo with simple relative imports — no packaging needed now
   that it's one repo.

## Rollback

Pre-merge state is umbrella branch `main` (untouched). To undo: `git checkout main`, restore each child's
`.git` from its bundle in the scratchpad `repo-backups/`, and re-add the `/PiKaOs-Core/` etc. ignores. The
GitHub remotes were not touched.
