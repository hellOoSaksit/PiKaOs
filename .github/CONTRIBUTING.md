# Contributing to PiKaOs

Thanks for helping improve PiKaOs. This repo follows the [new-project kit](https://github.com/hellOoSaksit/ai-project-scaffold)
conventions; the operating contract lives in `CLAUDE.md` (umbrella root) and
`PiKaOs-Docs/docs/pikaos-dev-rules.md`.

## Ground rules

- **Read the router first.** `CLAUDE.md` + the task router point you at the doc that owns your change.
- **Docs discipline.** Change code or structure → update the owning doc under `PiKaOs-Docs/docs/` and
  its index **in the same commit**. Every knowledge `.md` carries the frontmatter from
  `templates/frontmatter.md`; `scripts/docs-lint.py` enforces it in CI.
- **Registries first.** Touching a host port or a version → update `architecture/ports.md` /
  `versions.md` in the same commit.
- **Secure by default.** Before writing auth, a query, an upload, or fetch-URL code, open
  `PiKaOs-Docs/docs/architecture/security.md`. Never hardcode or commit a secret (only `*.example`).
- **Plugins.** Big features are built plugin-first (own manifest, `kind`, contract). Core stays
  datastore-free; a datastore is a `tool` plugin. See `architecture/plugin-architecture.md`.

## Workflow

1. Branch from `develop` (`feature/<name>`); PRs target `develop`. `main` is production-only,
   human-gated — never push it directly.
2. Keep changes small and reviewable; write for the next reader.
3. Green the gates locally before pushing: backend tests, frontend lint/build, and
   `python PiKaOs-Docs/scripts/docs-lint.py`.
4. Open a PR; CI (lint · test · docs-lint · plugin gates) must pass and a human reviews before merge.

## Running things

Ask before starting a stack — then use the start scripts / `docker compose up -d`, never a hidden
backgrounded dev server (dev-rules §0). Tests and compile checks don't need to ask.
