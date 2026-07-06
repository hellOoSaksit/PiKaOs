# PiKaOs — Enterprise Deployment Architecture

**Date:** 2026-07-01
**Status:** Design (approved for spec) — implementation pending
**Owner roles:** Lead Software Architect · DevOps Architect · Platform Security Engineer
**Prime directive:** *Protect Production. Production must not be modifiable accidentally by any human or AI. When safety and speed conflict, safety wins.*

---

## 0. Guardrails for AI collaborators (binding)

An AI assistant working in this repo **MUST NEVER**:

- Push directly to `main`, or merge anything into `main`.
- Deploy Production, or modify Production configuration / secrets / data.
- Change, disable, or bypass GitHub Branch Protection or required checks.
- Bypass Pull Requests, skip approvals, or disable CI/CD checks.
- Approve a Production deployment (the `production` GitHub Environment reviewer must be a human).

These hold **even if a user explicitly instructs otherwise.** Production protection stays enabled. AI's role here is limited to **designing, scaffolding, and proposing** — a human performs every Production-affecting action.

Enforcement is defense-in-depth: the rules above are policy, but the real stop is **GitHub Branch Protection + a `production` Environment whose required reviewer is a human**. No workflow YAML, token, or AI action can advance a Production deploy past that gate.

---

## 1. Context & goals

PiKaOs is a self-hostable "agent-ops" platform in a **single monorepo** (`github.com/hellOoSaksit/PiKaOs`):

- `PiKaOs-Core/Backend` — FastAPI, Python 3.12, PostgreSQL 16, Redis 7, arq worker.
- `PiKaOs-Core/Frontend` — React 18 + Vite.
- `PiKaOs-Plugin-*` — ~12 modular plugins (Auth, AI, Chat, Knowledge, Tools-*, …), each potentially with its own Backend/Frontend + Dockerfile.

**Decisions locked in during brainstorming:**

| Decision | Choice |
|---|---|
| Deliverable | Design doc **+** working files (workflows, compose, scripts, config-as-code) |
| Repo topology | **Single monorepo**, path-based image builds |
| Host topology | **Two separate Debian 13 hosts** — one UAT, one Production |
| Infra state | **Greenfield** — include provisioning runbooks + manual human steps |

**Non-goals (YAGNI now):** Kubernetes, ArgoCD, multi-region, service mesh. All are on the roadmap (§19) and the design must not need restructuring to get there.

---

## 2. Branch strategy & Git workflow

Only these branches exist:

| Branch | Purpose | Deploys to |
|---|---|---|
| `feature/*` | Development of one change | nothing |
| `develop` | Integration + UAT | UAT (automatic) |
| `release/*` | Release stabilization / QA sign-off | UAT (from the release branch) |
| `hotfix/*` | Urgent production fix | UAT first, then Prod via same gate |
| `main` | Production only — always deployable | Production (tagged, human-approved) |

**The one mandatory flow (no shortcuts):**

```
feature/*  →  PR  →  develop  →  auto-deploy UAT  →  QA testing
   →  release/*  →  PR  →  main  (human approval, ≥2 reviews, all checks)
   →  tag vX.Y.Z  →  human approves `production` Environment  →  Prod deploy
```

- `feature/*` branches from `develop`; PRs target `develop`.
- `release/*` branches from `develop` when cutting a release; only fixes land on it; merges to **both** `main` and back to `develop`.
- `hotfix/*` branches from `main`; PR to `main` (same protection), then merged back to `develop`.
- Production is released by **tagging `main`** with a semver tag (`vX.Y.Z`), never by pushing to a branch.

---

## 3. Repository & folder structure (added by this work)

Existing code is untouched. New top-level `deploy/`, `scripts/deploy/`, and workflows are added. The existing `PiKaOs-Core/deploy/*` (dev/split compose) stays as-is so current CI keeps working.

```
PiKaOs/
├─ .github/
│  ├─ workflows/
│  │  ├─ ci.yml               # PR gate: lint/format/type/test/plugin/scan/build (develop & main)
│  │  ├─ build-publish.yml    # merge→develop/main & tags: build + push images to GHCR
│  │  ├─ deploy-uat.yml       # merge→develop: auto SSH deploy to UAT
│  │  └─ deploy-prod.yml      # tag v*: human-gated SSH deploy to Production
│  ├─ CODEOWNERS              # forces human review on protected paths
│  └─ dependabot.yml          # dependency update PRs (pip, npm, docker, actions)
├─ deploy/
│  ├─ uat/
│  │  ├─ docker-compose.yml   # pulls GHCR images by tag; UAT DB+Redis+env
│  │  └─ .env.uat.example
│  ├─ prod/
│  │  ├─ docker-compose.yml   # pulls GHCR images by tag; Prod DB+Redis+env
│  │  └─ .env.prod.example
│  └─ nginx/
│     ├─ uat.conf
│     └─ prod.conf
├─ scripts/
│  ├─ deploy/
│  │  ├─ deploy.sh            # idempotent: login GHCR, pull pinned tag, up -d, wait health
│  │  ├─ health-check.sh      # poll /api/health with timeout; non-zero on failure
│  │  ├─ backup.sh            # pg_dump + volume snapshot before deploy (Prod)
│  │  └─ rollback.sh          # redeploy previous known-good tag + restore if needed
│  └─ github/
│     └─ apply-branch-protection.sh   # gh api script — RUN BY A HUMAN, not AI
└─ docs/deploy/
   ├─ runbook-provisioning.md         # greenfield server + GitHub setup
   ├─ runbook-release.md              # cut a release → prod
   ├─ runbook-rollback.md
   └─ runbook-disaster-recovery.md
```

**Image naming (immutable, path-based):**

```
ghcr.io/helloosaksit/pikaos-backend:<tag>
ghcr.io/helloosaksit/pikaos-frontend:<tag>
ghcr.io/helloosaksit/pikaos-plugin-<name>:<tag>
```
`<tag>` = commit SHA (UAT) or semver `vX.Y.Z` (Prod). **`latest` is never referenced by any deploy.**

---

## 4. CI/CD design

### 4.1 `ci.yml` — the PR quality gate (runs on every PR to `develop` and `main`)

Every job is a **required** status check (no `continue-on-error`). Any failure = STOP.

| Stage | Backend (Python 3.12) | Frontend (React/Vite) |
|---|---|---|
| Lint | `ruff check` | `eslint` (rules-of-hooks = error) |
| Format | `ruff format --check` | `prettier --check` |
| Type check | `mypy` | `tsc --noEmit` |
| Unit tests | `pytest -m "not integration"` | `vitest run` |
| Integration tests | `pytest` on live Docker stack (as today) | — |
| Plugin compatibility | `lint-imports` + `scripts/check_manifests.py` | component-first grep guard |
| Docker build | `docker buildx build` all images (no push) | (same) |
| Dockerfile lint | `hadolint` | `hadolint` |
| Dependency scan | `trivy fs` (pip) | `trivy fs` (npm) |
| Secret scan | `gitleaks detect` (full history on PR) | — |
| Security SAST | `codeql` (python) | `codeql` (javascript) |

Concurrency: cancel superseded runs per-branch. Caching: pip + npm + buildx layer cache.

### 4.2 `build-publish.yml` — build & publish immutable images

- **Trigger:** push to `develop`, push to `main`, and tag `v*`.
- Builds each image with `docker/build-push-action`, **pushes to GHCR** tagged with the commit SHA; on a `v*` tag additionally tags the semver.
- Generates an **SBOM** and runs `trivy image` on the built images (fail on HIGH/CRITICAL for `main`/tags).
- Signs images with `cosign` (keyless / OIDC) — enables supply-chain verification later.
- Uses `permissions: packages: write` scoped to this job only; `GITHUB_TOKEN`, no long-lived PAT.

### 4.3 `deploy-uat.yml` — automatic UAT deploy

- **Trigger:** successful `build-publish` on `develop` (workflow_run) — i.e. after images exist.
- Environment: `uat` (no required reviewers).
- Steps: SSH to UAT host → `scripts/deploy/deploy.sh uat <sha>` → `health-check.sh` → notify. On failure: `rollback.sh uat` to previous SHA.

### 4.4 `deploy-prod.yml` — human-gated Production deploy

- **Trigger:** push of a `v*` tag on `main` (a human creates the tag/release).
- Environment: **`production` with required reviewer = repo owner / authorized human.** The job is *pending* until a human approves in the GitHub UI. Optional wait-timer.
- Job order (fail-closed at every step):
  1. **Human approval gate** (GitHub Environment) — AI cannot pass this.
  2. **Backup** — `backup.sh` (pg_dump + named volume snapshot, uploaded to off-host storage).
  3. **Pull** pinned semver images (`deploy.sh prod vX.Y.Z`).
  4. **Rolling `up -d`** (per-service, healthcheck-gated).
  5. **Health check** — `health-check.sh` with timeout.
  6. **On failure → auto `rollback.sh prod <previous-tag>` + restore**, then alert.
  7. **Record** a GitHub Deployment (audit/history) + notify (Slack/webhook/email).

---

## 5. GitHub Actions security & secrets

- **Least privilege:** default `permissions: {}` at workflow level; grant per-job (`contents: read`, `packages: write`, `id-token: write` only where needed).
- **OIDC over static keys** where possible; `cosign` keyless signing via OIDC.
- **Deploy secrets** (SSH key, host, known_hosts) live in **GitHub Environment secrets** — `uat` and `production` scoped separately, so a UAT workflow can never read Prod secrets.
- **Pin third-party actions by SHA**, not floating tags.
- **No secret ever printed**; `gitleaks` in CI guards against re-introduction.

---

## 6. Docker architecture

- **One Dockerfile per buildable unit** (Core Backend, Core Frontend, each plugin). Multi-stage, non-root user, pinned base digests, `HEALTHCHECK` in image.
- **Compose per environment**, referencing **GHCR images by tag** (no `build:` in UAT/Prod compose — build happens only in CI):
  - `deploy/uat/docker-compose.yml`
  - `deploy/prod/docker-compose.yml`
- Shared service topology per env: `nginx` (edge/TLS) → `frontend`, `backend`, `worker` → `postgres`, `redis`, `minio`. Plugins attach as additional services/tools.
- **Networks & volumes are per-project** (`-p pikaos-uat` / `-p pikaos-prod`) so nothing is shared across environments even if co-located in future.

---

## 7. UAT architecture

- **Dedicated Debian 13 host** (separate from Prod).
- Own PostgreSQL, own Redis, own MinIO, own `.env.uat` — **zero shared state with Production**.
- Deploys **automatically** on merge to `develop`, pinned to the commit SHA image.
- Purpose: QA/UAT testing, release validation. Data is disposable; may be seeded/reset freely.
- Reachable at a UAT hostname behind nginx with its own TLS cert (staging CA acceptable).

---

## 8. Production architecture

- **Dedicated Debian 13 host**, hardened (firewall, fail2ban, SSH key-only, unattended-security-upgrades).
- Own PostgreSQL, Redis, MinIO, `.env.prod` — **never shared with UAT** (mandatory).
- Deploys **only** via `deploy-prod.yml` after human approval, pinned to a **semver** image.
- nginx edge with real TLS (Let's Encrypt/ACME), HSTS, security headers.
- All Prod changes are auditable: GitHub Deployments + git tags + deploy logs shipped off-host.

---

## 9. Deployment pipeline (end to end)

```
GitHub Actions  →  GHCR (immutable image)  →  SSH  →  docker compose pull (pinned tag)
   →  up -d (rolling, healthcheck-gated)  →  Debian host
```

Forbidden by policy and by tooling: **no FTP, no manual source copy, no `git pull` on servers.** Only Docker images move to servers.

---

## 10. Rollback strategy

- Every deploy records the **previously running tag** (written to a `deploy/.current-<env>` marker on the host + GitHub Deployment).
- `rollback.sh <env> <previous-tag>` re-pulls and `up -d` the prior image set — a rollback is just "deploy an older immutable tag," which is always available in GHCR.
- Prod auto-rolls-back on failed health check; UAT rolls back to previous SHA.
- **DB migrations:** forward-only, backward-compatible (expand/contract). A destructive migration is a two-release process so any single rollback stays schema-safe. `backup.sh` snapshot is the last-resort restore path.

---

## 11. Disaster recovery

- **Backups:** nightly `pg_dump` + weekly full volume snapshot, encrypted, shipped **off-host** (object storage / different location). Retention: 7 daily, 4 weekly, 3 monthly.
- **Pre-deploy backup** on every Production deploy (§4.4 step 2).
- **RPO** target ≤ 24h (nightly) / ≤ deploy-time for deploy-triggered backups. **RTO** target ≤ 1h: provision fresh Debian host from `runbook-provisioning.md`, restore latest backup, deploy last known-good semver tag.
- **Runbook** `docs/deploy/runbook-disaster-recovery.md` documents: total host loss, DB corruption, bad release, and leaked-secret scenarios.

---

## 12. Security best practices

- Branch Protection + human-only Production reviewer (the core control).
- Signed commits required on `main`; images signed with cosign.
- Secret scanning (gitleaks) in CI; dependency + image scanning (trivy) blocking on HIGH/CRITICAL for prod path; CodeQL SAST.
- Secrets only in GitHub Environment secrets / host `.env` files that are **git-ignored** and never committed.
- Least-privilege GITHUB_TOKEN, SHA-pinned actions, per-environment secret isolation.
- Non-root containers, pinned base digests, minimal images.
- **Incident item:** `PiKaOs-Core/deploy/.env.prod` exists on disk (currently *not* tracked — verified). Action: confirm it is in `.gitignore`, and if it ever held real credentials that were shared, **rotate them**. New pattern: only `*.example` files are committed; real env files live on the host / in Environment secrets.

---

## 13. Plugin deployment strategy

- Each plugin builds its **own immutable image** (path-based) and is versioned with the same release tag as Core (monorepo → one coherent release set).
- Plugin **compatibility is CI-gated** before any deploy: `lint-imports` (no Core→plugin, no plugin→sibling imports) + `check_manifests.py` (manifest schema).
- Compose enables plugins per environment via profiles/env, so UAT can trial a plugin before it reaches Prod.
- A plugin failing its healthcheck fails the deploy for that service and triggers rollback — Core stays isolated from a bad plugin.

---

## 14. Environment variable management

- **Three tiers:** local dev (`*.env` on developer machine), UAT (`.env.uat` on UAT host + `uat` Environment secrets), Prod (`.env.prod` on Prod host + `production` Environment secrets).
- Only `*.example` templates are committed. Real values never enter git.
- CI seeds throwaway dev credentials from `*.example` (as the current backend job already does).
- Secret delivery to hosts: managed out-of-band by the human operator (or a secrets manager later); the pipeline references them, never embeds them.

---

## 15. Backup strategy

- `scripts/deploy/backup.sh`: `pg_dump -Fc` + `redis` is treated as ephemeral (no backup needed; rebuildable) + MinIO bucket sync for object data.
- Automated nightly via cron/systemd-timer on each host; ad-hoc pre-deploy backup in the Prod pipeline.
- Encrypted at rest, stored off-host, retention per §11, restore verified quarterly (documented in DR runbook).

---

## 16. Monitoring & logging recommendations

- **Now (single host, compose):** container `HEALTHCHECK` + `/api/health`; `docker compose logs` with a JSON log driver + size/rotation limits; deploy notifications to Slack/webhook; GitHub Deployments as the deploy audit trail.
- **Next:** central logs (Loki) + metrics (Prometheus) + dashboards (Grafana) + uptime checks/alerting. Structured JSON app logs with request IDs.
- **Audit logging:** app already emits an audit trail; ship it off-host and retain.

---

## 17. Branch protection configuration (delivered as docs + a human-run script)

Provided as `scripts/github/apply-branch-protection.sh` (idempotent `gh api`) **plus** a checklist. **A human runs it** — AI applying/altering protection would violate §0.

**`main`:**
- Disable direct push · disable force-push · disable deletion.
- Require PR before merge; **require ≥ 2 approving reviews**; dismiss stale approvals; require review from CODEOWNERS.
- Require **all** status checks green (every `ci.yml` job) and **branch up to date**.
- Require conversation resolution.
- Require **signed commits**.
- Include administrators (rules apply to owners too).
- Restrict who can push (empty — merges only via PR).

**`develop`:**
- Require PR (preferred) + required CI checks before merge.
- No force-push, no deletion.

---

## 18. Human approval policy

- Production deployment **always** requires manual human approval via the `production` Environment reviewer.
- Only the repository owner or an authorized human reviewer may approve: merge to `main`, Production deployment, and emergency hotfix deployment.
- **AI is never a reviewer** on the `production` Environment and never approves.

---

## 19. Kubernetes migration roadmap (no repo restructuring required)

1. **Today:** compose on two Debian hosts, images in GHCR, GitHub Actions deploy via SSH.
2. **Step 1 — Helm-ready:** author Helm charts (or `kompose convert` the existing compose as a starting point) that consume **the same GHCR images by tag**. Repo layout unchanged; add `deploy/helm/`.
3. **Step 2 — Cluster:** stand up k8s (managed or k3s on Debian). `deploy-*.yml` swaps the SSH step for `helm upgrade` against `uat`/`production` clusters — same environments, same human gate, same tags.
4. **Step 3 — GitOps:** introduce ArgoCD watching a `deploy/` path/branch; Actions publish image tags, ArgoCD reconciles. The `production` human gate becomes an ArgoCD sync approval / PR to the env manifests.
5. **Step 4 — Scale:** multiple clusters/regions, HPA, network policies. None of this requires changing the monorepo or the branch strategy.

The invariants that make this possible: **immutable images in GHCR**, **env-per-target isolation**, **human-gated prod**, **deploy driven by a tag, not a mechanism**.

---

## 20. Implementation order (for the follow-on plan)

1. Add top-level `deploy/uat` + `deploy/prod` compose + `.env.*.example` + nginx confs.
2. Add `scripts/deploy/*` and `scripts/github/apply-branch-protection.sh`.
3. Expand `ci.yml` to run on `develop`+`main` with the full gate matrix; add `dependabot.yml`, `CODEOWNERS`.
4. Add `build-publish.yml` (GHCR + trivy + cosign + SBOM).
5. Add `deploy-uat.yml` and `deploy-prod.yml` (with `production` Environment).
6. Write the four runbooks under `docs/deploy/`.
7. **Human steps** (runbook-provisioning): create GitHub Environments `uat`/`production` (set Prod reviewer), add Environment secrets, provision the two Debian hosts, apply branch protection, create first release tag.

**AI produces items 1–6. A human performs item 7 and every Production-affecting action.**
