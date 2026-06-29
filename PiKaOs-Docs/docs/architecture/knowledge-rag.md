---
title: Knowledge / Document Storage (Markdown-as-truth, pgvector cache)
type: architecture
status: active
keywords: [knowledge, rag, markdown, pgvector, embeddings, documents, minio, retrieval, graphrag, codex]
related: [./system-design.md, ./risk-mitigation.md, ../process/improvement-plan.md, ./data-model.md]
summary: >
  Owns the document/knowledge storage design — markdown as source of truth, pgvector as a
  rebuildable derived index. Read when touching documents, ingest, embeddings or RAG search.
updated: 2026-06-20
---

# PiKaOs — Knowledge / Document Storage (Markdown-as-truth · pgvector = rebuildable cache)

> **Decision-locked design** (2026-06-16) — owner of "document/knowledge storage for the whole system".
> Extends [system-design §8](system-design.md) (Knowledge/RAG) · [risk-mitigation §5.3](risk-mitigation.md)
> (embedding dim) · [improvement-plan phase E](../process/improvement-plan.md). References actual code as of 2026-06-17.
> Status: 🟢 **markdown (M1) + vector core (M2) + retrieval (E3) + codex UI (E4) + reindex command (E5 code) done.**
> **[2026-06-18] extend → Agentic GraphRAG** (converters PDF/Word→md + **summarize at ingest** + search→**answer with Ref**) —
> designed in §6; v1 = build-order §6.7 steps 1–3.

---

## 0. The decision (locked) — "Hermes + Obsidian (markdown)"

PiKaOs's knowledge system uses **markdown as the source of truth**, not a vector DB.
The rationale matches the goal "critical system, set it once and don't keep touching it" → it prizes **durability + low maintenance**:

- markdown = plain text, no vendor, human-readable/hand-editable, versionable, lasts decades, ~0 maintenance.
- vector = needs tending (re-embed on edit, model gets deprecated, dim changes → re-index the whole store) → wrong fit if it's the **core**.

**pgvector is not discarded** — but it is a **supplementary index derived from markdown that can be thrown away/rebuilt**, enabled when search starts to genuinely hurt (§4).

### The one rule (the one rule that makes it last)
> **Rebuild flows one way: `markdown → vector` only — no critical data may live solely in vector.**

The result: vector breaks = just rebuild from markdown, the system doesn't die, no data loss. This is what makes it "set and forget".

---

## 1. Three layers — split storage by data type (don't cram everything into one place)

| Layer | What kind of data | Storage | Status in PiKaOs |
|---|---|---|---|
| **1. Structured** | deadline · task · quiz score · log · run_steps · RBAC | **Postgres** | ✅ already exists (`runs`/`run_steps`/`users`/`quests`…) |
| **2. Documents (the truth)** | notes · Ref `.md` · raw files (md/pdf/img/log) | **markdown + MinIO** | ✅ infra ready ([`storage.py`](../../../PiKaOs-Core/Backend/app/storage.py) · [`documents`](../../../PiKaOs-Core/Backend/app/models.py)) |
| **3. Semantic index** | "pull context relevant to this task" (RAG) | **pgvector** (derived) | ✅ **M2 (2026-06-17)** — `doc_chunks(embedding vector(1024))` + ingest job + `GET /search`; agent retrieval (E3) next |

> structured data **must not be stored in vector** (can't do exact search/filter/aggregate) — that's Postgres's job.

---

## 2. Vault file layout (markdown convention)

The actual files live in **MinIO** (bucket `pikaos`), metadata + scoping live in [`documents`](../../../PiKaOs-Core/Backend/app/models.py)
(`object_key` points to the file · `kind` md/pdf/img/log · `owner_id` · `department_id`). Key layout is Hermes-style
(subject-centric) but bound to PiKaOs tenancy:

```
subjects/<department-or-subject>/
  uploads/     raw uploaded files (pdf/image/log)
  notes/       <subject>_<topic>_notes.md      ← full extract (no summarize)
  research/    <topic>.md                       ← synthesis (may summarize)
  SUBJECT.md   inventory: logged files + date + tag
```

- **1 file = 1 object** in MinIO + 1 row in `documents`. Don't scatter metadata elsewhere.
- **scoping**: every query/retrieval filters by `department_id` (single-org/multi-department — [system-design §7.1](system-design.md))
  + the owner's perm. markdown is not public-by-default.
- markdown can be edited in Obsidian (human) or written by an agent (machine), both — same file, one truth.

> **Don't run the Obsidian app on the server** — use only the *markdown vault pattern*; humans can view/edit in Obsidian on the client side.

---

## 3. Layer 3 — pgvector as cache (✅ M2 implemented)

> **[2026-06-17] M2 core done:** db image reverted to `pgvector/pgvector:pg16` · migration
> `0005_doc_chunks` (`CREATE EXTENSION vector` + `doc_chunks` table + HNSW cosine index + columns
> `documents.ingest_status`/`embedding_model`). **E1 locked: bge-m3 / dim 1024 / via Ollama**
> (`config.embed_*`, default provider `stub` → dev/test run offline). pipeline:
> [`services/embeddings.py`](../../../PiKaOs-Core/Backend/app/services/embeddings.py) (StubEmbedder +
> OllamaEmbedder `/api/embed` + factory) · [`services/chunking.py`](../../../PiKaOs-Core/Backend/app/services/chunking.py)
> (chunk by heading, split long sections) · [`services/ingestion_service.py`](../../../PiKaOs-Core/Backend/app/services/ingestion_service.py)
> (read MinIO → chunk → embed → `replace_chunks`) · arq job `ingest_document` (worker) enqueued
> after upload ([`app/queue.py`](../../../PiKaOs-Core/Backend/app/queue.py)) · raw-SQL repo
> [`repositories/doc_chunks.py`](../../../PiKaOs-Core/Backend/app/repositories/doc_chunks.py) (insert/search
> `<=>` cosine/delete; zero-dep — `'[..]'::vector` literal, no added pgvector binding) ·
> search `GET /api/knowledge/search` ([`routers/knowledge.py`](../../../PiKaOs-Core/Backend/app/routers/knowledge.py))
> scope = `can_view` (org-wide ∪ dept ∪ owner; admin sees all) enforced in SQL. tests:
> `test_chunking`/`test_embeddings` (pure) + `test_doc_chunks`/`test_ingestion` (DB+pgvector).

### When to enable (criteria — YAGNI, don't build before it hurts)
Enable the vector layer **only when** one of these is genuinely true:
1. documents > ~50–100 files until grep/path can't find them, **or**
2. agent needs to "pull related material itself" across multiple files/departments, **or**
3. you need ranking/semantic proximity (not exact match)

Before reaching the criteria → markdown + grep + filter in Postgres is enough.

### Design to be throwaway (when enabled — phase E)
- **chunk by markdown heading** (notes are already written as headings → cut along those) — no arbitrary cutting.
- **decide embedding model + dim before ingesting the first row** (changing later = re-embed the whole store) →
  add an `embedding_model` column in `documents`, one dim across the whole platform ([risk-mitigation §5.3](risk-mitigation.md)).
  Stop hardcoding `Vector(1536)` tied to OpenAI.
- **re-embed when a file changes** (hook in the ingest job) · **delete document → delete vector** (no orphans — phase E acceptance criterion).
- **single rebuild command** ✅ (E5): `POST /api/knowledge/reindex` re-enqueues ingest for every in-scope
  document from its markdown source (proves the one rule §0). `only_stale=true` (default) re-embeds only
  docs **not on the current model** — the "I switched `embed_provider`, re-embed the rest" case; `false`
  forces a full rebuild. Admin rebuilds the whole corpus; otherwise only the caller's own docs
  (`codex.manage` + `services/knowledge_service.reindex_targets`). Idempotent (ingest replaces chunks).

### Retrieval (phase E3)
`agent_runner` step 1 pulls top-k from pgvector **filtered by the agent's room/quest scope + `department_id` + the owner's perm**
before adding it as context — retrieval that crosses scope = data leak.

---

## 4. Non-goals (what we "don't do" — to prevent missteps)

- ❌ **Don't install a new Vector DB** (Pinecone/Weaviate/Chroma) — use **pgvector, an extension of Postgres** (added to the existing db, no separate DB needed). ✅ **[2026-06-17] enabled** — db image = `pgvector/pgvector:pg16`, `CREATE EXTENSION vector` + `doc_chunks` in migration `0005`.
- ❌ **Don't build the vector layer before it hurts** — see §3 criteria.
- ❌ **Don't store structured data (tables/dates/status) in vector** — Postgres.
- ❌ **Don't let data live solely in vector** — markdown is always the truth (the one rule §0).

---

## 5. Impact on existing code/plans

- [`Document`](../../../PiKaOs-Core/Backend/app/models.py) stores **ingest status** (`ingest_status`/`embedding_model`); the actual embedding lives in **`doc_chunks`** (1 doc → N chunks, `vector(1024)`), not on documents itself — heading-level chunks search more precisely than the whole file. ✅ M2 (migration `0005`).
- [system-design §8](system-design.md) + build order step 6 (RAG) = the implementation endpoint; this doc locks "storage is markdown", which was previously written broadly.
- [improvement-plan phase E](../process/improvement-plan.md) (E1 model/dim · E2 ingest · E3 retrieval · E4 UI) = the implementation plan once §3 criteria are met.
- The markdown storage (layer 2) **can be done right away without waiting for vector** — upload pipeline → MinIO → `documents` row.
  ✅ **M1 done (2026-06-16):** `repositories/documents.py` + `services/knowledge_service.py` + `routers/knowledge.py`
  (`POST/GET/DELETE /api/knowledge/docs`) — upload→MinIO+row · list/get(presigned)/delete · scoping owner+`department_id`
  (org-wide when dept=NULL) · write gate `codex.manage`, read = logged-in users.
  ✅ **M2 done (2026-06-17):** vector layer — chunk/embed/ingest + `GET /api/knowledge/search` (§3 above). **Next E3:** `agent_runner` step 1 pulls top-k into context (bound to the provider's `search` role).

---

## 6. Agentic GraphRAG — converters + summarize at ingest + search-then-answer (2026-06-18, extend)

> Builds on §3 (vector core) into a **full "data warehouse" system**: accept many file types → markdown → **summarize/contextualize at ingest**
> → search then **answer with Ref**. The LLM is in the loop for both ingest and query (agentic RAG). **markdown is still the truth**;
> summary/context/links/embeddings = **derived metadata, throwaway/rebuildable** — the one rule §0 unchanged.

### 6.1 Two pipelines
```
INGEST:  File(pdf/word/md) → convert→Markdown (truth, MinIO) + keep original as Ref
                           → [AI enrich]: doc summary + chunk context   (derived metadata)
                           → chunk → bge-m3 embed (summary + chunks) → pgvector   [async in worker]

QUERY:   query → [AI query-rewrite] → bge-m3 retrieve 2-level (summary→chunk, + scope filter)
               → AI reads + synthesizes answer + citations(Ref) → answer
          ⟸ Hermes (multi-agent) wraps only complex queries that need task decomposition — later phase, not bound to basic search
```

### 6.2 Why "summarize at ingest" (fixes imprecise retrieval)
embedding raw chunks directly gives poor retrieval: chunks **lack context** (don't know which doc/section they came from) · long docs/tables = noise diluting the vector ·
**high-level** queries don't match **low-level** chunks. Fix with 3 levels of enrichment (ordered by cost):

| Level | What it does | cost | Status |
|---|---|---|---|
| **A — context prepend** | prepend doc title + section heading to the chunk before embed (`_embed_text`) | 0 LLM | ✅ **done (E7)** |
| **B — doc summary** | summarize the whole doc → store `documents.summary` + embed as a summary-chunk | 1 call/doc | ✅ **done (E7)** — best-effort, gated `ingest_summary_enabled` |
| **C — contextual chunk** | LLM adds 1–2 sentences of context per chunk (Anthropic "Contextual Retrieval") + prompt-cache | N call/doc | later if still not enough |

→ **v1 = A + B** (low cost, solves the main problem).

### 6.3 summary = coarse layer (replaces a graph for "finding files fast")
the doc summary does **3 things at once**: (1) better retrieval — high-level queries match the summary · (2) **2-level / coarse
filter** — match query→summary to find the relevant "file/doc" first, then descend into that doc's chunks (= the "group→find fast" goal) ·
(3) serves as context fed to the answer-LLM. → **no need to build a separate graph for speed in v1** — the summary handles it.

### 6.4 converters + Ref binding
- accept **pdf** (`pypdf`, text-PDF; **scanned/OCR deferred**), **docx** (`mammoth`/`python-docx`), md/txt directly.
- convert → markdown (stored in MinIO = truth) · **keep the original file too** → new column `documents.source_object_key` binds the Ref to the md.
- extend `_EMBEDDABLE_KINDS` ([ingestion_service.py](../../../PiKaOs-Core/Backend/app/services/ingestion_service.py)) to cover pdf/docx after extract.
- **new deps** (tech-stack decision, [tech-stack.md](tech-stack.md)): `pypdf` + `mammoth` (or `python-docx`) — lightweight pure-python.

### 6.5 RAG answer service (search→answer+Ref) — ✅ as-built E8 ([answer_service.py](../../../PiKaOs-Core/Backend/app/services/answer_service.py))
- **query-rewrite → retrieve (scoped) → synthesize + citations**, exposed as `POST /api/knowledge/answer` (`codex.view`) → `{answer, sources[], rewritten_query, used_chunks}`.
- **reuse, not new infra**: retrieval = `knowledge_service.search_documents` (same embed + owner/dept scope as `/search`); the context block = `retrieval_service.format_context`; `build_sources` makes the `[n]` citation list parallel to it.
- **v1 retrieval is flat** over `doc_chunks` (which now *include* the per-doc summary-chunk from enrich B, so high-level queries already match the document) — strict 2-level (match summary→pick doc→descend) is a later refinement, not needed for v1.
- **model = via `llm_connections`** (no-hardcode; roles `answer` (synthesis/rewrite) + `summarize` (ingest B) — [llm_config](../../../PiKaOs-Core/Backend/app/services/llm_config_service.py)). dev uses an **API provider** (quality + doesn't fight the CPU); large local model once there's a GPU. embed = bge-m3, separate role. With no real provider the **stub** answers, so the endpoint works offline (no real synthesis).
- **citations are nearly free** — search already returns `document_name/heading/score` → answer + list sources = Ref.

### 6.6 graph + UI (deferred — add when data grows / proven necessary)
- **doc_links** (table `doc_links(src,dst,type)`) + `tags`/`collection` — parse `[[wikilink]]` from md + (later) auto-suggest from similarity.
- **hybrid retrieval** = vector + **metadata filter** (collection/tags via `WHERE`) — same mechanism as the existing owner/dept scope; **no graph DB / traverse needed** in v1.
- **Obsidian-style UI**: force-directed graph + node-detail panel (target = reference image from the user). last slice; frontend lib (`react-force-graph`/`cytoscape` or reuse the existing Three.js).

### 6.7 build order (value arrives early · no big-bang)
```
1) real bge-m3   ✅  flip embed_provider=ollama + pull bge-m3 on pikaos-ai → re-ingest existing data
                     code: POST /api/knowledge/reindex ('single rebuild command' §3) + codex "Rebuild
                     index" button. DONE+verified live [2026-06-19]: bge-m3 (1.2GB) on pikaos-ai ollama,
                     EMBED_PROVIDER=ollama in .env.ai, semantic search ranks paraphrased queries right
                     (0.67 vs 0.33). ⚠ recreate BOTH backend AND worker — the backend embeds the search
                     QUERY (web process), the worker embeds the chunks; both must use the same model or
                     scores are garbage. base URL differs per process: worker→ollama:11434 (same net,
                     ai.yml override), backend→host.docker.internal:11434 (host-published, .env.ai value).
2) converters    ✅  pdf/word → md + keep Ref (source_object_key). DONE [2026-06-21]: converters.py
                     (pypdf/mammoth) + ingestion converts on first ingest → markdown=truth, original=Ref;
                     download returns the Ref. deps pypdf==5.1.0 + mammoth==1.8.0. 194 tests green.
3) ingest enrich A+B  ✅  A=context prepend (doc title+heading → _embed_text) · B=doc summary
                         (documents.summary migration 0009 + embedded summary-chunk; summarize role,
                         best-effort, gated ingest_summary_enabled). RAG answer service ✅ POST
                         /api/knowledge/answer (rewrite→retrieve→synthesize+cite, answer role,
                         reuses search_documents + format_context). DONE [2026-06-27].
   ════════ v1 plumbing complete: "upload any file → ask → answer with sources" ════════
                         (live demo needs a real summarize/answer provider + an Ask panel in codex UI)
4) tags/collections + filter        (easy grouping)
5) doc_links + graph UI             (Obsidian-style)
6) contextual chunk (C) · Hermes wrap (multi-agent, complex queries — C3)
```

### 6.8 No change to the original decision
markdown = truth; summary/context/links/embeddings = **derived, rebuilt one-way from markdown** (the one rule §0).
vector breaks / model change / chunking adjustment = **always re-ingest from markdown** with no data loss.
