---
title: Release & Rollback — zero-downtime SaaS + single-bundle on-prem (design)
type: architecture
status: active
keywords: [release, rollback, zero-downtime, deploy, docker swarm, blue-green, expand-contract, migrations, feature flags, single bundle, air-gap, saas, on-prem, versioning]
related: [./deploy.md, ./versions.md, ./tech-stack.md, ./modularity.md, ../process/ai-runbooks.md, ./data-model.md]
summary: >
  Design for the PiKaOs update system: ship FE+BE+libs+features as ONE versioned release that
  deploys 24/7 zero-downtime and rolls back to the previous version instantly — on hosted SaaS
  AND as a single self-installable on-prem bundle (air-gap capable). Engine = Docker Swarm.
  Status: design done; rollout step 1 (health/version + HEALTHCHECKs) built — rest not yet implemented.
updated: 2026-06-27
---

# Release & Rollback — zero-downtime SaaS + single-bundle on-prem

> **Status: design done; rollout step 1 built (2026-06-27).** The blueprint for taking PiKaOs to SaaS while staying
> installable on a customer's server. Builds on [deploy.md](deploy.md) (the 4-stack topology),
> [versions.md](versions.md) (the version registry), and [modularity.md](modularity.md) (per-department
> install). Engine choice **Docker Swarm** (decided 2026-06-27; alternatives Kamal 2 / k3s recorded
> in §10). Research-backed (2026-06-27); every tool below was license/maintenance-verified.

---

## 0. Goals + the one invariant

**Goals.** A single update mechanism that: (1) ships **frontend + backend + libraries + features**
together; (2) deploys **24/7 zero-downtime** (the service never drops); (3) **rolls back to the
previous version instantly**, ready at all times; (4) packs as **one self-contained bundle**
installable on a server, **air-gap capable** (data + install + rollback travel together) — not locked
to a cloud PaaS; (5) low ops for a small team (prefer mature tools over hand-rolled ops).

**The one invariant everything obeys:**

> **One release = one version of FE + BE + migrations + flags, moved as a unit. The app rolls
> *back* instantly; the database schema only rolls *forward*.** Because a rollback can drop the app to
> version N-1 at any moment, the live schema must satisfy **both N and N-1** at every instant — so a
> deploy never makes a destructive schema change in the same release that needs it. Roll the app back;
> forward-fix the schema; restore a backup only for true data loss.

Everything below is a consequence of that invariant.

---

## 1. The release artifact — one versioned, signed, air-gap bundle

A release `vX.Y.Z` is an **immutable, content-addressed bundle**:

```
pikaos-vX.Y.Z/
├── stack/                      # digest-pinned Swarm stack files (data/backend/ai/frontend)
│   └── *.yml                   # images referenced as repo@sha256:… — NOT mutable tags
├── images-vX.Y.Z.tar.gz        # docker save of every image in the release (air-gap payload)
├── cosign/                     # cosign signatures + trusted-root (verifies OFFLINE)
├── install.sh  upgrade.sh  rollback.sh
└── RELEASE.md                  # version, changelog, the exact prev version it rolls back to
```

- **Pin every image by digest** (`repo/img@sha256:…`), never a moving tag — immutable + fails fast
  in air-gap. Digest-bump PRs driven by **Renovate** (parses compose; feeds [versions.md](versions.md)).
- **Sign** images + manifest with **cosign** (Apache-2.0) — key-based, verifies offline with the
  bundled trusted-root, so an on-prem box can prove authenticity with no internet.
- **Embed a tiny registry — Zot** (Apache-2.0, single binary) — in the bundle. On install all stacks
  pull from `localhost` Zot by digest; this is what makes **instant any-version rollback work offline**
  (the prev image is already in the local registry, nothing to re-fetch).
- **Keep the last N releases on disk** (prev images loaded + prev digest-pinned manifest). Rollback =
  point back at the prior manifest and re-up. N≥2 (N-1 and N-2).

> **Hosted SaaS and on-prem use the *same* artifact.** Hosted = the bundle deployed to our Swarm;
> on-prem = the bundle shipped to the customer's Swarm. No second codepath. This is the
> [modularity.md](modularity.md) "per-department local install" promise made real.

---

## 2. Deploy engine — Docker Swarm

Chosen for the lowest skill-jump from the current Compose setup while giving native zero-downtime +
rollback + the best air-gap story (§10 records why not Kamal/k3s/PaaS).

**Zero-downtime rolling update** (per stateless service — backend, worker, frontend-nginx):

```yaml
deploy:
  replicas: 2                       # never dips below 1 healthy during update
  update_config:
    order: start-first              # new task healthy BEFORE old task stops → no gap
    parallelism: 1
    delay: 10s
    monitor: 30s                    # watch health after each task
    failure_action: rollback        # auto-revert if the new task fails its healthcheck
  rollback_config:
    order: start-first
    parallelism: 1
  restart_policy: { condition: any }
```

- **HEALTHCHECK on every image is the prerequisite — DONE (2026-06-27).** Probe **liveness, not deep
  readiness**: backend hits **`GET /api/version`** (no dependency I/O — a blipping Redis/MinIO must not
  fail the probe and trigger a needless auto-rollback; the deep `GET /api/health` stays for dashboards),
  the worker (same image, no HTTP server) uses **`arq … --check`** overridden in its compose/stack
  service, frontend-nginx serves `/` (`index.html`). Built into the Dockerfiles + worker compose; reused
  by every layer. The prod boot guard (`config.production_violations`) already gates a bad-config start.
- **Instant rollback (online):** `docker service update --rollback <svc>` (Swarm keeps the
  `PreviousSpec`), or the auto-revert above. **Caveat: Swarm keeps 1 level deep** — for deeper history,
  re-up the prior bundle manifest (§6). Test the failure path (known historical edge cases).
- **Stateful services (Postgres+pgvector · Redis · MinIO) are NOT rolled like stateless ones** —
  pin them to nodes with placement constraints + named volumes; their "update" is the migration flow
  (§3), not a rolling image swap.
- **Keep the 4-network separation** from [deploy.md](deploy.md) — Swarm overlay networks map 1:1 to
  today's per-stack bridge networks (data/backend/ai/frontend).

**Migration path from the current 4-stack compose** (incremental, no big-bang — see §9):
add HEALTHCHECKs → `docker swarm init` → translate each compose stack to a Swarm stack file (add the
`deploy:` keys above) → wire the bundle build into CI → deploy = `docker stack deploy`, rollback =
`docker service update --rollback`.

---

## 3. Zero-downtime database migrations (the heart of safe rollback)

The schema is a **forward-only artifact that must satisfy app N and N-1 simultaneously**. Rules
(enforced in CI, see below):

1. **Expand–contract, always.** Never rename/drop/retype in place. Split across releases:
   **expand** (additive, backward-compatible) → **backfill + dual-write** → **switch reads** →
   **contract** (drop old) — and *contract ships in a later release than expand, never the same one*.
2. **Schema before code, schema backward-compatible.** Run the migration first; schema N must support
   app N-1. App rollout is a separate step.
3. **Roll forward, never destructive-down on prod.** Rollback = redeploy the previous app artifact,
   leave schema at head, forward-fix with a *new* migration. `downgrade()` is for local dev only.
4. **Never edit/delete an applied migration** — correct with a new forward migration.
5. **Postgres guardrails on every DDL migration:** short `lock_timeout` (+ retry) — the real outage is
   the *lock queue*, not the DDL; `CREATE INDEX CONCURRENTLY` inside an Alembic `autocommit_block()`;
   constraints `... NOT VALID` then `VALIDATE CONSTRAINT`; big backfills in **PK-range batches**, one
   txn each, idempotent + throttled — never one giant `UPDATE`.
6. **Reversible where cheap** (pure additive gets a real `down()`); destructive/data ops get a `down()`
   that is a **documented no-op** — recovery is backup + forward-fix.
7. **Seeds are separate + idempotent** (`INSERT … ON CONFLICT DO NOTHING`); sample data env-gated to non-prod.
8. **pgvector:** `CREATE EXTENSION IF NOT EXISTS vector` already lives early (migration 0005); keep it
   before any `vector` column.

**Per-change cheat sheet** (safe in place? → how):

| Change | In-place? | Do |
|---|---|---|
| Add nullable / constant-default column | ✅ | 1 migration (PG 11+ stores the default in catalog — no rewrite) |
| Add NOT NULL column | ❌ | nullable → backfill → `CHECK … NOT VALID` → `VALIDATE` → `SET NOT NULL` → drop check |
| Add column w/ volatile/generated default | ❌ rewrites table | add plain nullable + backfill in batches |
| Rename column/table | ❌ | ≥3 releases: add new → dual-write → backfill → switch reads → drop later |
| Drop column/table | ❌ | 3 releases: app stops referencing → drop (post-deploy) → remove the ignore |
| Incompatible type change | ❌ | treat as rename (new col + dual-write + backfill + switch + drop) |
| Add CHECK/FK | ⚠️ | `… NOT VALID` → later `VALIDATE` |
| Add UNIQUE | ⚠️ | `CREATE INDEX CONCURRENTLY` unique → `ADD CONSTRAINT … USING INDEX` |
| Add index | ✅ | `op.create_index(postgresql_concurrently=True)` in `autocommit_block()` |

**Single migration runner** (never racing replicas): a one-shot entrypoint / Swarm job runs
`alembic upgrade head` then the app starts; guard with a **pg advisory lock over a direct, non-pooled
connection** (advisory locks break under PgBouncer transaction pooling). **Pre-upgrade auto-backup:**
`pg_dump -Fc` snapshot **before** every upgrade (the real recovery path for irreversible changes —
`pg_dump` is a snapshot, not PITR; layer `pg_basebackup`+WAL archiving if PITR is needed). Pin PG 16
in the bundle (crossing majors needs an explicit `pg_upgrade` step).

**CI tooling (adopt):** **squawk** (MIT/Apache-2.0 — lints migrations for the unsafe ops above; run on
`alembic upgrade <from>:<to> --sql`), **pytest-alembic** (MIT — up/down/round-trip tests),
**alembic-postgresql-enum** (MIT — fills the ENUM autogenerate gap). Consider **Atlas** lint-only later.

---

## 4. Frontend — atomic swap, no skew

- **Atomic deploy + instant rollback:** ship the FE as a **versioned nginx image** (multi-stage:
  `vite build` → `nginx:alpine` + `dist/` + the cache conf). Deploy = Swarm rolls the frontend service
  to the new image tag; **rollback = repoint to the prev image tag** (already loaded). (For a non-image
  variant: versioned `releases/` dirs on a volume + atomic `mv -T` symlink flip; same idea.)
- **Cache rules (baked into the nginx conf):** content-hashed assets (`app.<hash>.js`, Vite default)
  → `Cache-Control: public, max-age=31536000, immutable`; **`index.html` → `no-cache`** (the only
  mutable entrypoint). Immutable hashed assets let N and N-1 coexist on disk, so a tab loaded mid-deploy
  keeps working — another reason to keep N-1 around.
- **Version-skew policy** (old SPA in a tab hits a newer/older API):
  1. **Additive-only / expand-contract API** — never remove/rename a field/endpoint/required param a
     live FE depends on in the same release; contract later. This makes the API backward-compatible by
     construction. **No `/v1`,`/v2` proliferation** — reserve a version bump for genuine breaks.
  2. **Build-hash refresh prompt** — `GET /api/version` (or an `X-Build` response header) returns the
     build hash; the SPA carries its own (`import.meta.env.VITE_BUILD_HASH`); on mismatch show a
     non-blocking **"new version — reload"** (cheap because `index.html` is `no-cache`).
  3. **FE+BE ship and roll back as ONE release tag** → the skew window is only "tabs opened before the
     flip", which 1+2 cover. A half-rollback (BE only) is forbidden — it would break the additive invariant.

---

## 5. Feature delivery + per-feature kill switch

This is how features promoted from the **plugin apps** (Compare, RedirectMap) or built in **main**
roll out — and how a broken one is killed **without a redeploy** (= instant feature-level rollback).

**Build, don't buy (yet): extend the existing DB config into a feature-flag table, read through the
OpenFeature SDK.** Reuse-before-build — PiKaOs already has DB-backed, UI-editable config
(`app_settings` + the "จัดการเครื่องมือ" screen, see [data-model.md](data-model.md)). A flag is just a
typed named boolean/variant with optional targeting; extending that table gives the "kill switch
without redeploy" outcome with **zero new infra / datastore / container** in the on-prem bundle (every
external flag service drags in Postgres/Mongo/Go you'd ship + operate at every site).

- **New feature lands behind a flag, default off.** Promote plugin → main behind its flag; turn it
  on per environment when ready; a bad feature = flip the row off, live, no deploy.
- **Read flags through the OpenFeature SDK** (CNCF standard) with a thin custom provider over the DB
  table → "buy later" = swap the provider to **Flipt** (single Go binary, no extra DB — lightest) or
  **Unleash** (richest, needs Postgres) with no call-site changes. Defer that until %-rollout /
  per-segment targeting / experiment stats / RBAC are actually needed.
- Flags travel in the bundle as **DB rows** (idempotent seed) → on-prem can toggle on-site without
  touching images.

---

## 6. Rollback flows (what "instant, always ready" means per layer)

| Layer | Online (hosted) | Air-gap (on-prem) | Speed |
|---|---|---|---|
| **Backend / worker / FE** | `docker service update --rollback` (Swarm PreviousSpec) or auto-revert on failed health | re-`docker stack deploy` the **prev bundle manifest** (prev images already in local Zot/loaded) | seconds (image already present) |
| **A whole release** | redeploy the prev release tag (all services, one motion) | flip the `current` symlink/alias to `pikaos-vX.Y.(Z-1)/` and re-up | seconds–minutes |
| **Database schema** | **forward-fix migration** (never destructive-down); restore the pre-upgrade `pg_dump` only for true data loss | same | minutes (forward-fix) / longer (restore) |
| **A single feature** | flip the **flag row** off (live) | flip the flag row off (live) | instant, no deploy |

**Golden rules:** roll **FE+BE back together** (never half) · the schema stays at head (forward-fix) ·
keep **N-1/N-2** images + manifests resident so rollback never needs a network · the pre-upgrade
`pg_dump` is the last-resort data recovery, taken automatically before every upgrade.

---

## 7. Versioning + registry

- **One release version** spans FE+BE+migrations+flags. It lives once (extend the
  [versions.md](versions.md) model + each app's `config.py` `app_version` → `/api/health`) and is the
  tag the whole bundle is built and rolled back by. Surfaced to the FE as the build-hash (§4).
- Plugin apps keep their **UAT version ahead of main** (dev-rules §6.4–6.5); when a plugin
  feature folds into a main release it joins main's release version, behind its flag (§5).
- Update [versions.md](versions.md) in the same commit as the release (registry hard rule).

---

## 8. Build pipeline (CI — GitHub Actions)

On a release tag: build images → **resolve to digests** → cosign-sign → `docker save` →
`images-vX.Y.Z.tar.gz` → assemble the bundle (digest-pinned stack files + `install/upgrade/rollback.sh`
+ Zot + RELEASE.md) → publish (registry for hosted; downloadable bundle for on-prem). The existing CI
(lint + `vite build` + `pytest` + **squawk** migration lint + **pytest-alembic**) is the **gate**: a
release tag that fails the gate never produces a bundle. This is the production-scale version of
[ai-runbooks R4 (safe upgrade + rollback)](../process/ai-runbooks.md#r4--audit-dependencies--versions)
and [`scripts/upgrade-dep.sh`](../../../PiKaOs-Core/scripts/upgrade-dep.sh).

---

## 9. Rollout plan (incremental — value early, no big-bang)

1. **HEALTHCHECKs** on backend/worker/frontend images + a `GET /api/version` build-hash endpoint. ✅ **DONE 2026-06-27** — `config.app_version`/`build_hash` (BUILD_HASH build-arg) → `/api/version` (liveness, no deps) + `version`/`build` on `/api/health`; Dockerfile HEALTHCHECKs (backend→`/api/version`, frontend→`/`) + worker `arq --check` in compose. *(prereq for everything; useful immediately)*
2. **Migration discipline**: adopt **squawk** + **pytest-alembic** in CI; write the expand-contract rules (§3) into [ai-runbooks](../process/ai-runbooks.md) as a migration runbook; start a **pre-upgrade `pg_dump`** step. *(de-risks every future change, no Swarm needed)*
3. **Feature-flag table** behind OpenFeature (§5) — extend `app_settings`; route the next promoted feature through it. *(unlocks kill-switch + safe plugin→main folds)*
4. **FE atomic deploy** — versioned nginx image + cache rules + reload prompt (§4).
5. **Swarm** — `swarm init`, convert stacks, `deploy:` keys, prove zero-downtime + `--rollback` on staging.
6. **Bundle pipeline** — digest-pin + cosign + `docker save` + Zot + install/rollback scripts; rehearse a full **air-gap install + rollback** on a clean box (the real acceptance test).

Each step stands alone and leaves the system better; Swarm (5) and the bundle (6) come last because 1–4
pay off regardless of the engine.

---

## 10. Decisions + deferred

- **Engine = Docker Swarm** (decided 2026-06-27). **Kamal 2** (MIT, simplest ergonomics) is the
  fallback if hand-tending Swarm stack files chafes — it needs a registry, which the bundled Zot already
  provides. **k3s/k8s** is the escalation path if we outgrow Swarm's 1-level rollback / shrinking
  ecosystem — deferred for its ops learning curve (contradicts the small-team lean). **PaaS**
  (Coolify/Dokploy/CapRover) **rejected** — no air-gap bundle (online `curl|bash` installers).
  **Nomad rejected** — BUSL "embedded" clause blocks shipping it inside a customer bundle.
- **Acceptance criteria** (Definition of Done for the build): deploy N→N+1 on staging with **zero dropped
  requests**; kill the new backend task mid-rollout → **auto-rollback**, no downtime; **air-gap install**
  on a clean offline box from the bundle, then **roll back to N-1** offline; a destructive-looking schema
  change shipped as expand-contract with N and N-1 both green; flip a feature flag off live and see it
  disappear with no redeploy.
- **Hosted on AWS** (own machine today, cloud later): topology + the **data migration** (MinIO→S3,
  Postgres→RDS, Redis, the SECRET_KEY/crypto coupling) + capacity ceilings are written ahead in
  [deploy.md §6 (Topology C)](deploy.md#6-topology-c--aws-cloud-planned--running-on-own-machine-today).
  On AWS the engine is **ECS rolling + CodeDeploy blue/green** (the managed form of §2/§6); the Swarm
  bundle stays the on-prem path. Same images, different target.
- **Open:** hosted infra (own Swarm nodes vs ECS/managed VMs) · managed Postgres/Redis/S3 vs bundled
  (on-prem must bundle them; hosted uses managed) · PITR (WAL archiving) if RPO must beat the pre-upgrade
  snapshot · secrets (`docker secret` / AWS Secrets Manager vs the current `.env`).
