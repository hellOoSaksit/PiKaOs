# PiKaOs — Hardening & Fix Plan (Service Placement · Vulnerabilities · Structure)

**Date:** 2026-07-02
**Status:** Findings + remediation plan — approved for scheduling
**Source reviews:** deploy-config audit · backend security review · docs-consistency review · **live pentest of the running `deploy-*` stack (2026-07-02)**
**Scope:** consolidates every finding into named `Fix-*` items across three domains the owner asked for:

- **A. Service placement across servers** (`Fix-NET-*`, `Fix-HOST-*`, `Fix-TOPO-*`)
- **B. Vulnerabilities / pentest** (`Fix-SEC-*`)
- **C. Structure / architecture** (`Fix-ARCH-*`, `Fix-DOC-*`, `Fix-DEP-*`)

Each item: **ID · severity · evidence · what's wrong · the fix · effort**. Plan is at the end (§4).

Severity scale: **P0** = fix before any shared/prod exposure · **P1** = fix before prod · **P2** = should-fix · **P3** = housekeeping.

---

## ✅ Implementation status — Core-first pass (2026-07-02)

This pass fixed **only PiKaOs-Core** (kernel Backend/Frontend + `deploy/` overlays + root CI). Plugin-repo
items (Compare/RedirectMap/Auth SSRF, plugin auth, plugin rate-limit) are explicitly out of scope here.

| Fix | What changed | Where | Verified |
|---|---|---|---|
| **Fix-NET-03** | `/docs`,`/redoc`,`/openapi.json` served in dev, **disabled when `is_production`**; `/` no longer advertises docs in prod | [main.py](../../PiKaOs-Core/Backend/app/main.py) | ✅ live: dev `/docs`=200; prod-mode `docs_url/redoc_url/openapi_url=None` |
| **Fix-SEC-03** | security headers on every response (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`; `HSTS` in prod only), `setdefault` so nginx edge wins | [main.py](../../PiKaOs-Core/Backend/app/main.py) | ✅ live: 3 headers present on `/api/version` |
| **Fix-SEC-06** | `CORS_ORIGINS='*'` is now a `production_violations()` tripwire (boot refuses) | [config.py](../../PiKaOs-Core/Backend/app/core/config.py) | ✅ container: flagged in prod, explicit origin clean |
| **Fix-SEC-10** | prod + unauthenticated `/api/health` returns only `{status}`; authed + all non-prod callers keep full detail (dev/tests unchanged) | [health.py](../../PiKaOs-Core/Backend/app/core/routers/health.py), [schemas.py](../../PiKaOs-Core/Backend/app/core/schemas.py) | ✅ live: dev unauth still full (7 keys, 8 plugins); is_production gate proven |
| **Fix-SEC-05** | Backend runs as non-root `appuser` (uid 1000 to match dev host + keep bind-mount/state writable) | [Backend/Dockerfile](../../PiKaOs-Core/Backend/Dockerfile) | ⏳ **needs image rebuild + `down -v`** to take effect (not rebuilt to avoid disrupting the live stack) |
| **Fix-NET-02** | prod overlay publishes **only** MinIO S3 API 9000; console 9001 dropped via `ports: !override` | [docker-compose.prod.data.yml](../../PiKaOs-Core/deploy/docker-compose.prod.data.yml) | ✅ compose v5.1.4 supports `!override`; applies on next prod deploy |
| **Fix-NET-01** | reframed: loopback-bind **would break** cross-stack `host.docker.internal` — correct control is the **host firewall** (Fix-NET-04). Documented in the overlay | [docker-compose.prod.data.yml](../../PiKaOs-Core/deploy/docker-compose.prod.data.yml) | 📝 note added; firewall is a host/runbook step |
| **Fix-DEP-01** | `ollama:latest`→`ollama:0.31.1`; Frontend `npm install`→`npm ci`; `ci.yml` gains `permissions: contents: read` | [ai.yml](../../PiKaOs-Core/deploy/docker-compose.ai.yml), [Frontend/Dockerfile](../../PiKaOs-Core/Frontend/Dockerfile), [ci.yml](../../.github/workflows/ci.yml) | ✅ edits applied; take effect on next build/CI run |

**Regression gate:** full Core backend suite **81 passed** in-container after all edits; hot-reloaded code fixes verified live against the running `deploy-*` stack.

**Correction to the original recommendation:** Fix-NET-01 in §A below said "loopback-bind." That is wrong for
this split-stack topology — the data ports are published so the backend/ai stacks reach them via
`host.docker.internal` (docker gateway IP, not `127.0.0.1`). The real control is a **host firewall**
(Fix-NET-04); the fix table above reflects the corrected approach.

**Still open (need a rebuild or are out of Core scope):**
- **Fix-SEC-05** — rebuild `deploy-backend-1` + `down -v` to run non-root (say the word; it's a clean-slate step).
- **Fix-SEC-02 / Fix-SEC-03(edge) / Fix-NET-04/05 / Fix-HOST-*** — host/edge/runbook layer, not kernel code.
- **Fix-SEC-01 / Fix-SEC-04 / Fix-SEC-07 / Fix-SEC-09** — live in plugin repos (Auth/Compare/RedirectMap/Knowledge), deliberately untouched this pass.
- **Fix-ARCH-* / Fix-TOPO-* / Fix-DOC-*** — architecture reconcile + doc refresh, tracked below.

---

## 0. Live pentest results (running stack, 2026-07-02)

The stack was up as compose project `deploy` (`deploy-backend-1/-db-1/-redis-1/-minio-1/-worker-1`, all healthy). Probes from the host:

| Probe | Result | Verdict |
|---|---|---|
| `GET /api/health` (unauth) | 200, leaks full plugin list + db/redis/minio status | INFO — acceptable but verbose (see Fix-SEC-10) |
| `GET /api/plugins` (no token) | **401** | GOOD — auth enforced |
| `GET /docs`, `GET /openapi.json` | **200 — public** | Fix-SEC-10 / Fix-NET-03 |
| TCP `127.0.0.1:5432` (Postgres) | **OPEN** on 0.0.0.0 | Fix-NET-01 |
| `127.0.0.1:9000` MinIO API | **200** | Fix-NET-01 |
| `127.0.0.1:9001` MinIO console | **200 — web console reachable** | Fix-NET-02 |
| Redis `PING` from host | empty reply (auth likely on — verify) | Fix-NET-01 / verify auth |
| Login ×6 rapid | no throttle observed (422 due to payload schema; no 429) | Fix-SEC-02 |

Note: these ports are bound to `0.0.0.0` in dev on this laptop. The **risk is that the same compose defaults reach a real prod host** — the prod overlay does not re-bind them (Fix-NET-01/02).

---

## A. SERVICE PLACEMENT ACROSS SERVERS

### Fix-NET-01 — Bind datastore ports to loopback in prod (P0)
- **Evidence:** [docker-compose.data.yml:24-25](../../PiKaOs-Core/deploy/docker-compose.data.yml#L24-L25) (5432), `:42-43` (6379), `:60-62` (9000/9001); prod overlay `docker-compose.prod.data.yml` does not restrict. Live: 5432/9000/9001 open on 0.0.0.0.
- **Wrong:** Postgres/Redis/MinIO published on every interface. On a single prod host this exposes the data tier to the internet, guarded only by passwords.
- **Fix:** in `docker-compose.prod.data.yml` re-map to loopback — `"127.0.0.1:5432:5432"`, `"127.0.0.1:6379:6379"`, `"127.0.0.1:9000:9000"`. App reaches them over the compose network / `host.docker.internal`, not the public port. Add host firewall as defense-in-depth (Fix-NET-04).
- **Effort:** S (overlay edit + redeploy).

### Fix-NET-02 — Do not publish the MinIO console (9001) in prod (P1)
- **Evidence:** [docker-compose.data.yml:62](../../PiKaOs-Core/deploy/docker-compose.data.yml#L62); live `9001` returns 200.
- **Wrong:** admin web console internet-reachable.
- **Fix:** drop the `9001` publish in the prod overlay entirely (access via SSH tunnel when needed); if kept, loopback-bind + firewall.
- **Effort:** S.

### Fix-NET-03 — Disable `/docs` + `/openapi.json` in production (P1)
- **Evidence:** live `/docs` and `/openapi.json` = 200 on the running backend.
- **Wrong:** full API surface + schemas public; gives an attacker a complete map of every route and body shape.
- **Fix:** in the FastAPI app factory, set `docs_url=None, redoc_url=None, openapi_url=None` when `settings.is_production` (keep on in dev/UAT). Cross-ref Fix-SEC-10.
- **Effort:** S ([Core/Backend/app/main.py](../../PiKaOs-Core/Backend/app/main.py)).

### Fix-NET-04 — Host firewall: only 80/443 public (P1)
- **Evidence:** provisioning runbook not yet written; spec §8 mentions firewall but no rule set.
- **Wrong:** no explicit ingress policy; everything a container publishes is reachable.
- **Fix:** ufw/nftables default-deny inbound; allow only 22 (from admin IP/bastion), 80, 443. Everything else (5432/6379/9000/9001/8000) stays host-internal. Document in `runbook-provisioning.md`.
- **Effort:** M (runbook + host apply, human step).

### Fix-NET-05 — nginx edge is the only public entry; TLS + security headers there (P1)
- **Evidence:** spec §6 topology `nginx → frontend/backend`; headers not defined at edge.
- **Wrong:** app-tier ports (8000) must not be public; TLS/HSTS/headers undefined per env.
- **Fix:** publish only nginx (80/443); backend/frontend/worker unpublished (compose-network only). Put HSTS/CSP/X-Frame-Options/X-Content-Type-Options at the nginx layer (complements Fix-SEC-03). ACME renewal → Fix-HOST-03.
- **Effort:** M.

### Fix-HOST-01 — Production single-host SPOF: document as accepted risk + HA roadmap (P2)
- **Evidence:** spec §7/§8 both single Debian hosts; §11 covers loss (RTO ≤1h) but never names SPOF.
- **Wrong:** a prod host failure = up to 1h downtime, silently accepted.
- **Fix:** add an explicit "Accepted risk: single-host, RTO ≤1h" line to §8, and a roadmap note (managed Postgres / second host / k8s per §19) for when SLA demands HA.
- **Effort:** S (doc).

### Fix-HOST-02 — Define the deploy user + on-host file ownership (P1)
- **Evidence:** spec §9 "SSH → docker compose" with no principal; §8 says key-only but not *which* user; `.env.prod` ownership unspecified.
- **Wrong:** deploy likely runs as root; `.env.prod` perms undefined.
- **Fix:** create a non-root `deploy` user in the `docker` group; compose project lives in `/opt/pikaos/{uat,prod}` owned by that user; `.env.prod` mode `600`, owned by `deploy`. SSH deploy key restricted with `command=`/`from=` in `authorized_keys`. Document in provisioning runbook.
- **Effort:** M (human/runbook).

### Fix-HOST-03 — TLS cert automation (certbot/ACME) + renewal reload (P1)
- **Evidence:** spec §7/§8 say "Let's Encrypt/ACME" but no mechanism/owner/renew step.
- **Wrong:** named-but-undesigned; certs will silently expire.
- **Fix:** certbot (webroot or DNS-01) on each host, systemd-timer renewal, `--deploy-hook` to `nginx -s reload`; add cert-expiry to alerting (Fix-SEC-11). Document in runbook.
- **Effort:** M.

### Fix-TOPO-01 — Reconcile deploy topology with the zero-datastore kernel (P0, unblocks the rest)
- **Evidence:** deploy spec §1/§6 = monolith owning postgres/redis/minio; [kernel-redesign.md](../../PiKaOs-Docs/docs/architecture/kernel-redesign.md) (same date) = **zero-datastore kernel**, datastores are Tool-plugin sidecars that generate their own compose fragments.
- **Wrong:** the spec automates an architecture being dismantled; `deploy/prod/docker-compose.yml` and the image list would be wrong at build time.
- **Fix:** decide prod = zero-datastore kernel + enabled Tool sidecars; rewrite the deploy compose to be **composed from the tool-plugin fragments** (matching install-time generation), not a hand-fixed all-in-one. This is the parent decision for Fix-TOPO-02/03/04 and Fix-ARCH-01/03.
- **Effort:** L (design + compose rework).

### Fix-TOPO-02 — Separate stateful from stateless in the rolling deploy (P0)
- **Evidence:** spec §4.4 step 4 "rolling `up -d` (per-service)" recreates *all* services incl. postgres/redis/minio; [release-and-rollback.md](../../PiKaOs-Docs/docs/architecture/release-and-rollback.md) §2 says stateful services must NOT be rolled like stateless.
- **Wrong:** a routine app deploy can recreate the data tier → data-loss / downtime risk.
- **Fix:** `deploy.sh` targets only stateless services (`backend worker frontend nginx`) on a normal deploy; data-tier changes are a separate, explicit, backup-gated operation. Split compose projects (`-data` vs `-app`) as the dev-rules already mandate.
- **Effort:** M.

### Fix-TOPO-03 — Drain the arq worker before restart (P1)
- **Evidence:** spec §6 has a `worker` service; pipeline never drains in-flight jobs. [risk-mitigation.md](../../PiKaOs-Docs/docs/architecture/risk-mitigation.md) §1: `side_effect` tools are at-most-once — killing mid-step forces a human-confirm path.
- **Wrong:** blind worker restart is a correctness hazard, not just availability.
- **Fix:** deploy step sends the worker a graceful stop, waits for in-flight `agent_run` jobs to finish (bounded timeout) before recreate; document the at-most-once guarantee in the runbook.
- **Effort:** M.

### Fix-TOPO-04 — Resolve compose-vs-Swarm and stop overclaiming zero-downtime (P1)
- **Evidence:** deploy spec = plain `docker compose` (single replica); release-and-rollback.md §2 chose **Swarm replicas=2 start-first** for zero-downtime. Both "active."
- **Wrong:** single-replica compose `up -d` is stop-then-start = real downtime; "rolling, healthcheck-gated" overclaims.
- **Fix:** pick one — (a) accept brief downtime, reword spec honestly, add a maintenance-page; or (b) adopt Swarm as release-and-rollback.md specifies. Mark the losing doc superseded (Fix-ARCH-04).
- **Effort:** M–L depending on choice.

---

## B. VULNERABILITIES / PENTEST

### Fix-SEC-01 — Compare & RedirectMap expose all endpoints with NO auth (P0 for shared deploy)
- **Evidence:** [compare.py:1-89](../../PiKaOs-Plugin-Compare/Backend/app/routers/compare.py#L1-L89) (docstring: "NO auth"; 4 POST endpoints), [redirect.py:57-114](../../PiKaOs-Plugin-RedirectMap/Backend/app/routers/redirect.py#L57-L114) (8 POST endpoints). Standalone apps mount only CORS.
- **Wrong:** anyone reaching the service drives outbound fetch/crawl/probe — an SSRF/port-scan amplifier, no rate cap.
- **Fix:** gate routers behind the shared identity dependency, OR enforce auth at the gateway/network boundary and explicitly document "no-auth build = trusted-network-only + never internet-exposed."
- **Effort:** M.

### Fix-SEC-02 — No rate limiting anywhere (login brute-force) (P1)
- **Evidence:** no `slowapi/limiter` in any backend; live login ×6 showed no 429. Login: [Auth/backend/router.py:51](../../PiKaOs-Plugin-Auth/backend/router.py#L51).
- **Wrong:** credential brute-force + fetch-endpoint abuse uncapped.
- **Fix:** slowapi (Redis-backed) on `/api/auth/login` (e.g. 5/min/IP + lockout) and the fetch endpoints; or rate-limit at nginx edge. Prefer edge + app defense-in-depth.
- **Effort:** M.

### Fix-SEC-03 — No security-response headers (P1)
- **Evidence:** only CORS middleware present ([Core/Backend/app/main.py:55](../../PiKaOs-Core/Backend/app/main.py#L55)).
- **Wrong:** no HSTS/CSP/X-Frame-Options/X-Content-Type-Options.
- **Fix:** set them at nginx edge (Fix-NET-05) and/or a small FastAPI middleware. HSTS only once TLS is live.
- **Effort:** S.

### Fix-SEC-04 — SSRF guard DNS-rebinding / TOCTOU window (P1)
- **Evidence:** [Compare net_guard.py:45-76](../../PiKaOs-Plugin-Compare/Backend/app/services/net_guard.py#L45-L76) and RedirectMap equivalent — validates a resolved IP, then httpx re-resolves independently at connect (comment acknowledges the gap).
- **Wrong:** attacker DNS can pass validation then rebind to an internal IP at connect time.
- **Fix:** resolve once, pin the vetted IP into the httpx transport (custom resolver/transport that validates the actually-connected address). Guard is otherwise strong (private-range block + per-redirect re-check).
- **Effort:** M.

### Fix-SEC-05 — Containers run as root (P1)
- **Evidence:** no `USER` in [Backend/Dockerfile](../../PiKaOs-Core/Backend/Dockerfile) or Frontend; deploy spec §6 itself promises non-root.
- **Wrong:** container compromise = root in container; spec-compliance gap.
- **Fix:** add `appuser` (non-root) in Backend Dockerfile after COPY; use `nginxinc/nginx-unprivileged` for the frontend.
- **Effort:** S–M.

### Fix-SEC-06 — Guard against `CORS_ORIGINS=*` in production (P2)
- **Evidence:** [Core/Backend/app/main.py:55-61](../../PiKaOs-Core/Backend/app/main.py#L55-L61) — `allow_credentials=True` + `allow_methods/headers=["*"]`; no `production_violations()` check on wildcard origins ([config.py:170](../../PiKaOs-Core/Backend/app/core/config.py#L170)).
- **Wrong:** an operator setting `CORS_ORIGINS=*` with credentials enabled = credential-leaking CORS.
- **Fix:** add a boot guard rejecting `*` in `cors_origins` when `is_production`.
- **Effort:** S.

### Fix-SEC-07 — Review seed users + SEED_PASSWORD before prod (P1)
- **Evidence:** [Auth/backend/seed.py:22-29](../../PiKaOs-Plugin-Auth/backend/seed.py#L22-L29) — seed users share `settings.seed_password`, incl. an `admin` (`somchai`); dev `.env` has `SEED_PASSWORD=pikaos123`.
- **Wrong:** if seeded into prod, shared/known admin creds. (Boot guard already tripwires the dev value — good.)
- **Fix:** ensure prod `SEED_PASSWORD` is unique/strong, disable or force-rotate seeded users on first prod boot, or skip seeding in prod entirely.
- **Effort:** S.

### Fix-SEC-08 — JWT revocation deny-list fails open on Redis outage (P3, accept)
- **Evidence:** [Auth/backend/session_store.py:83-93](../../PiKaOs-Plugin-Auth/backend/session_store.py#L83-L93) — `is_access_denied` returns False when Redis unreachable; revoked token valid until 15m expiry. Documented tradeoff (A9).
- **Fix:** acceptable given 15m TTL; if stricter, fail closed. **Decision only, likely accept.**
- **Effort:** S.

### Fix-SEC-09 — Upload content-type/extension allowlist (P2)
- **Evidence:** [Knowledge/backend/router.py:37-58](../../PiKaOs-Plugin-Knowledge/backend/router.py#L37-L58) — 25MB cap + empty-reject, but any MIME accepted; `safe_name` leaves `..` (negligible — S3 keys are literal, uuid-namespaced).
- **Fix:** allowlist accepted types/extensions if arbitrary binaries shouldn't be stored.
- **Effort:** S.

### Fix-SEC-10 — Trim `/api/health` verbosity + close schema in prod (P2)
- **Evidence:** live `/api/health` returns full plugin list + component status unauth; `/openapi.json` public (see Fix-NET-03).
- **Wrong:** recon aid (versions, enabled plugins, infra status) for an unauth caller.
- **Fix:** keep `/api/health` to `{status:"ok"}` for unauth; put the detailed variant behind auth or an internal-only path. Close docs/openapi in prod (Fix-NET-03).
- **Effort:** S.

### Fix-SEC-11 — Alerting on backup failure + cert expiry + host-down (P2)
- **Evidence:** spec §16 defers Loki/Prometheus/Grafana to "Next"; today only HEALTHCHECK + `docker logs`. DR (§11) depends on backups succeeding silently.
- **Wrong:** a silently-failing nightly backup breaks the entire DR story unnoticed.
- **Fix:** minimum viable alerting now — backup-job exit-code → webhook/email, cert-expiry check, host-down uptime check. Full observability stack later.
- **Effort:** M.

### Fix-SEC-12 — Scheduled secret rotation (incl. SECRET_KEY coupling) (P2)
- **Evidence:** spec §12 rotates only *if* leaked; `SECRET_KEY` decrypts stored LLM keys ([deploy.md](../../PiKaOs-Docs/docs/architecture/deploy.md) §6.2).
- **Wrong:** no proactive rotation for JWT/SECRET_KEY/DB/GHCR/SSH; rotating `SECRET_KEY` naively bricks stored LLM keys.
- **Fix:** rotation runbook with cadence + a re-encrypt migration path for `SECRET_KEY`. Document the coupling.
- **Effort:** M (runbook).

### Fix-SEC-13 — Plugin loading trust model: state it explicitly (P3, by-design)
- **Evidence:** [plugin_loader.py:195](../../PiKaOs-Core/Backend/app/plugin_loader.py#L195) — `importlib.import_module` runs plugin code in-process, full privileges; manifest validation structural only (no signing/hash).
- **Wrong:** whoever can write `app/plugins/` or set `ENABLED_MODULES` = arbitrary code exec. Expected for a modular monolith, but undocumented.
- **Fix:** document the trust boundary (first-party plugins in-image only); optional future: manifest hash/signature check. No code change needed now.
- **Effort:** S (doc).

---

## C. STRUCTURE / ARCHITECTURE

### Fix-ARCH-01 — Reconcile deploy spec ↔ kernel-redesign (P0, master blocker)
- Same root as Fix-TOPO-01. The deploy spec targets a monolith; the kernel is going zero-datastore with datastores/capabilities as plugins. **Nothing else in the deploy pipeline should be built until this is settled.**
- **Fix:** amend the deploy spec §1/§3/§6 to describe the zero-datastore kernel + generated compose; re-derive the image list from the real packaging model (Fix-ARCH-03).
- **Effort:** L.

### Fix-ARCH-02 — Add DB migration execution to the pipeline (P0)
- **Evidence:** deploy spec §4.4 = backup→pull→up→health with **no `alembic upgrade head`**; §4.3 UAT also none. release-and-rollback.md §3 mandates "schema before code" + single-runner + pg advisory-lock.
- **Wrong:** new code starts against an un-migrated schema; racing replicas double-migrate.
- **Fix:** add an explicit migration step **before** the app `up -d`, run by a single one-shot container/job holding a pg advisory lock; forward-only expand/contract (spec §10). Reference [alembic/versions/](../../PiKaOs-Core/Backend/alembic/versions/) (migrations live here per project convention).
- **Effort:** M.

### Fix-ARCH-03 — Fix the plugin-image model (bake vs sidecar vs repo) (P1)
- **Evidence:** deploy spec §3 "~12 plugin images path-based from monorepo"; kernel-redesign §2/§5 = capability plugins **bake into Core image**, only heavy tools get sidecars, client-only tools get no container; plugins live in **separate repos** ([CLAUDE.md], plugin-architecture §0); monorepo consolidation incomplete.
- **Wrong:** the image list is wrong three ways (packaging, repo layout, naming — "Chat" isn't a plugin; the channel is `telegram`).
- **Fix:** rewrite §3 image list to: `pikaos-backend` (Core + baked capability plugins), `pikaos-frontend`, and one image **only per heavy tool sidecar** (postgres/redis/minio as needed). Drop per-capability-plugin images.
- **Effort:** M.

### Fix-ARCH-04 — Supersede or merge release-and-rollback.md (P1)
- **Evidence:** two live, mutually-exclusive deploy designs (engine, pinning tag-vs-digest, GHCR-vs-Zot, zero-downtime). Neither supersedes the other.
- **Fix:** decide the canonical deploy doc; stamp the other `Status: Superseded by <doc>` and pull forward the parts worth keeping (migration-gate §3, stateful/stateless rule §2, air-gap story if still a goal).
- **Effort:** S–M (doc).

### Fix-ARCH-05 — Disambiguate the term "UAT" (P2)
- **Evidence:** "UAT" = deployed host (deploy spec), = plugin-version copy ([versions.md], dev-rules §6, a hard rule), = local clean-slate harness ([uat-clean-slate.md]).
- **Wrong:** one load-bearing term, three meanings → operational confusion.
- **Fix:** rename the deployed environment to `staging` (or keep `uat` and rename the others); update all three docs to one glossary entry.
- **Effort:** S (doc + rename).

### Fix-DOC-01 — Refresh system-design.md (stale, high-impact) (P1)
- **Evidence:** [system-design.md](../../PiKaOs-Docs/docs/architecture/system-design.md) dated 2026-07-01 but describes 13 core tables, auth in `auth_service.py`, kernel-owns-DB — the pre-refactor world. It's the "read first" doc.
- **Fix:** rewrite to zero-datastore kernel + auth-as-plugin + datastores-as-Tool. Highest-impact doc refresh.
- **Effort:** M.

### Fix-DOC-02 — Refresh pikaos-dev-rules.md (P1)
- **Evidence:** [pikaos-dev-rules.md](../../PiKaOs-Docs/docs/pikaos-dev-rules.md) §2/§4 treat SQLAlchemy/Redis/argon2/auth as core Backend.
- **Fix:** update §2/§2.1/§3/§4 to the plugin-owned datastore + auth-plugin model (§1.6 was already partially updated — same treatment).
- **Effort:** M.

### Fix-DOC-03 — Stale-banner deploy.md / risk-mitigation.md / ports.md (P2)
- **Evidence:** all pre-refactor; describe kernel-owns-DB, RBAC-in-core, statically-owned datastore ports.
- **Fix:** add a `> ⚠️ Superseded by kernel-redesign.md / plugin-architecture.md §0` banner at top of each, or refresh. Banner is the cheap first step.
- **Effort:** S.

### Fix-DEP-01 — Build/CI housekeeping (P3)
- **Evidence:** `ollama/ollama:latest` unpinned ([docker-compose.ai.yml:57](../../PiKaOs-Core/deploy/docker-compose.ai.yml#L57), behind opt-in profile); Frontend `npm install` not `npm ci` ([Frontend/Dockerfile:9](../../PiKaOs-Core/Frontend/Dockerfile#L9)); [ci.yml](../../.github/workflows/ci.yml) has no `permissions:` block.
- **Fix:** pin ollama tag/digest; `npm ci`; add `permissions: contents: read` to ci.yml.
- **Effort:** S.

---

## 4. PLAN (phased, gated)

### Phase 0 — Immediate hardening of the running/dev stack (this week, no arch decisions needed)
Low-risk, high-value, independent of the topology reconcile. Order:
1. **Fix-NET-03** + **Fix-SEC-10** — close `/docs`,`/openapi.json`, trim `/api/health` in prod. *(S)*
2. **Fix-SEC-05** — non-root `USER` in both Dockerfiles. *(S–M)*
3. **Fix-SEC-06** — CORS `*` prod guard. *(S)*
4. **Fix-SEC-02** + **Fix-SEC-03** — rate-limit on login + security headers (app-level first). *(M)*
5. **Fix-SEC-04** — pin resolved IP in the SSRF guard (both fetch plugins). *(M)*
6. **Fix-DEP-01** — ollama pin, `npm ci`, ci.yml permissions. *(S)*
- **Gate:** each verified live (re-run the §0 probes: `/docs`→404 in prod-mode, login→429 after N, headers present).

### Phase 1 — Architecture reconcile (the unblocker — do before writing any deploy YAML)
1. **Fix-ARCH-01 / Fix-TOPO-01** — decide: prod deploys the zero-datastore kernel + generated tool-sidecar compose. *(L)*
2. **Fix-ARCH-04** — pick the canonical deploy doc; supersede the other. *(S–M)*
3. **Fix-ARCH-03** — rewrite the image list to bake-vs-sidecar reality. *(M)*
4. **Fix-ARCH-05** — settle "UAT" vs "staging" naming. *(S)*
5. **Fix-TOPO-04** — decide compose-vs-Swarm + honest downtime wording. *(M–L)*
- **Gate:** deploy spec §1/§3/§6 amended and internally consistent with kernel-redesign.md before Phase 2.

### Phase 2 — Deploy pipeline & host placement (build the actual deploy)
1. **Fix-ARCH-02** — migration step (single-runner, advisory-lock, schema-before-code). *(M)*
2. **Fix-TOPO-02** — split stateful/stateless; `deploy.sh` touches only app services. *(M)*
3. **Fix-TOPO-03** — worker drain-before-restart. *(M)*
4. **Fix-NET-01 / Fix-NET-02** — loopback-bind datastore ports + drop 9001 in prod overlay. *(S)*
5. **Fix-NET-04 / Fix-NET-05** — host firewall (only 80/443) + nginx-edge-only + headers/TLS at edge. *(M)*
6. **Fix-HOST-02 / Fix-HOST-03** — deploy user + file perms + ACME renewal. *(M, human steps)*
- **Gate:** a full UAT/staging deploy round-trips (build→GHCR→SSH→migrate→up→health→rollback) on a real host.

### Phase 3 — Security-of-record, DR, docs
1. **Fix-SEC-01** — auth (or documented network boundary) for Compare/RedirectMap. *(M)*
2. **Fix-SEC-07** — seed-user/password review for prod. *(S)*
3. **Fix-SEC-09** — upload allowlist. *(S)*
4. **Fix-SEC-11 / Fix-SEC-12** — backup/cert/host alerting + secret-rotation runbook. *(M)*
5. **Fix-HOST-01** — document single-host SPOF as accepted risk + HA roadmap. *(S)*
6. **Fix-DOC-01 / -02 / -03** — refresh system-design + dev-rules; stale-banner the rest. *(M)*
7. **Fix-SEC-08 / Fix-SEC-13** — decisions/docs (accept fail-open; document plugin trust model). *(S)*

### Cross-cutting
- Everything Prod-affecting stays behind the human gate (deploy spec §0/§18) — AI scaffolds, human applies.
- Re-run the §0 pentest probes after Phase 0 and again after Phase 2 as regression checks.

---

## Grade (unchanged from review)
- **Code + security hygiene: A-** (secrets never in git, boot guard, argon2id, RBAC, refresh rotation, SSRF guard)
- **Deploy spec: B+** (excellent discipline, wrong target architecture)
- **Docs consistency: C** (stale core docs, two live deploy designs, "UAT" overloaded)

**Master blocker: Fix-ARCH-01 / Fix-TOPO-01** — reconcile the deploy design with the zero-datastore kernel. It unblocks Phase 2 onward.
