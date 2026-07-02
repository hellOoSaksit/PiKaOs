# Security Policy

## Scope

PiKaOs is a self-hostable agent-ops platform: a FastAPI backend, a Vite/React frontend, and a set of
plugins, deployed via Docker. The security surface therefore includes the application runtime, the
plugin loader, the CI/CD workflows under `.github/workflows/`, and the deployment configuration under
`PiKaOs-Core/deploy/`. The security baseline every change is held to is
[`architecture/security.md`](../PiKaOs-Docs/docs/architecture/security.md) (private docs repo).

## Supported versions

`main` is the only supported branch — fixes land there and flow to production via a tagged, human-gated
release (see the deployment architecture spec). There are no long-lived release branches.

## Reporting a vulnerability

Please report privately — do **not** open a public issue for a real vulnerability.

1. **Preferred:** open a [private security advisory](https://github.com/hellOoSaksit/PiKaOs/security/advisories/new) via GitHub.
2. Or email the maintainer (see the repo owner's profile).

Include what you found, where (file + line), and the impact / a reproduction. We aim to acknowledge
within **7 days** and to address confirmed issues on `main` as soon as practical. If you find a
credential committed, logged, or shipped in a frontend bundle, treat it as compromised and flag it — it
will be rotated.

## Supply-chain hygiene

- GitHub Actions are **pinned by full commit SHA** (not mutable tags).
- **Dependabot** watches the Actions, pip, npm, and Docker ecosystems.
- **OpenSSF Scorecard** runs in CI and publishes results to the Security tab.
- Secrets live only in gitignored env files behind a production boot-guard; only `*.example`
  templates are committed.
