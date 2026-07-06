# Changelog

All notable changes to PiKaOs are recorded here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project aims to follow
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). Per-plugin versions and the UAT↔Production
drift live in `PiKaOs-Docs/docs/architecture/versions.md`; pending-promotion blocks use
`PiKaOs-Docs/docs/templates/unreleased-block.md`.

## [Unreleased]

### Added
- `architecture/security.md` — the OWASP-aligned secure-by-default baseline with PiKaOs's per-stack
  decisions, plus a "secure by default" always-on rule in the router (Fix-KIT-02).
- Community & supply-chain health files: `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`,
  `dependabot.yml` (actions/pip/npm/docker), and an OpenSSF `scorecard.yml` workflow (Fix-KIT-05).
- Baseline security-response headers on every API response; HSTS in production (Fix-SEC-03).

### Changed
- All GitHub Actions pinned by full commit SHA instead of mutable tags (Fix-KIT-06).
- `docs-lint.py` merged to one linter: the kit's strict checks (fenced-code stripping, unclosed
  frontmatter, same-file anchors) plus PiKaOs's cross-repo + template awareness; `superpowers/` (SDD
  artifacts) excluded (Fix-KIT-04 / Propose-KIT-01).
- Restored the umbrella-root `CLAUDE.md`/`AGENTS.md`/`llms.txt` symlinks so Claude auto-load works
  from any child folder (Fix-KIT-03).
- Repaired ~230 stale doc links left by the datastore/auth/plugin extractions; pointed them at the new
  plugin-repo paths or removed dead ones (Fix-KIT-01).
- Interactive API docs (`/docs`, `/redoc`, `/openapi.json`) disabled in production; `/api/health`
  detail requires auth in production (Fix-NET-03 / Fix-SEC-10).
- `CORS_ORIGINS='*'` is now rejected by the production boot-guard (Fix-SEC-06).
- Backend container runs as a non-root user; `ollama` image pinned; Frontend build uses `npm ci`
  (Fix-SEC-05 / Fix-DEP-01).

## [0.1.0]

### Added
- Initial PiKaOs platform: FastAPI backend, Vite/React frontend, zero-datastore kernel, and the
  plugin set (auth, ai, chat, knowledge, tools-postgres/redis/minio/telegram) with the strict
  Core+Plugins contract and CI gates.
