---
title: Risk Mitigation Design
type: architecture
status: design
keywords: [risk mitigation, idempotency, resume, 2-phase, rbac, websocket, permissions, build order, p0]
related: [./design-review.md, ./system-design.md, ./data-model.md, ../pikaos-dev-rules.md]
summary: >
  Concrete mitigations for every risk in design-review (idempotency/resume, server-side RBAC,
  per-quest WS) plus a revised build order. Read before building the engine.
updated: 2026-06-20
---

# PiKaOs — Risk Mitigation Design

> Design document addressing every risk in [`design-review.md`](design-review.md) —
> read alongside [`system-design.md`](system-design.md) (the target blueprint).
> Every proposal references real code as of 2026-06-12. Covers **P0 → P1 → P2 + quick wins**
> and ends with a revised build order (§7).

---

## Current Understanding

- The engine (arq + `runs`/`run_steps`/`subtasks` + HERMES) **has no code yet** — so every design in
  this document can be "designed correctly from the first migration" without refactoring anything existing.
- What actually exists: Auth (JWT+refresh), Compare, a single-channel WS scaffold (`pikaos:ws`, token in query string),
  a coarse `require_role` in `deps.py`, `users`+`documents` tables (no FK), and 25 fine-grained permissions
  living client-side (`data-users.jsx`).
- arq is **at-least-once** — every design below rests on this assumption (a job can always be re-run).

---

## 1. [P0] Tool idempotency + 2-phase resume (review §4.1)

### Observation
The blueprint says "steps are idempotent", but tools with side effects (HTTP POST, LINE, CMD) are not —
a worker crashing after firing a tool but before persisting the result → on resume it **fires again**.

### Recommendation — write steps in 2 phases + classify tools

**(a) Schema** — add to `run_steps`:

| Column | Meaning |
|---|---|
| `status` | `pending` \| `done` \| `failed` (LLM step is written once as `done`; tool step starts at `pending`) |
| `idempotency_key` | `"{run_id}:{seq}"` — deterministic, created before firing the tool |

**(b) Classify tools** — add `effect` to `tools_config.config`:

| effect | Example | Resume policy |
|---|---|---|
| `read` | HTTP GET, codex search, file read | safe to re-fire |
| `idempotent_write` | PUT/upsert, overwrite file at same key | re-fireable + attach `idempotency_key` for providers that support it |
| `side_effect` | payment POST, send LINE/Telegram, run CMD | **at-most-once** — no automatic retry |

**(c) Tool step run order (2 phases)**

```
1. INSERT run_steps (kind='tool', status='pending', idempotency_key, content={intent})  ← before acting
2. fire tool
3. UPDATE step → status='done', content+={result}   then publish event
```

**(d) Resume algorithm** (when a worker reopens a run stuck in `running`):

```
last step = done            → continue loop as normal
last step = pending, effect=read|idempotent_write → re-fire with same key
last step = pending, effect=side_effect           → run.status='waiting_input'
   + notification "tool X may have already run — confirm result / skip / re-fire" (same human-in-the-loop as blueprint §4)
```

**(e) Test from the start** — build order task 1 (stub LLM) should add a **stub tool simulating a side effect**
(write a row into a test table) + a test that kills the worker mid-step and asserts resume does not write twice.

### Alternative Options
- **Temporal/Durable execution** — exactly-once at the framework level. Overkill for now (matches the existing decision log).
- **Transactional outbox** — write intent + work in a single transaction. One level better, but 2 phases + classification is enough at this scale.

### Pros / Cons
- ➕ Fixes system correctness with a 2-column schema + a 1-page rule; uses the existing Postgres.
- ➖ A stuck side_effect tool must wait for human confirmation (slower) — the right trade-off for real money/messages.

### Impact
Change the §4 invariant from "steps are idempotent" → "steps are **replay-safe**: LLM is re-fireable,
tools decide by effect class". This policy must be written back into `system-design.md` §4 before starting engine code.

---

## 2. [P0] RBAC server-side (review §4.2)

### Observation
`deps.py:require_role(*roles)` compares a single `user.role`; the 25 fine-grained permissions (`agent.create` …
`audit.view`) live only in `data-users.jsx` client-side → all of them can be bypassed by calling the API directly.

### Recommendation — move the permission model to the server **before the first data-writing endpoint**

**(a) Tables** (single migration): `roles(key PK, name_th, name_en, system)` ·
`permissions(key PK, grp)` · `role_perms(role_key FK, perm_key FK)` ·
`user_perms(user_id FK, perm_key FK, allow bool)` — per-user allow/deny overrides matching the client's
`USER_PERMS_SEED`. Seed from the values in `data-users.jsx` via `scripts/seed.py` (idempotent per the existing pattern).

**(b) Dependency**:

```python
def require_perm(perm: str):
    async def _checker(user = Depends(get_current_user), db = Depends(get_db)):
        if perm not in await get_effective_perms(db, user):   # role_perms ∪ allow − deny
            raise HTTPException(403, f"missing permission: {perm}")
        return user
    return _checker
# usage: @router.post("/agents", dependencies=[Depends(require_perm("agent.create"))])
```

**(c) Effective perms** cached in Redis `perms:<user_id>` (short TTL, e.g. 60s) + delete the key when
role/override changes — trading freshness for not joining 3 tables on every request.

**(d) `/api/auth/me`** returns `permissions: [...]` — the frontend stops computing from seed and just renders
the set the server sends (remove client-side `resolvePerms` once the migration is done). Watch the drift review §6.4 flags:
the client seed email is `@guildos.io` — make the server the source of truth, map by `username`.

### Alternative Options
- **Casbin / OPA** — an external policy engine. Excessive: the model is role→perms + overrides, plain and simple.
- **Stuff perms into the JWT** — fewer queries but permissions go stale until the token expires + token bloat. Use DB+cache instead.

### Pros / Cons
- ➕ Closes the hole before any real endpoint exists; the model maps 1:1 to the already-designed UI; no new dependency.
- ➖ Adds work before any feature (1 migration + 1 dependency + seed) — far cheaper than fixing it later.

### Impact
Move blueprint §10 from the end of the build order to **step 0** (see §7). Every new endpoint after this
declares its own permissions with `require_perm` — becoming a rule in CLAUDE.md §2.2 (the add-endpoint recipe).

---

## 3. [P0] WebSocket: per-quest channel + authz + token not in URL (review §4.3)

### Observation
`ws.py` currently subscribes to a single channel `pikaos:ws` and relays every message to every logged-in client
(user A sees user B's data), and receives the token via `?token=...`, which ends up in the proxy log.

### Recommendation — refactor into a single subscribe protocol

**(a) Handshake** — open `/ws` with no token in the URL; the **first message** must be
`{"type":"auth","token":"<access JWT>"}` within 5s, else close 4401. (Alternative: send via
`Sec-WebSocket-Protocol` — but first-message is simpler and doesn't clash with proxies.)

**(b) Subscribe + authorize**:

```
client → {"type":"subscribe","quest_id":"..."}
server → check perms: user is owner/room member of the quest (or has perm "quest.view.any")
       → allowed: subscribe Redis "quest:<id>" + reply {"type":"subscribed","quest_id",...}
       → denied: {"type":"error","code":4403}
```
One socket can subscribe to many quests (keep a set per connection); `unsubscribe` releases a channel.

**(c) History replay + gap detection** — every published event has `(run_id, seq)`.
On `subscribed` the server sends a snapshot: the latest N `run_steps` rows from Postgres (ordered by `seq`).
If the client sees a seq jump → it requests `{"type":"backfill","run_id","from_seq"}`. This means opening the page
mid-stream doesn't lose the timeline, and it survives both WS drops and reconnects.

**(d) Large payloads** (review §6.5) — WS events are capped at ~32KB; store large tool results in MinIO
and put the `object_key` in the event instead of the content.

### Alternative Options
- **SSE instead of WS** — simpler on auth headers but one-way; human-in-the-loop needs two-way → keep WS.
- **One-time ticket** (`POST /ws-ticket` → a 30s ticket in the URL) — usable if sending a first-message is
  inconvenient for the client; an acceptable fallback.

### Pros / Cons
- ➕ Closes both the cross-user leak and token-in-URL in a single refactor; already matches blueprint §6, just adding authz+replay.
- ➖ The client (`Frontend/src/lib/`) must write a new WS helper (auth→subscribe→backfill) — extra frontend work.

### Impact
Must be done **before** the engine publishes its first event — otherwise the first feature on WS is the leaking feature.
Fixing `ws.py` now has zero impact because there is no real consumer yet.

---

## 4. [P1] Engine correctness — design it with the first schema

### 4.1 Quota race (review §4.4)
**Recommendation**: enforce at Postgres with a conditional update —
`UPDATE users SET used = used + :n WHERE id=:uid AND (quota IS NULL OR used + :n <= quota) RETURNING used`
0 rows → quota exceeded → run ends `failed("quota_exceeded")`. Call **before** the LLM call with an estimate,
then reconcile with the actual amount after the step (add/subtract the difference).
*Alternative*: reserve in Redis with `DECRBY` — faster but adds a second source of truth; starting at Postgres is enough
(concurrent runs per user are still few). *Impact*: stops multiple HERMES children from breaching the quota.

### 4.2 HERMES double-finalize (review §4.5)
**Recommendation**: make the transition atomic —
`UPDATE runs SET status='finalizing' WHERE id=:orch AND status='running' RETURNING id`
only the `hermes_advance` that gets a row back enqueues `hermes_finalize`. Write this rule into blueprint §5.
*Alternative*: a Redis lock per orchestration — an unnecessary extra piece, since the `runs` row
is already a natural lock. *Impact*: multiple children finishing at once → always finalize exactly once.

### 4.3 Timeout per step / per run (review §4.6)
**Recommendation**: add to `config.py` (following the existing `compare_*` pattern):

```python
run_llm_step_timeout_s: float = 120.0    # per LLM call
run_tool_step_timeout_s: float = 60.0    # per tool call (tool can specify an override in config)
run_max_wallclock_s: int = 3600          # whole run
run_max_steps: int = 50
```
Wrap the step with `asyncio.timeout`; on timeout → step `failed("timeout")` (a stuck tool counts as `pending`
with no result → enters policy §1d). Cancel is checked both between steps **and** via task cancellation during the LLM stream.
*Impact*: stuck runs don't burn unlimited money/time; cancel responds faster, from step-level → second-level.

### 4.4 FK + index + cascade (review §4.7)
**Recommendation** — define this in the migration of the first engine table set:

| FK | Policy |
|---|---|
| `documents.owner_id → users` | `SET NULL` (close existing debt — the table is still empty, so it's free now) |
| `runs.parent_run_id → runs` (self) | `CASCADE` (delete orchestration → children gone) |
| `runs.agent_id / quest_id` | `SET NULL` (a run is history, don't let it vanish with the agent) |
| `run_steps.run_id → runs` | `CASCADE` + **UNIQUE(run_id, seq)** (prevent seq collisions on resume) |
| `subtasks.orch_run_id → runs` | `CASCADE`; `child_run_id` → `SET NULL` |
| `notifications.run_id → runs` | `SET NULL` |

Indexes: `run_steps(run_id, seq)` (from UNIQUE) · `subtasks(orch_run_id)` · `runs(quest_id, status)` ·
`notifications(user_id, read)`. `subtasks.deps[]` can't be enforced by FK → validate in `hermes_plan`
(every dep must be a subtask in the same orchestration + no cycles — do a topological check when writing the DAG).
*Impact*: no orphan rows; replay/worklog always points at things that really exist.

---

## 5. [P2] Before going to production

### 5.1 Observability (review §4.8)
Add an "Observability" section to `system-design.md`: every log line in the worker carries
`run_id`/`parent_run_id`/`quest_id` (structured logging — `logging` + a JSON formatter is enough, no OTel yet);
metrics per provider/tool: latency, tokens, error rate (start from the `run_steps` table, which already has
`tokens`+`created_at` — queryable right away, no new stack needed); add OpenTelemetry later once there really are multiple services.

### 5.2 Rate-limit per LLM provider (review §4.9)
A token-bucket in Redis per provider (`ratelimit:openai` …) checked in the adapter before firing + exponential backoff
on 429. Add `llm_max_concurrency_per_provider` to config (copy the `compare_max_concurrency` pattern).
HERMES limits fan-out: `hermes_max_children: int = 10`, `hermes_max_depth: int = 1` (children don't spawn grandchildren in phase one
— matches review §5, which advises limiting the DAG before opening it up).

### 5.3 Embedding dim (review §5)
Stop hardcoding `vector(1536)` tied to OpenAI: add an `embedding_model: str` column to `documents`
and pick **a single platform dimension** (e.g. 1024), then have providers that support Matryoshka/dimension-reduce
emit at that dimension; providers that can't reduce dimension → truncate+normalize in the pipeline. Record the rationale in blueprint §8.
Do this **before** ingesting real documents — changing the dimension later means re-embedding the whole corpus.

### 5.4 Secrets + prod checklist (review §6.1)
- Boot assert in `main.py`: `environment == "production"` → `jwt_secret` must not be the default,
  `cookie_secure=True`, `seed_password` must not be `pikaos123`. Dying at startup beats leaking silently.
- Provider API keys are **platform-level in env** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `LOCAL_LLM_BASE_URL`) read only via `config.settings` (the existing CLAUDE.md §2.1 rule) —
  per-agent keys are ⚪ future work once multi-tenant exists; **must never live in prompt/DB**.
- API-level idempotency key (review §6.2): `POST /quests/{id}/dispatch` accepts an
  `Idempotency-Key` header; stored in Redis `dispatch:<quest>:<key>` TTL 24h → returns the same `run_id` instead of dispatching twice.

---

## 6. Quick wins — doable right now, no need to wait for the engine

1. **`documents.owner_id` FK** — migration `0002` adds the ForeignKey (empty table = free).
2. **Boot assert prod secrets** (§5.4) — ~10 lines in `main.py`.
3. **Status column in `system-design.md`** — tag arq/LLM SDK/RAG with "🟡 designed, no dependency yet"
   to prevent the misconception that only wiring is left (review §3).
4. **Fix `ws.py` per §3** — there's no real consumer right now, so it can be fixed with zero impact; do it before anyone builds a feature on WS.

---

## 7. Revised build order (replaces the old §11)

| # | Task | Risks mitigated |
|---|---|---|
| 0 | **RBAC server-side** (tables+`require_perm`+seed+`/me`) + quick wins 1–3 | §2, §6 |
| 1 | **WS refactor**: first-message auth · per-quest channel + authz · replay/backfill | §3 |
| 2 | **Engine core**: engine table migration (FK/index/UNIQUE per §4.4) · arq worker in compose · loop with **stub LLM + stub side-effect tool** · 2-phase steps + resume (§1) · quota update (§4.1) · timeouts (§4.3) | §1, §4 |
| 3 | **LLM adapter** (OpenAI·Anthropic·Local) + rate-limit/backoff (§5.2) + boot assert keys | §5.2, §5.4 |
| 4 | **HERMES** limit fan-out/depth + atomic finalize (§4.2) + dispatch idempotency key | §4.2, §5.4 |
| 5 | **Tools subsystem** — handler by effect class (§1b) + sandbox (design in a separate session per blueprint §9) | §1 |
| 6 | **RAG** — decide embedding dim before ingest (§5.3) | §5.3 |
| 7 | **Observability** structured-logging stage from task 2; metrics/OTel before prod | §5.1 |

Ordering principle: **security (0–1) before features; engine correctness (2) designed into the first schema
rather than patched in later; expensive pieces (3–4) come after there's a test harness built from stubs.**

### Worker testing strategy (review §6.3)
The test harness runs arq jobs directly (calling the job coroutine in pytest-asyncio, not via the queue) + a fake LLM
provider (returns a script of tool_use/messages in a defined order) + asserts the order of `run_steps` in the DB.
Mandatory cases: kill mid side_effect tool → resume must enter `waiting_input` without re-firing (§1e);
2 children finishing at once → finalize exactly once (§4.2); quota right at the line → the second run must fail.

---

## 8. Things still undecided from the available docs (need more info/sessions)

- **Sandbox for the CMD/PowerShell tool** — blueprint §9 says "designed in a later session" — still true;
  needs a requirement on whether it runs on the user's machine (Windows host) or in a server-side container before it can be designed.
- **Multi-tenancy** (review §6.6) — ✅ **answered (2026-06-12): single org, multiple departments** (not multi-org).
  Replace `workspace_id` with `department_id` as the scoping/visibility dimension — goes into the engine's first migration
  (build order task 2). user↔dept = **many-to-many** (`user_departments`, 1 user in multiple departments).
  Design: [system-design §7.1](system-design.md#71-department-scoping--multi-tenancy--one-org-many-departments).
- **Retry/escalation policy for subtasks that fail repeatedly** (blueprint §12) — start with retry N=2 then
  finalize partially per the blueprint, but the real value should be confirmed with the product owner.

---

## Impact (overview)

None of this **tears down any blueprint decision** — arq, step-persistence, reactive HERMES, the multi-provider
adapter all stay exactly the same. What changes is (1) the build order (security goes first), (2) the resume invariant
is redefined to match the reality of at-least-once, (3) the engine's first schema is born with FK/UNIQUE/timeout/quota
guards instead of having them bolted on later. The price paid is seeing features ~2 steps later (tasks 0–1) in exchange for an engine that's
safe and correct from the first commit — many times cheaper than fixing it once it's running real money.

> Next step: if you agree, I can patch `system-design.md` (§4 invariant, §5 atomic finalize, §6 WS, §11 build order)
> to align with this document — and answer the multi-tenancy question (§8) before starting task 2.
