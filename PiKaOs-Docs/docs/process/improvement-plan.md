---
title: Improvement Plan — legacy system to real system
type: process
status: active
keywords: [roadmap, phases, hardening, engine, hermes, rag, migration, production readiness, acceptance criteria]
related: [./playbook.md, ./lessons.md, ./session-handoff.md, ../architecture/risk-mitigation.md]
summary: >
  Master phased plan (A–F) to take PiKaOs from UI+auth to a secure, testable, running
  agent-ops platform. Read to know what each phase owns and its acceptance criteria.
updated: 2026-06-20
---

# PiKaOs — Improvement Plan (legacy system → real system)

> Master plan to take PiKaOs from "complete UI + backend auth" → "an agent-ops platform that
> actually runs, is secure, testable, and maintainable". Split into **phases A–F**, each with clear
> goal / tasks / acceptance criteria — at the end of every phase the system must be "better and
> actually usable", with no half-finished states.
> References: [`system-design.md`](../architecture/system-design.md) (architecture + build order §11) ·
> [`risk-mitigation.md`](../architecture/risk-mitigation.md) (design that mitigates risk) · [`tech-stack.md`](../architecture/tech-stack.md).
> Not estimated in days/weeks — team size unknown; ordered by dependency order instead.

---

## Phase overview

```
A. Hardening & foundation ──▶ B. Engine core ──▶ C. HERMES + Tools ──▶ D. Migrate data F→B
   (can start now)             (stub LLM)          (real multi-agent)      (drop localStorage)
                                  └────────────▶ E. Knowledge/RAG ─┐
                                                                    ▼
                                                  F. Production readiness
```

Rules governing every phase: every new endpoint declares `require_perm` from birth (after phase A) ·
new schema ships with FK/index ([risk-mitigation §4.4](../architecture/risk-mitigation.md)) ·
update docs in the same commit as the structural change (CLAUDE.md always-on rule 5, Docs discipline).

---

## Phase A — Hardening & foundation (can start now, no dependencies)

**Goal**: Close all known vulnerabilities + put quality tooling in place, before writing the first line of engine.

| # | Task | Reference |
|---|---|---|
| A1 | ✅ **Done (2026-06-15)** RBAC server-side: tables `roles/permissions/role_perms/user_perms` (migration `0002_rbac`) + seed from `data-users.jsx` + `deps.require_perm` + `rbac_service` (effective perms + Redis cache `perms:<id>`) + `/me`/login returns `permissions[]` · `tests/test_rbac.py` (8 passed) | risk-mitigation §2 |
| A2 | 🟡 **Partial (2026-06-16)** first-message auth (token out of URL) ✅ + per-user channel (no global cross-user leak) ✅ + subscribe/unsubscribe protocol ✅ · `tests/test_ws.py` (6) · **per-quest authz + run_steps snapshot/backfill deferred to phase B** (needs quests/run_steps tables) | risk-mitigation §3 |
| A3 | ✅ **Done (2026-06-16)** Migration `0003_documents_owner_fk`: FK `documents.owner_id → users` **ON DELETE SET NULL** + index `ix_documents_owner_id` (empty table = free) · verified with `\d documents` + 74 tests green | risk-mitigation §4.4 |
| A4 | ✅ **Done (2026-06-15)** Boot asserts (prod): jwt_secret/cookie_secure/seed_password/minio_secret ≠ default → die at boot (`config.production_violations` + `main.lifespan`, `tests/test_config.py`) | risk-mitigation §5.4 |
| A5 | ✅ **Done (2026-06-16)** Pin `minio` (digest) · `passlib` → `argon2-cffi==25.1.0` in `security.py` — existing argon2id hashes verify OK (the 6 existing users log in fine, 80 tests green, crypt deprecation warning gone) | tech-stack §3.1–3.2 |
| A6 | ✅ **Done (2026-06-16)** CI `.github/workflows/ci.yml`: frontend `npm run lint` (`eslint.config.js` — react-hooks rules-of-hooks=error, rest warn; passes with 0 errors) + `npm run build` + component-first grep · backend `docker compose up` + `pytest`. Runs real Actions on push | tech-stack §3.3–3.4 |
| A7 | ✅ **Done (2026-06-15)** SSRF guard: `net_guard.py` (blocks private/loopback + allowlist + httpx hook) wired to compare/audit · `tests/test_net_guard.py` | compare-hardening §1–2 |
| A8 | **Process model + crash protection (added 2026-06-16)**: run the API with multiple workers (`gunicorn -k uvicorn.workers.UvicornWorker -w N` or `uvicorn --workers`) + `restart: unless-stopped` on every service in compose — one poison/leaking request won't take the whole API down | — |
| A9 | **Graceful degradation (added 2026-06-16)**: Redis down → perms read DB directly (skip cache); MinIO down → only file features error, not a 500 for the whole system — add timeout + try/catch per dependency in `redis_client`/`storage` | — |

> **The real bottleneck is I/O, not CPU** (assessed 2026-06-16): "faster" = parallelize I/O + remove blocking,
> not optimizing algorithms (the BE's only CPU work is argon2, which must not be sped up). The truly heavy work
> (LLM/engine) is split into an **arq worker** from birth → see phase B (B2); A8/A9 are crash protection for the
> existing API that can be done immediately **without splitting into microservices** (over-engineering for a single
> org — see §7.1 single org/many depts).

**Acceptance criteria (Definition of Done)**
- Call a write API with no perm → 403 with `missing permission: <key>` (covered by test).
- User B subscribes to A's quest they have no rights to → 4403; token does not appear in the proxy's access log.
- `pytest` green + CI green on PR; boot with `ENVIRONMENT=production` + default secret → dies immediately with a clear message.
- All 6 existing users still log in (existing argon2id hashes verify under the new lib).
- (A8/A9) `docker compose stop redis` then a login whose token hasn't expired can still call read APIs (perms fall back to DB);
  kill 1 worker while a request is in flight → other requests don't drop.

**Phase risk**: RBAC seed on client/server out of sync (the old `@guildos.io` emails) —
declare the **server the source of truth, mapped by `username`** from A1.

---

> **[2026-06-16] Clean DB + ER consolidation + modularity:** removed pgvector (unused) → `postgres:16-alpine`.
> Merged migrations `0001_init`…`0004_engine` → **a single `0001_baseline`, organized by module** (core/knowledge/engine —
> [modularity.md](../architecture/modularity.md)) + `0002_stub_tool_sink` (separate test fixture). **Deferred 3 tables no code touches yet**
> to the phase that uses them: `subtasks` (C3) · `tools_config` (C5) · `notifications` (C6) → ER 17→13 domain tables.
> Decision: **Modular Monolith** (each system is a module, liftable to a local per-department deployment · FK into core only · footprint per system).
> 112 tests green on the new baseline. Code is still flat — moving into `app/modules/` is a later-phase refactor (one module at a time).

## Phase B — Engine core (stub LLM — not paying real money yet)

**Goal**: A fully correct engine skeleton (queue, persistence, resume, quota, timeout) proven with a stub
before connecting a real LLM — separating "engine risk" from "provider risk".

| # | Task |
|---|---|
| B1 | ✅ **Done (2026-06-16)** Migration `0004_engine` + ORM models: `departments` + `user_departments` (m:n) + `agents/rooms/quests/runs/run_steps/subtasks/tools_config/notifications` + `documents.department_id`. FK/UNIQUE/index per §4.4 (run_steps UNIQUE(run_id,seq)+CASCADE · runs self-FK CASCADE · agent/quest/room/dept SET NULL) — verified with `\d` + 81 tests. **Department seed/CRUD left for phase D.** [system-design §7.1](../architecture/system-design.md#71-department-scoping--multi-tenancy--one-org-many-departments) |
| B2 | ✅ **Done (2026-06-16)** `worker` service in compose (same image, `command: arq app.worker.WorkerSettings`, restart: unless-stopped) + `app/worker.py` (WorkerSettings + `ping` job) · `arq==0.28.0` · verified enqueue→worker→result=`pong` + 81 tests |
| B3 | ✅ **Done (2026-06-16)** `services/agent_runner.run` loop (worker job `agent_run`) + `repositories/runs.py` (all SQL, including atomic `reserve_quota` UPDATE…RETURNING) + new config (`run_max_steps`/`run_llm_step_timeout_s`/`run_tool_step_timeout_s`/`run_max_wallclock_s`) + cancel flag (`redis_client.request_run_cancel`/`is_run_cancelled`). 2-phase tool (pending→done, `idempotency_key="{run_id}:{seq}"`) · resume by effect class (read/idempotent_write→rerun, side_effect/unknown→`waiting_input`) · per-step `asyncio.wait_for` · LLM provider+tool registry **injected** (`set_engine_runtime`; stub=B4). 12 tests in `test_agent_runner.py` (pure helpers + loop with in-memory fake repo) — **93 passed**. |
| B4 | ✅ **Done (2026-06-16)** `services/engine_stubs.py`: **StubLLMProvider** (script in `@@stub@@`+JSON in the seed message → answers per turn) + **StubToolRegistry**, 3 tools covering all effect classes (`echo`=read · `upsert`=idempotent_write ON CONFLICT DO NOTHING · `record`=side_effect plain INSERT). Sink = `stub_tool_writes` (migration `0005` + ORM `StubToolWrite` + `repositories/stub_tools.py`). Wires `set_engine_runtime` at `worker.startup`. + roll-up `runs.tokens_used` (repo `add_run_tokens`). 8 tests (`test_engine_stubs.py`) + smoke through real worker: enqueue→`llm/tool/llm`=done, `run_steps`=[(0,llm,6),(1,tool,0),(2,llm,3)], stub write 1 row key `{run_id}:1`, `tokens_used=9`. **101 passed.** |
| B5 | ✅ **Done (2026-06-16)** `services/events.py` (publish per-step + per-run event → Redis `quest:<id>`, best-effort, payload cap 16KB, shared `serialize_step`) — runner emits every step/status (running/step llm+tool 2-phase/done/failed/cancelled/waiting_input). `services/quest_service.py` (authz `can_view` = owner/dept member/admin · `snapshot` runs+steps · `backfill` with cross-quest guard) + `repositories/quests.py`. `routers/ws.py` un-stubbed: subscribe→authz→snapshot, frame `backfill`. 7 tests (`test_quest_stream.py`) + real pubsub smoke: `run:running→llm→tool(pending)→tool(done)→llm→run:done`. **108 passed.** |
| B6 | ✅ **Done (2026-06-16)** `test_engine_resume.py` — runs `agent_runner.run` directly on real Postgres (local-engine + `db_factory` inject), simulating a worker dying mid-step with `_Crash(BaseException)` that slips past `except Exception`. 4 acceptance gates pass: (1) kill mid side_effect → resume `waiting_input` writes one row, no double-fire (2) kill mid LLM → resume rebuilds conversation from run_steps and continues, no duplicate step (3) quota exactly on the line → second run `quota_exceeded`, `used == Σ run_steps.tokens` (4) snapshot fully recovers the timeline. **112 passed.** |
| B7 | ✅ **Done (2026-06-16)** Structured logging — `logging_ctx.py` (contextvars + `RunContextFilter` stamps every record with `run_id`/`parent_run_id`/`quest_id`/`agent_id`, default `-` when unbound) · `bind_run`/`reset_run` in `run_job` (bind/restore per job, no leak across runs) + enrich in `run()` · `configure_worker_logging` (handler+formatter+filter scoped to `pikaos.*`, propagate=False to avoid clashing with arq) · INFO `run started`/`run done`. 5 tests + real worker smoke: `INFO pikaos.engine [run=… quest=…] run done (steps=3, tokens=7)`. **117 passed.** |

**Phase B fully closed ✅ (B1–B7)** — engine core: schema · arq worker · agent loop (2-phase/resume/quota/timeout) · stub LLM+tools · live worklog stream · resume/crash integration · structured logging. Connecting a real provider = phase C.

**Acceptance criteria**
- Kill the worker mid side-effect tool → resume enters `waiting_input` **without double-firing** (enforced by test B6).
- Kill the worker mid LLM step → resume continues from the latest step with the same conversation.
- User quota exactly on the line: second run fails `quota_exceeded`; `used` total matches the sum of `run_steps.tokens`.
- Open the quest page mid-run → full timeline (snapshot + backfill work).
- Cancel a run during an LLM stream → finishes in < 5s.

---

## Phase C — HERMES + real LLM + Tools

**Goal**: real multi-agent, real provider, under a controllable ceiling.

| # | Task |
|---|---|
| C1 | 🟡 **Almost complete (2026-06-16)** 3 real adapters, all conforming to the existing `LLMProvider` interface (no touching the agent loop), called via **httpx — no SDK dep added**: **Ollama** (`llm_ollama.py`, `/api/chat`) · **OpenAI/ChatGPT** (`llm_openai.py`, `/chat/completions`, Bearer auth, tool-call id threading) · **Anthropic/Claude** (`llm_anthropic.py`, `/v1/messages`, `x-api-key`+`anthropic-version`, system hoisted top-level, tool_use↔tool_result pairing, does not force `temperature`/`max_tokens` — verified via the claude-api skill, default `claude-opus-4-8`). Each = pure helper (messages/tools/parse) + `complete()`. config: `llm_provider` (stub\|ollama\|openai\|anthropic, default stub) + `openai_*`/`anthropic_*`/`llm_max_tokens`. `worker.build_llm_provider()` routes 4 ways. tests: `test_llm_ollama/openai/anthropic.py` (helper + `complete()` via httpx MockTransport, no key/server needed). **152 tests green.** **Remaining: streaming (token-delta) only** — provider routing per model / multiple providers at once = C2 |
| C2 | Rate-limit per provider (Redis token-bucket) + backoff + `llm_max_concurrency_per_provider` |
| C3 | `hermes_plan/advance/finalize`: DAG validate (acyclic, in-orch) + cap children/depth + atomic finalize |
| C4 | `POST /quests/{id}/dispatch` + `Idempotency-Key` + brief doc per subtask |
| C5 | Tools subsystem, first phase: HTTP API + Webhook (effect class required in config) — **defer CMD/PowerShell until after sandbox design** (system-design §9) |
| C6 | Human-in-the-loop: `waiting_input` → notification card → answered then resume |

**Acceptance criteria**
- 1 real quest → HERMES splits into ≥2 subtasks across ≥2 agents → finalize synthesizes the result — viewable live on UI.
- 2 children finish at the same time (simulated test) → finalize **runs once**.
- Disable one provider (mock 429) → backoff works, no run fails due to rate-limit within N retries.
- Hammer dispatch 5 times + same key → single run.

**Risk**: LLM cost during dev — set low quota for dev users + use a local model (Ollama) as the default in dev.

---

## Phase D — Migrate data Frontend → Backend (stop relying on localStorage)

**Goal**: all real data (agents, rooms, quests, workflows, RBAC UI) read/written via API —
localStorage is only cache/preference. *Can start in parallel with C once B1 is done (tables exist).*

| # | Task |
|---|---|
| D1 | CRUD `agents/rooms/quests` (router→service→repo per CLAUDE.md §2.1–2.2, each with `require_perm`) |
| D2 | Frontend: switch `data.jsx`/`office-data.jsx` loaders → `api.js` (same screens, don't touch UI) — one aggregate at a time, with fallback seed when offline |
| D3 | Migrate the RBAC admin UI (the existing roles/permissions screen) → call the real API from A1 |
| D4 | Workflows/tool-runs → tables + API (replacing the `data-workflows.jsx` seed) |
| D5 | Real audit log: write `audit` server-side from the service layer (replacing `AUDIT_SEED`) |

**Acceptance criteria**
- Clear all localStorage → refresh → full data from API (except preferences like theme/lang).
- Two browsers see the same agent/room edits (via refetch or WS event).
- viewer role: every write button hidden **and** the API actually rejects (test both layers).

**Risk**: this phase touches many screens — do one aggregate at a time + the existing barrel pattern (CLAUDE.md §1.6), no big-bang.

---

## Phase E — Knowledge / RAG

**Goal**: a real codex — documents in MinIO are embedded and pulled in as agent context.

> **Storage decision (2026-06-16)** → [`architecture/knowledge-rag.md`](../architecture/knowledge-rag.md):
> **markdown = source of truth · pgvector = a disposable/rebuildable cache** (enabled when §3 of the doc's criteria are met).
> The markdown store (layer 2) can be done now; E1–E4 are the vector layer when needed. Iron rule: rebuild one-way `markdown → vector`.

| # | Task |
|---|---|
| E1 | ✅ **Done (2026-06-17)** embedding model + dims = **bge-m3 / 1024 / via Ollama** (`config.embed_*`, default provider `stub` → offline). dim baked into `doc_chunks.embedding vector(1024)` + `embedding_model` column per chunk + `documents.embedding_model`/`ingest_status` |
| E2 | ✅ **Done (2026-06-17)** Ingestion pipeline (arq job `ingest_document`): upload → MinIO → chunk by heading (`chunking.py`) → embed (`embeddings.py`) → `doc_chunks` (`ingestion_service.py` + `repositories/doc_chunks.py` raw-SQL). pdf/image = `skipped` (OCR last). enqueue after upload (`app/queue.py`); db image → `pgvector/pgvector:pg16`, migration `0005` (`CREATE EXTENSION vector` + HNSW cosine index) |
| E3 | ✅ **Done (2026-06-18)** Search `GET /api/knowledge/search` + **retrieval into the agent loop**: `services/retrieval_service.py` (`query_from_input`/`format_context`/`context_for_run` — owner-scoped, reuses `doc_chunks.search`+embedder) → `agent_runner` prepends system context after building messages, **gated on `config.engine_retrieval_top_k`** (default 0=off → engine tests unaffected), best-effort + creates no step/quota → resume-safe. `tests/test_retrieval.py` (pure + owner-scope DB). **184 green.** |
| E4 | ✅ **Done (2026-06-18)** UI codex on the API: "Documents (live)" mode — upload → `POST /knowledge/docs` · ingest_status badge · semantic search · presigned delete/download (commit `1a8f70e`) |

> **[2026-06-18] Extend → Agentic GraphRAG (knowledge-base system) — design locked [knowledge-rag.md §6](../architecture/knowledge-rag.md):**
> accept many file types → markdown → **summarize at ingest** → search → **answer with Ref**. Fixes inaccurate retrieval (chunks lacking
> context) with enrich A (context prepend, free) + B (doc summary, 1 call/doc); the summary acts as a coarse "find the file fast"
> layer instead of a graph. markdown stays the truth (summary/links = derived). **v1 = E5–E8; graph/UI = E9 (deferred).**

| # | Task (GraphRAG extend) |
|---|---|
| E5 | **real bge-m3** — flip `embed_provider=ollama` + pull bge-m3 on pikaos-ai (Ollama already verified) → re-ingest existing data (stub→real, same dim 1024) → verify search |
| E6 | ✅ **Done (2026-06-21)** converters PDF/Word→md + Ref. [`services/converters.py`](../../../PiKaOs-Core/Backend/app/services/converters.py) (`to_markdown`: md/log as-is · pdf→`pypdf` text · docx→`mammoth`; None when nothing embeddable). On first ingest [`ingestion_service.py`](../../../PiKaOs-Core/Backend/app/services/ingestion_service.py) converts a pdf/docx → stores the markdown as the new truth (`object_key`) + keeps the original as a Ref (`source_object_key`, migration `0006`); `_EMBEDDABLE_KINDS` now covers pdf/docx; `infer_kind` adds `docx`; download returns the original Ref; delete removes both objects. **new deps** `pypdf==5.1.0`+`mammoth==1.8.0` ([tech-stack](../architecture/tech-stack.md)). `test_converters.py` + 2 ingestion tests · **194 passed** (live docker, EMBED_PROVIDER=stub) |
| E7 | ✅ **Done (2026-06-27)** ingest enrich A+B. **A (context prepend)** — `_embed_text` now prepends the **doc title + section heading** to each chunk before embedding ([ingestion_service.py](../../../PiKaOs-Core/Backend/app/services/ingestion_service.py)), so a chunk carries which document/section it came from. **B (doc summary)** — when a `summarize`-role provider is injected, the whole markdown is summarized once ([summarize_service.py](../../../PiKaOs-Core/Backend/app/services/summarize_service.py)) → stored on **`documents.summary`** (migration `0009`) **and** appended as an extra embedded summary-chunk so high-level queries match the document. Injected + **best-effort**: a failed/absent summarizer never fails ingest (chunks still embed). Gated by `ingest_summary_enabled` (default OFF → ingest stays free/offline, existing chunk-count tests unchanged); the worker passes `ConfiguredLLMProvider("summarize")` when on. `test_summarize_service.py` (5, pure) + 2 ingestion-B tests (4 chunks + summary / failure → 3 chunks). |
| E8 | ✅ **Done (2026-06-27)** RAG answer service — **query-rewrite → retrieve (scoped) → synthesize + citations** ([answer_service.py](../../../PiKaOs-Core/Backend/app/services/answer_service.py)), reusing `knowledge_service.search_documents` (same embed + permission scope as `/search`) and `retrieval_service.format_context`. **`POST /api/knowledge/answer`** (`codex.view`) returns `{answer, sources[], rewritten_query, used_chunks}`; sources are nearly free (search already returns name/heading/score). Answer model via the new **`answer` role** (`llm_connections`); config `rag_answer_top_k`/`rag_answer_rewrite`. `test_answer_service.py` (6, fake provider + monkeypatched search). **← v1 capability complete: "upload→ask→answer with sources"** (real synthesis once an `answer` provider is configured; stub answers offline). **Remaining for the full demo:** turn on a real summarize/answer provider + a small "Ask" panel in the codex UI. |
| E9 | **graph + UI (deferred)** — `tags`/`collection` filter · `doc_links` (parse `[[wikilink]]` + auto-suggest) · Obsidian-style graph UI (node-detail panel) · contextual chunk (C). add as data grows |

**Acceptance criteria**: upload a new `.md` → within 1 minute an agent can answer citing its content (plumbing ✅ E3 — turn on
`engine_retrieval_top_k>0` + connect a real LLM provider for a full demo); delete a document → it disappears from retrieval
(✅ FK `ON DELETE CASCADE` → no orphan vector, test `test_doc_chunks`).

---

## Phase F — Production readiness

**Goal**: run it for others to use without a dev babysitting.

| # | Task |
|---|---|
| F1 | Real deploy topology: reverse proxy + HTTPS + `cookie_secure=True` + frontend build served static |
| F2 | Backup: scheduled `pg_dump` + MinIO bucket versioning/replication + rehearse a real restore once |
| F3 | Second-level observability: metrics per provider/tool (latency, tokens, error rate) + dashboard from `run_steps` |
| F4 | Security pass: review the entire risk-mitigation §5.4 checklist + dependency audit + design a CMD/PowerShell sandbox (separate session) if enabling this kind of tool |
| F5 | Basic load test: N quests at once — watch queue depth, DB pool, WS fan-out |

**Acceptance criteria**: restore from backup succeeds on a clean machine; no default secrets in prod;
the dashboard can answer "how many tokens were used yesterday per provider".

---

## Questions to answer before reaching each phase (decide as late as it stays painless)

| Question | Answer before | Default if unanswered |
|---|---|---|
| **Multi-tenancy** — multiple organizations? | ✅ **Answered (2026-06-12): single org, multiple departments** | `department_id` on every scopable table from B1 ([system-design §7.1](../architecture/system-design.md#71-department-scoping--multi-tenancy--one-org-many-departments)) |
| Embedding model + dims | E1 | platform-wide central dim + `embedding_model` per row |
| Where the CMD/PowerShell tool runs (user host vs container server) | F4 / before enabling this kind of tool | not enabled until the sandbox is designed |
| Retry N for failed subtasks | C3 | N=2 → partial finalize |

---

## How to use this plan

Follow the order A → B → C (D can run parallel with C after B1; E after B; F after everything).
At the end of each phase: run all of the phase's "acceptance criteria" + update the status badge in `system-design.md`
(🟡→✅) + review this doc to confirm the next phase is still correctly ordered. If new work turns up along the way:
add it to the phase matching its dependency, not "do it now because I'm passing through".
