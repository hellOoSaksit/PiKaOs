---
title: System Architecture Review + Risks
type: architecture
status: design
keywords: [review, risks, idempotency, rbac, websocket security, designed vs built, gaps, engine, hermes]
related: [./system-design.md, ./risk-mitigation.md, ../pikaos-dev-rules.md, ../README.md]
summary: >
  Critical review of the whole-system design — strengths, the designed-vs-built gap, and
  top risks (replay/idempotency, WS leakage, server-side RBAC). Read before building the engine.
updated: 2026-06-20
---

# PiKaOs — System Architecture Review + Risks

> Advisory document. Read alongside [`system-design.md`](system-design.md) (the target blueprint),
> [`../../../CLAUDE.md`](../../../CLAUDE.md) (project rules) and [`../../../PiKaOs-Core/README.md`](../../../PiKaOs-Core/README.md).
> Perspective: a critical review of the whole-system design — strengths, gaps, risks, and decisions worth revisiting.
> Every claim references the actual code as of the review date (2026-06-12). Status: ✅ exists · 🟡 designed · ⚪ future.

---

## 1. Executive Summary

`system-design.md` is a **high-quality, well-considered** blueprint — arq + step-persistence,
HERMES as a reactive state-machine, and a multi-provider LLM adapter are all choices well-suited to the current scale,
with a decision log that fully explains the "why". The point to stress is that **the gap between what is designed and what is actually built is very wide**,
and the blueprint still **does not cover several practical risks** that will bite once the engine starts running for real.

Actual status, in summary:

| Layer | Actual status | Evidence |
|---|---|---|
| Frontend | ✅ Very complete — 32 screens, full UI kit, i18n 5 packs | `Frontend/src/` |
| Auth | ✅ Working — JWT + refresh in Redis + argon2 | `routers/auth.py` (login/refresh/logout/me/forgot-password) |
| Compare (outbound) | ✅ Working | `routers/compare.py` + [`../COMPARE.md`](../features/compare.md) |
| Real-time | 🟡 Scaffold only — single broadcast channel | `routers/ws.py` (`CHANNEL = "pikaos:ws"`) |
| Agent engine / HERMES | 🟡 Designed, no code yet | No router/service/table/worker |
| RBAC server-side | ⚪ Coarse — single role | `deps.py:require_role` |
| RAG | ⚪ Only a `documents` table that is unused | `models.py:Document` |

**3 key takeaways:**
1. **The #1 risk is not what hasn't been built yet, but "resume/replay with side-effecting tools"** — the invariant
   in the blueprint says "steps are idempotent", but tools like CMD / HTTP POST / sending LINE **are not idempotent**;
   replaying after a worker crash will fire them twice (§4.1).
2. **`ws.py` currently leaks data across users** — every logged-in client receives every message on a single channel. Must be fixed before building any feature on WS (§4.3).
3. **RBAC is still enforced client-side only** — once real endpoints are added, the system will be "secure in appearance only" until `require_perm` exists server-side (§4.2).

---

## 2. What Is Designed Well (keep it, don't change)

- **arq on Redis instead of Celery/Temporal** — fits the scale and the existing async stack, adds no infra; the reasoning in the decision log is sound.
- **Step-persistence in `run_steps`** — gives both the worklog (product) and replay (technical) from a single table; a design that "kills two birds".
- **HERMES = reactive state-machine** that does not hold a worker while waiting on children — the correct pattern for restart-tolerant orchestration.
- **Multi-provider adapter from the start** — separates the agent loop from the vendor SDK, reducing future technical debt.
- **"Status set only by AI/runner"** is a sharp product invariant that helps prevent state bugs.
- **Design doc + ER diagram + build order** existed before writing code — reduces over-engineering risk and makes a review like this possible.

---

## 3. The "designed vs actually built" gap (reality check)

The blueprint discusses many things as if they were near done, but the dependency level hasn't started. Points to get aligned on:

| Blueprint says | Reality in code | Impact |
|---|---|---|
| "Add arq worker (same image, different entrypoint)" | `requirements.txt` **has no `arq`**; compose has no worker service | Item 1 of the build order hasn't actually started |
| "LLM provider adapter: OpenAI · Anthropic · Local" | **No vendor SDK in requirements**; no key in `config.py` | Must lay down secrets + adapter before anything else |
| Tables `runs/run_steps/subtasks/agents/...` | Only `users` + `documents` exist (0001_init) | Must write a whole new set of migrations |
| "per-quest WS channels" | `ws.py` is a single broadcast channel `pikaos:ws` | Must refactor first (and has a security problem §4.3) |
| RAG: `documents.embedding vector(1536)` | Table exists but **no read/write code**; no embedding lib | Pure placeholder |
| Fine-grained RBAC (`PERMISSIONS`/`ROLE_PERMS`) | Server-side has only `require_role(*roles)` using a single `User.role` | Security gap §4.2 |

> Proposal: in `system-design.md`, add a status column making it clear what is "designed but has no dependency yet"
> to prevent the misconception that all that remains is wiring it up.

---

## 4. Architectural risks (ordered by severity)

### 4.1 [P0] Resume/replay with side-effecting tools — system correctness

Blueprint §4 states the invariant: *"on worker restart, a run stuck in `running` reconstructs its conversation
from `run_steps` and continues at the next step (steps are idempotent)."*

Problem: **an LLM call can indeed be idempotent, but a side-effecting tool call is not** — if a worker crashes
*after* firing `HTTP POST`/`sending LINE`/`running CMD` but *before* persisting `tool_result`, the resume will **fire twice**
(double charge, duplicate message, duplicate file).

Proposal:
- Record the step in **2 phases**: write `tool_call` (intent + `idempotency_key`) *before* acting, then write `tool_result`.
  On resume, if a `tool_call` without a `tool_result` is found → **don't blindly re-fire**: decide based on the tool type.
- Classify tools as **safe-to-retry** (read/idempotent) vs **at-most-once** (side-effect). For the latter, attach an
  `idempotency_key` and send it to providers that support it, or mark as `needs_human_confirm` instead of auto-retrying.
- The doc should clearly address **at-least-once vs exactly-once** for arq (arq is at-least-once).

### 4.2 [P0] RBAC enforced client-side only — security

`deps.py` has `require_role(*roles)` that compares a single `user.role`, but the product's real permission model lives on the frontend
(`data-users.jsx`: `PERMISSIONS`, `ROLE_PERMS_SEED`, `user_perms` override). This means all fine-grained permissions are currently **just UX**
— a user calling the API directly can bypass them all. This risk hasn't exploded yet because no endpoint protecting real data exists,
but it becomes a hole the instant CRUD for agents/quests/documents is added.

Proposal: move §10 (RBAC server-side) **up, ahead of** opening the first data-write endpoint, not at the end of the build order.
Make `require_perm("quest.create")` a dependency and have `/api/auth/me` return the effective permission set.

### 4.3 [P0] WebSocket leaks data across users + token in URL — security/privacy

`ws.py` today: subscribes to a single channel `pikaos:ws` and **relays every message to every client**. Once it starts publishing
real run/quest events, user A will see user B's worklog. In addition, the token is passed via the **query string** (`?token=...`),
which is often logged by proxies/servers.

Proposal:
- Move to a **per-quest channel** (`quest:<id>`) as §6 designs — but add **authorization**: verify the user
  has permission to see that quest before subscribing (not merely authenticated).
- Send the token via a **subprotocol header** or the first message after connect instead of the query string; if unavoidable, use a short-lived single-use token for WS.
- Add **history replay on subscribe**: a client that joins mid-stream must load the prior `run_steps`, or the timeline is lost (see §4.6).

### 4.4 [P1] Token quota race — correctness/cost

`users` has `quota`/`used` and §4 says the loop is bounded by quota. But if a single user has multiple concurrent runs
(HERMES spawns many children), reading `used` and adding later will **race and exceed the quota**.

Proposal: use **atomic reservation** — reserve quota in Redis (`DECRBY`) before starting a step, then reconcile against the real total afterward;
or `UPDATE ... SET used = used + :n WHERE used + :n <= quota RETURNING` in Postgres to guard with a DB constraint.

### 4.5 [P1] HERMES finalize race (double-finalize) — correctness

`hermes_advance` is enqueued per child completion and checks "are all children terminal yet?". If several children finish
close together, multiple `hermes_advance` will see "all done" simultaneously → enqueue `hermes_finalize` twice.

Proposal: make the transition atomic — `UPDATE runs SET status='finalizing' WHERE id=:id AND status='running' RETURNING`;
only the one that gets a row back enqueues finalize; or use a Redis lock per orchestration. This rule should be written clearly into §5.

### 4.6 [P1] Cancel/timeout "between steps" is not enough — correctness/cost

§4 says cancel checks "between steps". But an LLM call or a tool that hangs for a long time **cannot be cancelled mid-flight** and keeps burning time/money.

Proposal: add a **per-step timeout** (LLM and tool separately) + actually cancel the task when exceeded; add a **max wallclock per run**.
Specify defaults in `config.py` (the `compare_*` pattern is already a good model).

### 4.7 [P1] Data integrity — no FK/cascade yet

`Document.owner_id` is a bare `UUID` with **no ForeignKey** to `users` (see `models.py`/`0001_init`). The planned tables
(`runs.parent_run_id`, `subtasks.deps[]`, `child_run_id`, etc.) have more complex relationships; without FK + `ON DELETE`
there will be orphan rows and a worklog pointing to a run that has disappeared.

Proposal: define FK + cascade/`SET NULL` policies fully in the new tables; consider a self-FK on `runs.parent_run_id`
and an index on `(run_id, seq)` of `run_steps`, `(orch_run_id)` of `subtasks`. `deps[]` being an array referencing subtasks
within the same set — should have check/validation since FK arrays are hard to enforce.

### 4.8 [P2] Observability of the agent loop — not mentioned at all yet

The blueprint has no tracing/metrics/logging section. A fan-out multi-agent system will be **very hard to debug without a trace**
(which run called which tool, used how many tokens, spent time where).

Proposal: add an "Observability" section — `run_id`/`parent_run_id` as a correlation id on every log line,
metrics per provider/tool (latency, tokens, error rate), and consider OpenTelemetry around the agent loop. `run_steps`
already provides a business-level trace; only the infra level is missing.

### 4.9 [P2] Cost/rate-limit per LLM provider — not mentioned yet

Both deep-compare and the agent loop are fan-out workloads. Without a **global rate-limit per provider** they will hit 429/get throttled,
or the bill spikes. Proposal: add a token-bucket per provider in Redis + backoff in the adapter; set a platform-level
concurrency ceiling (the `compare_max_concurrency` pattern is there to copy).

---

## 5. Decisions worth revisiting (challenge the decision log)

| Original decision | Comment | Proposal |
|---|---|---|
| `documents.embedding vector(1536)` | Hardcodes the OpenAI text-embedding dimension — **conflicts with the multi-provider stance** (local/other vendors have different dimensions) | Store `embedding_model` + `dim` per row; or pick one dim and normalize every provider into it; document the reason in §8 |
| Streaming = "per-step events" | Fits for now, but for a live worklog UX users will want to see tokens stream | Keep for now, but design the event schema to **allow token-delta** later without a breaking change |
| arq at-least-once | Correct for throughput but clashes with §4.1 (side-effect) | State clearly that delivery is at-least-once and tie it to the tool idempotency policy |
| "HERMES multi-agent from the start" | Agree product-wise, but adds race complexity (§4.5) | Start with a DAG limiting fan-out/depth + a failure policy before opening it up |
| Stub LLM in item 1 | Very good (isolates engine risk from provider) | Keep it, and add a "stub tool" that simulates a side-effect to test resume (§4.1) early |
| RBAC at the end of the build order (§11 item 6) | Risky — data-write endpoints come first | Push RBAC server-side ahead of the first data-write endpoint (§4.2) |

---

## 6. Things the blueprint doesn't mention at all (sections to add)

1. **Secrets management** — §9/§12 raise the API key question but have no answer yet. Currently `jwt_secret` defaults to
   `"change-me-in-.env"` and `cookie_secure=False`. Need a prod checklist (enforce a real secret, secure cookie,
   provider key storage not in the prompt).
2. **API-level idempotency keys** — `POST /quests/{id}/dispatch` should accept an idempotency key to prevent duplicate dispatch from rapid clicks/retries.
3. **Async worker testing strategy** — `tests/` currently hits a live server (good for routers), but the agent loop/HERMES
   needs a test harness that runs arq jobs directly + a fake provider + asserts `run_steps`. A guideline should be written.
4. **Migration of RBAC from client → server** — seed data lives in `data-users.jsx`; a plan is needed to migrate it so values match
   (note the seed email is the old `@guildos.io` — watch for drift between the frontend slug `u_<username>` and the server).
5. **Backpressure/event size** — if a tool returns a large result (e.g. HTML from compare/render, up to ~1.5MB), don't stuff it into WS/`run_steps`
   whole — store it in MinIO and reference the object key.
6. **Multi-tenancy/isolation** — there is currently no workspace/tenant concept; if multiple organizations are coming, decide the scope
   of agents/quests/documents per tenant from the schema design onward.

---

## 7. Prioritized recommendations

**P0 — fix/decide before writing even the first line of the engine**
- Write the **tool idempotency + 2-phase resume** policy into §4 (4.1).
- Push **RBAC server-side** (`require_perm`) ahead of the first data-write endpoint (4.2).
- Refactor **WS to per-quest + authz + token not in URL** before building any WS feature (4.3).

**P1 — design fully when laying out the schema/loop**
- Atomic quota reservation (4.4) · atomic HERMES transition to prevent double-finalize (4.5) ·
  per-step/run timeout (4.6) · FK + index + cascade in the new tables (4.7).

**P2 — add before going to production**
- Observability/tracing around the agent loop (4.8) · global rate-limit per provider (4.9) ·
  decouple embedding dim from provider (§5) · prod secrets checklist (§6.1).

**Quick wins (doable immediately, low cost)**
- Add the "designed but no dependency yet" status column in `system-design.md` (§3).
- Set `cookie_secure=True` via env in prod and add an assert that `jwt_secret != "change-me-in-.env"` at boot when `environment=production`.
- Add a `ForeignKey` to `documents.owner_id` in the next migration (close the integrity debt while the table is still empty).

---

## 8. Conclusion

The blueprint is strong enough to start on right away — the technology choices are appropriate and well-justified. The work to do next is **not to rework the design,
but to plug the 3 practical risks (resume/side-effect, RBAC server-side, WS isolation) before starting to build the engine**,
and to add the missing sections (observability, rate-limit, secrets, idempotency). Following the P0 → P1 → P2 order yields a system that is
**correct and secure from the engine's very first commit** rather than patched later once it's running real money and real data.

> Recommended next step: if you agree with all three P0 items, I can help draft **improved versions of §4.1 (idempotency/resume) and §6 (WS)**
> to merge back into `system-design.md` right away.
