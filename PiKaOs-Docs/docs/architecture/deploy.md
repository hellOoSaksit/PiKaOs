---
title: Deployment Topologies (same-server ↔ separate server)
type: architecture
status: active
keywords: [deployment, docker compose, topology, env, secrets, stacks, datastores, production, scaling]
related: [./modularity.md, ./tech-stack.md, ./ports.md, ../pikaos-dev-rules.md]
summary: >
  How to deploy PiKaOs from one codebase — combined on one machine (4 stacks) or split per
  component server. Read when changing compose, env, or where components run.
updated: 2026-06-27
---

# PiKaOs — Deployment (same-server ↔ separate server per component)

> **Goal:** single codebase/Docker image set, choose **topology at deploy time** — combined on one machine (dev = 4 separate stacks)
> or separate server per component (per differing cost/spec). No codebase fork. Pairs with [modularity.md](modularity.md)
> (extractable systems) — source of truth for env/compose = [`deploy/`](../../../PiKaOs-Core/deploy) (`docker-compose.*.yml`
> per stack — **no more root all-in-one**) + [`Backend/.env.example`](../../../PiKaOs-Core/Backend/.env.example).
>
> **Going to SaaS / zero-downtime updates / single on-prem bundle?** This file is the *topology*; the
> *update + rollback system* (one versioned release · 24/7 zero-downtime via Docker Swarm · instant
> rollback · air-gap bundle · expand-contract migrations · feature-flag kill switch) is designed in
> **[release-and-rollback.md](release-and-rollback.md)**.

---

## 0. Principles

- **1 codebase · 2 images** — `backend` image runs as API or worker (differs by command); `frontend` image
  has 2 targets (`dev` = Vite hot-reload · `prod` = nginx static).
- **config split across 3 files** (deploy-separable; each component carries its own):

  | File | Owner | Loaded by |
  |---|---|---|
  | `Backend/.env` | backend stack + DB/Redis/MinIO creds + secrets | db · minio · redis · backend · worker |
  | `.env.ai` | LLM/embedding provider + keys | backend · worker |
  | `Frontend/.env` | `VITE_*` (PUBLIC — baked into bundle, no secrets) | frontend (build-time) |

- **secrets live in `.env*` only** (gitignored) — see [`.env.example`](../../../PiKaOs-Core/Backend/.env.example). prod guard
  (`config.production_violations`) **blocks boot** if `ENVIRONMENT=production` while still on dev defaults.

---

## 1. Topology A — one machine, 4 separate stacks (dev default)

One machine, but **split into 4 compose projects with separate networks** (data/backend/ai/frontend) — talking via host
(`host.docker.internal:<port>`) just like truly separate servers. **No more root all-in-one**; this is what `start.bat` does
(and [`stop.bat`](../../../PiKaOs-Core/stop.bat) shuts down all 4). **Windows: double-click [`start.bat`](../../../PiKaOs-Core/start.bat)**;
**Linux: [`./setup.sh`](../../../PiKaOs-Core/setup.sh) once** (docker group + start daemon + copy env templates), then
**[`./start.sh`](../../../PiKaOs-Core/start.sh)** / **[`./stop.sh`](../../../PiKaOs-Core/stop.sh)** — same 4-stack flow via `systemctl`+`xdg-open` instead of Docker Desktop.
The order it runs:

```bash
# copy templates once: Backend/.env.example→Backend/.env · .env.ai.example→.env.ai · Frontend/.env.example→Frontend/.env
# 1) DATA — db · redis · minio (publish 5432/6379/9000 to host)
docker compose -p pikaos-data -f deploy/docker-compose.data.yml up -d --wait
# 2) BACKEND — FastAPI :8000 (sim.yml = dev overlay: host.docker.internal URLs + UVICORN_RELOAD + bind-mount)
docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml up -d --build --wait backend
# 3) AI — arq worker (Ollama opt-in via --profile localai, §2.8)
docker compose -p pikaos-ai -f deploy/docker-compose.ai.yml up -d --build
# 4) FRONTEND — Vite dev :5173 (hot reload, proxy /api,/ws → host.docker.internal:8000)
docker compose -p pikaos-frontend -f deploy/docker-compose.frontend.dev.yml up -d --build
```
backend/worker point to db/redis/minio as **external** via `host.docker.internal` (sim.yml overlay). frontend = Vite dev
hot-reload (`docker-compose.frontend.yml` = prod nginx static :80, separate — §2 c). Open `http://localhost:5173`.

---

## 2. Topology B — separate server per component

Split because **spec/cost differ** (see §3). Core: app server **points to external datastores** (managed or a separate data server) —
edit the URLs in `Backend/.env`, no code changes. Use the files in [`deploy/`](../../../PiKaOs-Core/deploy):

**a) Datastores** — pick one
- **Managed** (recommended): Postgres (RDS/Cloud SQL) · Redis (ElastiCache/Memorystore) · S3 (instead of MinIO). Pay-as-you-go, low maintenance.
- **Own data server**: run db/redis/minio from [`deploy/docker-compose.data.yml`](../../../PiKaOs-Core/deploy/docker-compose.data.yml) on the data machine, open ports + **secure** (§4).

**b) Backend + Worker server** — point to external datastores in `Backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://USER:PW@<db-host>:5432/pikaos
REDIS_URL=redis://:<pw>@<redis-host>:6379/0      # + REDIS_PASSWORD (auth mandatory in prod)
MINIO_ENDPOINT=<s3-host>   MINIO_SECURE=true      # S3: STORAGE_PROVIDER=s3 + STORAGE_REGION + AWS keys
ENVIRONMENT=production   COOKIE_SECURE=true
JWT_SECRET=<strong>   SECRET_KEY=<strong>          # SECRET_KEY must "match" across all backend+worker (else LLM keys can't be decrypted)
CORS_ORIGINS=https://<frontend-domain>            # the real frontend origin
```
```bash
docker compose -f deploy/docker-compose.backend.yml up -d --build           # API + worker on one machine
# or split further: ... up -d --build backend   (API machine)  |  ... up -d --build worker  (AI machine)
```

**c) Frontend server** — nginx static, proxy /api,/ws to backend (same-origin, no CORS needed on this side):
```bash
BACKEND_URL=https://api.example.com docker compose -f deploy/docker-compose.frontend.yml up -d --build
```
or skip the server entirely: build static and push to **CDN/S3** (`docker build --target prod` → extract `/usr/share/nginx/html`,
or `npm run build` → `dist/`), point the API at the backend URL.

> **Does the AI server (worker) talk to backend via API?** **No** — the worker is an arq consumer talking via a **shared Redis queue +
> Postgres**, not HTTP. frontend↔backend = API + JWT (user login) already. **No new inter-service API/key to write.**

### 2.5 Managed datastores (Supabase / Upstash / S3) — switch via env, no code changes

> **Supabase = managed Postgres → connect via `DATABASE_URL` (Postgres protocol), not the REST API.** Supabase's
> PostgREST/SDK is meant for frontend/serverless to call the DB directly — our backend already has SQLAlchemy + Alembic + repository +
> raw-SQL pgvector, so connecting to Postgres directly is better (don't rewrite to REST = throwing away the whole data layer).

| Switch to managed | Edit in `Backend/.env` |
|---|---|
| **Postgres** (Supabase / RDS / Neon) | `DATABASE_URL=postgresql+asyncpg://USER:PW@<host>:5432/postgres` |
| **Redis** (Upstash / ElastiCache) | `REDIS_URL=redis://:<pw>@<host>:6379/0` + `REDIS_PASSWORD` |
| **Object storage** (S3 / Supabase Storage) | `STORAGE_PROVIDER=s3` · `MINIO_ENDPOINT=<host>` · `MINIO_SECURE=true` · `STORAGE_REGION` + keys |

- **pgvector on Supabase:** enable the `vector` extension (dashboard / `create extension`) — migration `0005` runs normally.
- **Connection mode:** **direct / session pooler (5432)** connects fine. With the **transaction pooler (6543)**, asyncpg
  prepared statements break → must set `statement_cache_size=0` (add that config option then) or avoid it and use the session pooler.
- **Same Docker host but DB external:** point `DATABASE_URL` at Supabase → backend uses Supabase immediately. The backend stack
  ([`deploy/docker-compose.backend.yml`](../../../PiKaOs-Core/deploy/docker-compose.backend.yml)) has no local infra already
  (db/redis/minio = separate `pikaos-data` stack) → just **don't bring up `pikaos-data`** and the switch is clean, no local db running idle.

### 2.6 Simulate split on one machine (rehearse topology B before a real deploy)

§1 (start.bat) is already a dev split — this section is a manual recipe to prove the env-driven switch + verify per stack.
backend+worker see db/redis/minio as **external** via `host.docker.internal` (mimicking RDS/ElastiCache/S3 connected by
URL, not a compose-network sibling). overlay = [`deploy/docker-compose.sim.yml`](../../../PiKaOs-Core/deploy/docker-compose.sim.yml)
= the **dev overlay** of the backend stack: overrides `DATABASE_URL`/`REDIS_URL`/`MINIO_ENDPOINT` → `host.docker.internal` (via
`environment:`, which wins over `env_file`) **+ bind-mount + `UVICORN_RELOAD` (hot reload) + `extra_hosts: host-gateway`**. **No code changes.**

```bash
# 1) DATA stack — separate project/network, publish 5432/6379/9000 to host
docker compose -p pikaos-data -f deploy/docker-compose.data.yml up -d --wait
# 2) BACKEND stack — datastore points to host.docker.internal (external) + hot reload
docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml up -d --build --wait backend
# 3a) FRONTEND (dev — Vite :5173 hot reload, proxy → host.docker.internal:8000)  ← default
docker compose -p pikaos-frontend -f deploy/docker-compose.frontend.dev.yml up -d --build
# 3b) or rehearse prod frontend: nginx static :80 (docker-compose.frontend.yml, must pass BACKEND_URL)
# BACKEND_URL=http://host.docker.internal:8000 docker compose -p pikaos-frontend -f deploy/docker-compose.frontend.yml up -d --build
```
**verify:** `curl localhost:8000/api/health` → `{"db":"ok","redis":"ok","minio":"ok"}` · SPA `curl localhost:5173/` = 200 ·
proxied `curl localhost:5173/api/health` = 200 · `/api/storage/status` `endpoint` shows `host.docker.internal:9000 reachable:true`.
**shut down:** `docker compose -p pikaos-{frontend,ai,backend,data} down` (one at a time) — or [`stop.bat`](../../../PiKaOs-Core/stop.bat).

> ✅ verified 2026-06-18: networks genuinely separate — `pikaos-backend_default` has no db/redis/minio (they're external),
> migrate+seed ran against external Postgres successfully, login + RBAC + storage all passed across the network.

### 2.7 Prod-mode on docker (the real thing — production config on one machine)

Promote §2.6 from dev → **production**: `ENVIRONMENT=production` + real strong secrets + **Redis auth** +
`COOKIE_SECURE=true`. prod guard (`config.production_violations`) **blocks boot** if still on dev defaults (checks
JWT/SECRET_KEY ≥32 · cookie_secure · seed_password · minio_secret_key · redis_url has a password). secrets live in
`deploy/.env.prod` (**gitignored**; template [`.env.prod.example`](../../../PiKaOs-Core/deploy/.env.prod.example)); overlays carry **no secrets**,
referencing `${VAR}`: [`prod.data.yml`](../../../PiKaOs-Core/deploy/docker-compose.prod.data.yml) (overlay on `docker-compose.data.yml`,
data uses the prod password) + [`prod.backend.yml`](../../../PiKaOs-Core/deploy/docker-compose.prod.backend.yml) (backend/worker prod env). **Don't touch dev `Backend/.env`** → the existing `start.bat` stays unbroken.

```bash
cp deploy/.env.prod.example deploy/.env.prod          # fill in real secrets: python -c "import secrets;print(secrets.token_hex(32))"
docker compose -p pikaos-data down -v                  # ⚠ wipes the volume — Postgres bakes the password only at first init
# 1) DATA (prod creds) — overlay on data.yml (no more root all-in-one)
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.data.yml -f deploy/docker-compose.prod.data.yml -p pikaos-data up -d --wait
# 2) BACKEND (prod-mode; boot fails = guard caught it → check the log)
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.backend.yml -f deploy/docker-compose.prod.backend.yml -p pikaos-backend up -d --build
# 3) FRONTEND (prod nginx static)
BACKEND_URL=http://host.docker.internal:8000 docker compose -p pikaos-frontend -f deploy/docker-compose.frontend.yml up -d --build
```
**verified 2026-06-18:** clean boot (log "Application startup complete" = guard passed) · `/api/health` ok ·
Redis `NOAUTH` if no pw / `PONG` if set · login(seed) 200 + cookie `Secure; HttpOnly; SameSite=lax` ·
`/me` 27 perms · storage external `reachable:true`.

> **⚠ HTTPS:** `COOKIE_SECURE=true` = the refresh cookie is sent over HTTPS only. On `http://localhost` **access-token login
> works** (token is in the JSON body), but the **refresh round-trip needs TLS in front** (reverse proxy / LB) — real prod
> already has HTTPS. This is correct prod behavior, not a bug. On real cloud → put TLS termination in front of frontend/LB.

### 2.8 Separate AI tier (worker + local Ollama) — keep the local model from starving backend resources

The worker (arq: agent loop + RAG ingest) is the **AI tier**. Reason to split the box: running a **local model server (Ollama)** is
heavy on CPU/GPU/RAM — on the same box as the API it steals resources → backend slow/timeout. The worker talks to backend via a **shared Redis
queue + Postgres, not HTTP** → splitting it out needs no inter-service API/key. The file [`deploy/docker-compose.ai.yml`](../../../PiKaOs-Core/deploy/docker-compose.ai.yml)
= worker + Ollama (Ollama sits behind the `localai` compose profile = opt-in; not loaded by default, since you "might" run local AI).

The topology becomes **4 projects**: `pikaos-data · pikaos-backend` (API only) `· pikaos-ai` (worker[+ollama]) `· pikaos-frontend`.
Run backend **without the worker** (`... -p pikaos-backend up -d backend`), then bring up AI separately:
```bash
# worker only (provider=stub/api — not running a local model yet)
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.ai.yml -p pikaos-ai up -d --build
# enable real local AI: + Ollama in the same box (worker → http://ollama:11434)
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.ai.yml -p pikaos-ai --profile localai up -d
docker compose -p pikaos-ai exec ollama ollama pull llama3.2:1b   # then set LLM_PROVIDER=ollama in .env.ai
```
> ✅ verified 2026-06-18 (cross-stack): upload doc (backend) → enqueue Redis (data) → **worker(pikaos-ai)** pulls the job
> across stacks (arq `clients_connected`, log `ingest_document(...) ● done — 2 chunks`) → writes pgvector (data) → search 2 hits.
> AI tier genuinely separate by network/project. On real cloud = this box is the machine with the GPU (see cost §3 "Worker — local Ollama").

---

## 3. Component sizing + cost (machine planning)

| Component | workload | rough spec | cost/month* | scale |
|---|---|---|---|---|
| Frontend | static JS | CDN / S3 (no server) | ~$0–5 | CDN |
| Backend API | FastAPI async, I/O-bound | 1–2 vCPU · 2–4GB | ~$10–40 | horizontal (stateless + LB) |
| Worker — **API LLM** | orchestrate, compute at the provider | 1 vCPU · 1–2GB | ~$5–20 | per queue |
| Worker — **local Ollama** | runs the model itself | GPU / 16–32GB RAM | **~$100–1000+** | most expensive |
| Postgres (managed) | — | small | ~$15–50 | — |
| Redis (managed) | — | small | ~$10–30 | — |
| MinIO→S3 | pay-per-GB | — | ~$1–5 (small) | — |

*Very rough, depends on cloud/region. **Biggest cost variable = AI strategy** (local Ollama expensive/GPU vs API provider worker cheap,
paid per-token) — switchable at `.env.ai` `LLM_PROVIDER`, no code changes. Start cheap with API LLM, move to local once it pays off.

---

## 4. Production checklist (before exposing)

- [ ] `ENVIRONMENT=production` + `COOKIE_SECURE=true` (behind HTTPS)
- [ ] 🔒 `JWT_SECRET` · `SECRET_KEY` (≥32 chars, unique; SECRET_KEY matches across all backend+worker) · `SEED_PASSWORD` · `POSTGRES_PASSWORD` · `MINIO_SECRET_KEY` — changed from dev defaults (else the guard blocks boot)
- [ ] **Redis has a password** (`REDIS_PASSWORD` + embedded in `REDIS_URL`) — prod guard enforces it; **never expose Redis without auth across the network**
- [ ] datastores (db/redis/minio) lock the network so only the app server can reach them + TLS
- [ ] `CORS_ORIGINS` = the real frontend origin
- [ ] Ollama (if local): `LLM_BASE_URL` points to the real AI server (not `host.docker.internal`)
- [ ] backend prod: no `UVICORN_RELOAD`; set `WEB_CONCURRENCY` (uvicorn workers)

---

## 5. Status (Jun 2026)

✅ config split across 3 files · Redis auth (optional in dev/mandatory in prod) · frontend prod image (nginx) · per-role deploy files · simulated split-deploy passed — dev (§2.6 `sim.yml`) + **prod-mode (§2.7 `.env.prod`+prod overlays, verified: guard passed/Redis auth/Secure cookie)** + **separate AI tier (§2.8 `ai.yml`, worker+Ollama-profile, cross-stack ingest verified)**.
🟡 Not yet done: TLS termination in front of frontend (refresh cookie needs HTTPS) — add when going to real cloud.
🟡 Not yet done: automated provisioning (IaC/k8s manifests) · CI/CD per component — add once a real cloud is chosen.
> **Planning a cloud move?** AWS hosted topology + the **data migration** (MinIO→S3, Postgres→RDS, Redis, secrets) + capacity ceilings are in **§6** below — written ahead of time, kept updated as the move approaches.

---

## 6. Topology C — AWS cloud (planned · running on own machine today)

> **Living section — forward plan.** Today PiKaOs runs on an own machine (Topology A/B). This records
> **how the move to AWS works so it's ready when needed** — what each piece maps to, and (the part that
> needs real care) **how the data travels**. Update it as the move firms up. The deploy/rollback
> *mechanism* on AWS is owned by [release-and-rollback.md](release-and-rollback.md) (§2 hosted = managed).
> **Nothing here requires a code change** — the stack is already env-/config-driven (§0, §2.5); AWS is
> just a different set of URLs + a managed orchestrator.

### 6.1 Component map (own machine → AWS)

| Today (own machine) | AWS (hosted) | Notes |
|---|---|---|
| Frontend nginx static | **S3 + CloudFront** | global CDN; immutable hashed assets long-cache, `index.html` no-cache ([release §4](release-and-rollback.md)) |
| nginx reverse proxy / TLS | **ALB** (+ ACM cert) | routes `/api`→backend · `/`→FE · `/ws`→backend (WebSocket) |
| backend (FastAPI) + worker (arq) | **ECS Fargate** (or EKS) | stateless → autoscale; worker = its own service, scales independently. Same images. |
| Postgres + pgvector (`pikaos-data`) | **RDS / Aurora PostgreSQL** | enable the `vector` extension; **RDS Proxy** for pooling; read replicas for read scale |
| Redis (`pikaos-data`) | **ElastiCache for Redis** | arq queue + WS pub/sub + caches; cluster mode when it grows |
| MinIO (`pikaos-data`) | **S3** | storage layer is **already pluggable** (`STORAGE_PROVIDER=s3`) — env flip, no code |
| secrets in `.env*` | **Secrets Manager / SSM** | inject as env into the task; prod guard (`production_violations`) still applies |
| `start.sh` / Swarm bundle | **ECS rolling + CodeDeploy blue/green** | native zero-downtime + instant rollback (the AWS form of [release §2/§6](release-and-rollback.md)) |

Deploy = ECS service update (CodeDeploy blue/green) · DB migration = a one-off **ECS task** running
`alembic upgrade head` (single-runner, [release §3](release-and-rollback.md)) before the new revision
takes traffic, with an RDS snapshot taken first.

### 6.2 Moving the data (do this once, at cutover)

The switch of *where the app reads* is env-only (§2.5). The one-time job is **copying the bytes** across:

- **Object storage (MinIO → S3) — the bulk of the data.** Markdown-as-truth, original-file Refs
  (`source_object_key`), and every upload live as objects keyed by `object_key`. Move them with one
  bucket sync — `aws s3 sync` / `mc mirror` / `rclone` from the MinIO bucket → the S3 bucket (same keys)
  — then flip `STORAGE_PROVIDER=s3` + endpoint/region/keys. **Keys are unchanged**, so the `documents`
  rows still resolve. Re-run the sync just before cutover to catch new uploads.
- **Postgres → RDS/Aurora.** `pg_dump -Fc` the local DB → enable `vector` on the target → `pg_restore`
  → `alembic upgrade head` (confirms it's at head) → point `DATABASE_URL` at RDS. The pgvector HNSW
  index rebuilds on restore. (This is the same `pg_dump` snapshot the upgrade flow takes anyway —
  [release §3](release-and-rollback.md).) For near-zero-downtime, AWS **DMS** can replicate live then cut over.
- **Redis → ElastiCache — nothing to migrate.** Redis holds only **ephemeral** state (arq job queue,
  WS pub/sub, perms cache, refresh-token denylist) — not durable truth. Drain in-flight worker jobs,
  then point `REDIS_URL` at ElastiCache. Side effect: the refresh-token denylist resets → some users
  re-login once. Acceptable at cutover.
- **⚠️ Secrets + the crypto coupling (easy to get wrong).** `SECRET_KEY` derives the Fernet key that
  **encrypts the LLM API keys stored in the DB** (`llm_connections.api_key_enc`, [data-model.md](data-model.md)).
  If you move to a *new* `SECRET_KEY`, those encrypted keys **can't be decrypted** → re-enter the LLM
  connections in the UI after the move. So either **carry the same `SECRET_KEY`** to Secrets Manager
  (simplest) or plan to re-add LLM keys. `SECRET_KEY` must also still **match across backend + worker**
  (§2.4). `VITE_*` are public (baked into the FE bundle) — never put a secret there.

### 6.3 Capacity / scaling on AWS (budget no object, but perf must hold)

Sizing per component is in [§3](#3-component-sizing--cost-machine-planning); the *ceilings* (where adding
servers stops helping) — confirm with a load test ([improvement-plan F5](../process/improvement-plan.md)):

- **Scales horizontally ≈ free** (add instances behind ALB): the stateless **backend/FE** and **read**
  paths (read replicas). The I/O-bound async API is built for this (lessons: *bottleneck is I/O, not CPU*).
- **First real ceiling = the single Postgres *write* primary.** Aurora (large instance) + RDS Proxy +
  read replicas push it to ~low-thousands write-TPS / tens-of-thousands active B2B users. Past that, the
  escape hatch is already in the design: **shard per tenant / split a DB on bounded context**
  ([database-design.md](database-design.md)) + **split a module into its own service**
  ([modularity.md](modularity.md)) — the modular monolith is meant to grow this way without a rewrite.
- **Agent/LLM throughput is bounded by the provider, not servers** — LLM rate limits + token cost cap
  concurrent agent runs; scale with multiple provider keys/providers, a local-GPU worker tier, and the
  arq queue absorbing bursts. "Unlimited server budget" does not raise this ceiling.
- **WebSocket worklog** scales with app-node count + Redis pub/sub; ElastiCache cluster mode + sticky
  routing when connection counts get large.

---

## 7. Mixed / hybrid topologies — pick each component independently (use cases)

> **Living section.** Because every datastore is selected by **env, not code** (§0, §2.5), the four
> pieces — **compute · Postgres · Redis · object storage** — are chosen **independently**. You are not
> forced into "all local" or "all cloud": any mix is valid (e.g. **MinIO stores the files locally while
> Postgres lives on AWS RDS**). Below are the realistic combinations, why you'd pick each, and the one
> rule that decides whether a mix performs.

### 7.1 The rule that governs every mix: co-locate compute with Postgres

Not all links are equally chatty:

- **backend ↔ Postgres = the chattiest link** — many small queries per request (RBAC, repos, pgvector).
  If the DB is across a WAN, **every query pays that round-trip** and the app feels slow. → **Put the
  backend/worker in the same place/region as Postgres.** "Compute local + DB on AWS" only performs if
  the latency is small (same region / direct link); over the open internet it degrades fast.
- **backend ↔ object storage = coarse, few round-trips** — uploads/downloads use **presigned URLs**, so
  the *browser* talks to MinIO/S3 directly and the backend isn't in the hot path. → **Storage can sit
  remotely far more comfortably than the DB.** (Caveat: the storage **endpoint must be reachable by the
  browser** — a local MinIO must be exposed/proxied with TLS; S3/CloudFront is public by default.)
- **backend ↔ Redis = frequent but tiny + same datacenter assumed** — keep Redis near compute too.

**Takeaway:** keep **compute + Postgres + Redis together**; let **object storage** be the piece you most
freely place elsewhere. That is exactly why "**MinIO local + DB on AWS**" is backwards for latency unless
the backend is also on AWS — whereas "**DB local + files on S3**" performs fine.

### 7.2 Use-case matrix

| # | Use case | Compute | Postgres | Redis | Object storage | Why pick it | Watch out |
|---|---|---|---|---|---|---|---|
| 1 | **All-local / air-gap** (today) | own | own | own | **MinIO** | dev · on-prem · data residency · cheapest · offline | you own HA + backups (pre-upgrade `pg_dump`, §2.7) |
| 2 | **MinIO files + DB on AWS** *(your example)* | own | **RDS** | own | **MinIO** | files stay local (big / bandwidth / residency); DB gets managed HA/backups | ⚠️ **§7.1** — backend↔RDS over WAN is slow; only OK if same region/direct link, else move compute to AWS too. Secure the DB link (TLS + IP allowlist / VPN). |
| 3 | **DB local + files on S3** | own | own | own | **S3** | structured data must stay on-prem (compliance) but files want S3 durability/CDN | ✅ performs well (chatty DB is local); presigned URLs come from public S3 |
| 4 | **Compute local + all data managed** | own | **RDS** | **ElastiCache** | **S3** | keep app control/cost, offload all data ops | ⚠️ §7.1 — co-locate compute with the DB region or every request pays WAN latency |
| 5 | **Full AWS hosted** (SaaS target) | **ECS** | **RDS/Aurora** | **ElastiCache** | **S3** | production hosted (§6); everything co-located in one region | — |
| 6 | **On-prem app + customer's managed DB** | customer box | their RDS/Supabase | local | **MinIO** | customer keeps files on their server, points at a managed DB they trust | same §7.1 latency rule; Supabase = **session pooler** or `statement_cache_size=0` (§2.5) |
| 7 | **Split AI tier** (any of the above) | + cloud worker near the LLM | — | shared | — | run the arq worker close to the LLM provider / a GPU box; talks via shared Redis+Postgres, **no API key** (§2.8) | worker still needs low-latency Postgres+Redis (it writes run_steps) |

### 7.3 How to set + verify any mix (no code change)

- **Set:** flip the per-component env in `Backend/.env` (the exact vars are in [§2.5](#25-managed-datastores-supabase--upstash--s3--switch-via-env-no-code-changes)) — `DATABASE_URL` (Postgres), `REDIS_URL`+`REDIS_PASSWORD` (Redis), `STORAGE_PROVIDER`+`MINIO_ENDPOINT`/region/keys (storage). `SECRET_KEY` must stay constant across the move (decrypts `llm_connections` keys — §6.2) and match across backend+worker.
- **Verify:** `GET /api/health` returns `{"db","redis","minio"}` each `ok` for whatever each points at; `GET /api/storage/status` shows the active storage endpoint + `reachable` without leaking secrets. So a mix is provable the same way the §2.6 simulation is.
- **Rule of thumb:** keep the green-path latency budget by co-locating compute+DB+Redis (§7.1); treat object storage as the freely-relocatable piece.
