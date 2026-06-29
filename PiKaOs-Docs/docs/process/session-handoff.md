---
title: Session Handoff Prompt + Work Status
type: process
status: active
keywords: [handoff, work status, session prompt, continue work, latest changes, new chat, changelog]
related: [./playbook.md, ./lessons.md, ./improvement-plan.md, ../README.md]
summary: >
  The paste-in prompt for a new session plus the running Work status log of what's done /
  pending. Read first in any new chat; update the status when a significant task finishes.
updated: 2026-06-27
---

# PiKaOs — Session Handoff Prompt (paste in a new chat to continue work)

> Copy the entire "PROMPT" block below and paste it as the first message of a new session.
> The rest of this file is the "Work status" the prompt refers to — update it every time a significant task finishes.

---

## PROMPT (copy from this line down)

```
Reply in Thai. You are the System Design Assistant for PiKaOS — a Thai-first multi-agent
"agent-ops" workspace. Be concise, on-point, cut filler, match the user's style.

Role: read all docs under /docs before advising; analyze the architecture, flag risks,
offer options with pros/cons/impact; don't guess when the docs are insufficient — say what's missing.
Every proposal cites real code. Keep architecture docs in /docs.

Project folder: C:\Users\tixnop\Documents\PiKaOs  (select this folder before starting)

Always do this before answering the first question (full loop in docs/process/playbook.md):
1. Read docs/process/session-handoff.md (this file) — the "Work status" section: what's done / what's pending.
2. Read docs/process/playbook.md (how to work) + docs/process/lessons.md (don't repeat mistakes).
3. Read CLAUDE.md — especially the "Task router" at the top → open only the .md the router points to.
   Don't read all of /docs (wastes tokens + gets you lost).

Current task: <fill before pasting, e.g. "implement Phase A1 RBAC" / "write compare-hardening.md">.
Read the "Work status" below first, then ask one question if anything is ambiguous before starting.
```

## PROMPT (end)

---

## Work status (updated: 2026-06-27)

> **🚧 Blocked / stuck — leave a trail (CLAUDE.md always-on rule 9, don't-loop).** If a *dev loop*
> forces you to stop **unresolved** (the same approach failed ~2× and research/asking didn't crack it),
> add a `🚧 BLOCKED:` line in **NOW** below — **what** you're blocked on · **what you already tried** (so
> it isn't retried) · the **next hypothesis to test**. Clear it when solved, and move the solved bug's
> root-cause→fix into [`lessons.md`](lessons.md) §E. (Solved bugs → lessons §E; *open* blocks → here.)

> **NOW (read this first) — 2026-06-27.** **Machine moved Windows → Linux** — added Linux launchers
> (`PiKaOs-Core/setup.sh` one-time idempotent: docker group + start daemon + copy env templates · `start.sh`/`stop.sh`
> = the 4-stack flow; each plugin got `start-*.sh`/`stop-*.sh`) beside the existing `.bat`; deploy.md
> documents both paths. **Git hygiene fixed:** there was **no `.gitattributes`**, so the move flipped every
> text file to CRLF and ~76 files showed as fully changed (pure line-ending noise) — added `.gitattributes`
> (`text=auto`, LF in-repo · `.sh`=LF · `.bat`=CRLF) to **all 4 repos** + renormalized → noise gone, real diffs
> only. **Committed the whole pending pile** (was uncommitted/unpushed across all repos): PiKaOs `develop` carried
> **19 commits** of UI work — finer-grained **RBAC** (split `codex.manage`/`llm.manage`, permissions catalog as
> spaced per-group cards, Roles & Permissions nested under it), admin **Menu Manager** (reorder · 3-level nest ·
> hide · rename, moved into the Tools screen), **cross-device config** (per-user *and* server-shared settings that
> follow the user/device — new `user_settings` + `app_settings` tables), and a new **login scene** (TH/EN toggle ·
> parallax · underwater fx). Plugin **RedirectMap → v0.4.0**: **File Audit** tab (crawl both whole sites,
> compare every linked document by filename → `/filescan` + `/fileexport` xlsx) + **Swap Check** tab (old sitemap →
> same-path domain swap → follow-redirect probe, reusing `/discover` `swapOnly` + `/verify`, no new engine). Docs:
> `rbac.md`, data-model `user_settings`/`app_settings`, redirectmap file-audit/swap-check/matching, versions.md →
> 0.4.0; **docs-lint green (46 docs)**, backend `py_compile` clean. **⚠ Nothing pushed yet** — PiKaOs `develop`
> ahead **23**, PiKaOs-Docs `main` ahead **8**, PiKaOs-Plugin + umbrella have new commits too; verify on the
> Linux stack (full `pytest` + `vite build` — couldn't run here per §0) **then push**. One file left untracked on
> purpose: `PiKaOs-RedirectMap/swapcheck-proposal.html` (superseded by `docs/plugin/redirectmap/swapcheck.md`).
> Full system still runs: main `:8000`/`:5173` + worker · Compare `:8001` · RedirectMap `:8002`.
> **In flight (stack-gated):** #3 shared-engine package · #2 promote Compare→main (explicit approval only).
> **Next knowledge: E7** (ingest enrich A+B) → **E8** RAG answer service. Dated log below is the full history.

> **[2026-06-21] NOW→archived: E6 (converters pdf/docx→markdown + Ref) done + verified
> live** — rebuilt the backend image with `pypdf`/`mammoth`, migration `0006_doc_source` applied,
> **194 tests green**; committed on `develop` + pushed. RAG v1 ingest now accepts pdf/docx: convert →
> markdown becomes the truth (`object_key`), the original is kept as a Ref (`source_object_key`) →
> chunk/embed. **Module seam (`ENABLED_MODULES`) built** — pluggable Modular Monolith: the foundation
> (infra/core) always loads while engine/knowledge/compare switch off per deploy (verified plug-out +
> worker-job gating). Full system runs **live**: main `backend :8000` + `frontend :5173` + worker · plugin
> **Compare `:8001`** · **RedirectMap `:8002`** (per the ports registry). Docs **0 broken refs**,
> docs-lint + CI enforce; plugin tests 22/22. **In flight (both stack-gated reconcile refactors):**
> #3 shared-engine package (Compare+RedirectMap net_guard/sitemap) + #2 promote Compare→main (explicit
> approval only). **Next knowledge: E7** (ingest enrich A+B) → **E8** RAG answer service. Dated log below
> is the full history.

> **[2026-06-21] Module seam — pluggable Modular Monolith (`ENABLED_MODULES`) ✅ built — code + docs:**
> built the long-locked-but-missing modularity §2.5 ("enable/disable modules at deploy time") so the
> foundation is solid and modules plug in/out easily — **without** the big-bang code move §5 forbids.
> New **[`app/modules.py`](../../../PiKaOs-Core/Backend/app/modules.py)** registry: a `Module` (name ·
> routers · `optional`) list is the single source of module→router wiring. Foundation (`infra`=health ·
> `core`=auth/llm-config+roles/storage) is `optional=False` → always loads; optional contexts
> (`engine`=ws · `knowledge` · `compare`) load only when in `settings.enabled_modules` (`"*"`/empty =
> all, else a comma allowlist; unknown names ignored, never fatal). `main.py` drops the 8 hardcoded
> `include_router` calls for `modules.register_routers(app)` (logs the footprint via the `uvicorn.error`
> logger in lifespan so it actually prints); `worker.py` gates each optional module's arq jobs through
> `_active_functions` + `is_module_active` (engine→`agent_run`, knowledge→`ingest_document`; `ping`=infra
> always). New config `enabled_modules: str = "*"`. **Verified live on docker:** `test_modules.py` 6/6 ·
> **full suite 201 passed, 0 failed** · `ENABLED_MODULES=compare` → routers load only `infra,core,compare`
> and worker exposes only `ping` (engine/knowledge plugged out) · default startup logs
> `modules loaded: infra, core, engine, knowledge, compare`. Code stays flat (§5) — the seam lives ahead
> of the folder move, so when a module later moves into `modules/<name>/` only the imports in
> `modules.py` change. [modularity.md](../architecture/modularity.md) (§2.5 built · §3 note · status)
> synced. **Next when ready:** move the first module folder (compare = stateless, easiest) into
> `app/modules/` one at a time, or carry on with knowledge E7/E8.

> **[2026-06-21] E6 converters (pdf/docx → markdown + Ref) ✅ — code + docs:** finished the half-done
> E6 (the converter + migration + model column existed uncommitted; the ingestion wiring, deps, and
> tests did not). **[`converters.py`](../../../PiKaOs-Core/Backend/app/services/converters.py)** `to_markdown`
> — md/log decoded as-is · pdf→`pypdf` text-extract · docx→`mammoth` → markdown · returns None when
> nothing is embeddable (scanned PDF / unknown kind). **[`ingestion_service.py`](../../../PiKaOs-Core/Backend/app/services/ingestion_service.py)** `_markdown_body`: on a pdf/docx's
> **first** ingest, convert → `storage.put_object` the markdown as the new truth (`object_key`) +
> `set_converted_markdown` keeps the original as a Ref (`source_object_key`, migration `0006`); re-ingest
> is idempotent (source set ⇒ object_key is already markdown ⇒ no re-convert). `_EMBEDDABLE_KINDS` =
> `converters.CONVERTIBLE_KINDS` (md/log/pdf/docx); `infer_kind` adds `docx`; `get_document_with_url`
> presigns the **original** Ref (user downloads what they uploaded, not the derived md); `delete_document`
> removes both objects (no orphan). **deps** `pypdf==5.1.0` + `mammoth==1.8.0` (requirements + tech-stack
> §1/§2). Tests: [`test_converters.py`](../../../PiKaOs-Core/Backend/tests/test_converters.py) (6, pure
> routing/text — pdf/docx extractors monkeypatched) + 2 ingestion (pdf→md+Ref bound; scanned-pdf→skipped).
> **Verified live on docker:** rebuilt backend (pypdf/mammoth installed), `alembic current` = `0006_doc_source
> (head)`, **194 passed** (`EMBED_PROVIDER=stub`). The two non-E6 reds are pre-existing/env: `default-to-stub`
> asserts the default embedder but local `.env.ai` has the E5 ollama flip (gitignored runtime), and a
> `test_doc_chunks` HNSW timeout passes on a single re-run. Committed `develop` + pushed. Docs synced:
> [data-model.md](../architecture/data-model.md) (documents +`source_object_key`, +`docx` kind),
> [improvement-plan §E6](improvement-plan.md), [knowledge-rag §6.7](../architecture/knowledge-rag.md),
> [tech-stack](../architecture/tech-stack.md). **Next: E7** (ingest enrich A+B — context-prepend + doc
> summary via `llm_connections`) → **E8** RAG answer service (rewrite→retrieve→synthesize+cite) = v1
> "upload any file → ask → answer with sources".

> **[2026-06-20] Enforcement + use-case coverage + portability (docs + small code):** acted on a
> "whole-company" use-case audit. **Enforcement:** new [`scripts/docs-lint.py`](../../scripts/docs-lint.py)
> (frontmatter + link + anchor + `related:` validator, cross-repo-safe) + [`docs-lint` CI](../../.github/workflows/docs-lint.yml);
> new **PiKaOs-Plugin CI** (`.github/workflows/ci.yml`) = RedirectMap unit tests + a "version is
> config-driven, never hardcoded" guard. **Tests:** RedirectMap `page_inspect` now has unit tests
> ([`Backend/tests/test_page_inspect.py`](../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/tests/test_page_inspect.py), 9 pass). **Dead-code removed** (RedirectMap `/files`
> endpoint + `files_service.py` + `FilesIn/FileItem/FilesOut` + `ExportIn.files`/`_sheet_files` + `scanFiles`;
> dormant `kind` tag; Compare stale docstring) — verified isolatable (frontend export sends only `{rows}`),
> `py_compile` clean, repo README + plugin docs synced. **New rules/docs:** [§6.6 dependency direction](../pikaos-dev-rules.md)
> (main = upstream for shared libs/engine; non-breaking main updates must propagate to plugin),
> [architecture/database-design.md](../architecture/database-design.md) (clarity + performance + when to
> split a DB), [process/ai-runbooks.md](ai-runbooks.md) (R1 pause/resume · R2 new session/move machine ·
> R3 remove lib/file · R4 audit deps · R5 incident/rollback · R6 release/deploy · R7 expose open plugin),
> and the `new-project-scaffold.md` prompt (bootstrap a new project as `[Name]-Project/` +
> `[Name]-{Main,Docs,Plugin}`). *(Later extracted into its own plugin repo — the prompts are
> self-contained and no longer live under `PiKaOs-Docs/docs/new-project/`.)* Index + router synced. **Deferred (need the running stack, can't launch per §0):**
> shared-engine package (the §6.4 end-state) + promoting Compare into main (§6.5/R6). **Verified:** docs-lint
> green over **42 docs** (0 broken links/anchors/related), `py_compile` OK, plugin tests 9/9.
> **Also:** skill management — first project skill [`docs-check`](../../../.claude/skills/docs-check/SKILL.md)
> (wraps docs-lint) + [runbook R8](ai-runbooks.md) (when/how to create a skill: recurring multi-step →
> wrap as `.claude/skills/<name>/SKILL.md`). Added root [`llms.txt`](../../../llms.txt) ([llmstxt.org](https://llmstxt.org/)
> format) to close the one external-standard gap. Made `docs-lint.py` UTF-8-safe on Windows (it then
> caught a real broken link in this very handoff — enforcement works). **External benchmark** (vs
> Diátaxis · AGENTS.md · llms.txt · Anthropic CLAUDE.md best-practices): ~9/10 — see chat.
> **Test depth:** added pure unit tests — RedirectMap [`test_webconfig.py`](../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/tests/test_webconfig.py)
> (IIS XML gen) + Compare [`test_content.py`](../../../PiKaOs-Plugin/PiKaOs-Compare/Backend/tests/test_content.py)
> (HTML extract/embeddable) → **22 plugin tests green** (RedirectMap 16 · Compare 6); CI runs both
> apps now. **Shared-engine divergence measured (informs #3):** Compare vs RedirectMap `net_guard.py` +
> `sitemap.py` have **fully diverged** (~100% lines differ) — the shared package is a reconcile-two-
> behaviours + Docker-build job, **needs the running stack** (recorded in [§6.4](../pikaos-dev-rules.md)).
> #2 promote-Compare also still stack-gated.
>
> **[2026-06-20] Added code-clarity rule (was undocumented):** [CLAUDE.md](../../../CLAUDE.md) always-on **rule 7** — all code/files written clarity-first for the next human (clean-code/KISS: small single-purpose units, intention-revealing names, shallow nesting, no over-abstraction); **comments explain *why* not *what***; **match the style of the file you're in**; code + comments in English. Pointer added to [pikaos-dev-rules.md](../pikaos-dev-rules.md) intro (every § assumes it). User-requested standing principle.
>
> **[2026-06-20] AI-first docs overhaul (raise docs to AI-optimal) — docs + small code:** closed the gaps from a docs-as-AI-input audit. **(1) Frontmatter everywhere** — added YAML frontmatter (`title·type·status·keywords·related·summary·updated`) to **all 30** docs that lacked it → **32/32 now have it**; standard defined in [templates/frontmatter.md](../templates/frontmatter.md). Lets an agent rank relevance + walk `related:` without reading bodies. **(2) Version registry** — new [architecture/versions.md](../architecture/versions.md) (mirrors ports.md: app · UAT ver · promoted-to-main ver · pending) **and wired it into code**: added `app_version` to both plugin `Backend/app/config.py`; `main.py` `/api/health` + FastAPI title now read `settings.app_version` (removed the hardcoded `"0.1.0"` ×2/app) → §6.5's "version declared once in config.py" is now true. **(3) [GLOSSARY.md](../GLOSSARY.md)** — central domain terms (HERMES, arq, deep mode, soft-error, Symbol, UAT↔Prod, …). **(4) [templates/](../templates/README.md)** — copy-to-create: frontmatter, feature-doc, plugin-app-docs (5-file skeleton), unreleased-block (pending-promotion changelog). **(5) Root [AGENTS.md](../../../AGENTS.md)** — tool-agnostic entry pointing to CLAUDE.md. **(6) Synced** index ([docs/README.md](../README.md): + GLOSSARY/versions/templates rows, frontmatter rule) + router ([CLAUDE.md](../../../CLAUDE.md): always-on rule 3 now "Registries" = ports+versions; task-router rows for bump/promote, glossary, templates; glossary in new-session pointer); fixed the stale "per-repo CLAUDE.md stub" claim. Doc count 32→39 files. **(2nd pass — adversarial verify)** realigned the `knowledge-refactorer.md` prompt (since extracted to its own repo) to the canonical frontmatter standard + no-stub/AGENTS.md model + actual target tree (it taught a superseded schema); fixed **6 broken `§7.1` anchors** (heading slug truncated at the status emoji) across system-design/risk-mitigation/lessons/improvement-plan/session-handoff + 2 broken GLOSSARY `§6.4` anchors + ~12 broken `CLAUDE.md` depth links (per-repo stub removal exposed `../../` vs `../../../`). **Verified clean: 0 broken links · 0 broken anchors · 0 broken `related:` · frontmatter 39/39 · `py_compile` OK · 0 orphan docs.**
>
> **[2026-06-20] Plugin line = build-first rule (docs only, no code):** added **[pikaos-dev-rules §6](../pikaos-dev-rules.md)** "Plugin apps — build big features here first" (the §6 the index already promised but was missing): 6.1 bootstrap (copy sibling · reserve ports · drop login · trim deps), **6.2 stateful = own DB+Docker** (DB internal to the compose net, **not host-published by default**, offset+register only if exposed; same Alembic flow as main), 6.3 re-integration-ready from day one (write merge-back as you build), **6.4 plugin ↔ main = UAT ↔ Production** (they do NOT auto-sync; UAT running ahead is allowed; gap never silent) + **6.5 versioning + gated promotion** (each copy carries `vMAJOR.MINOR` in `config.py`→`/api/health`+README+doc header; UAT bumps freely 0.1→0.2 while **main stays at last-promoted version, untouched**; the ahead-version is documented as an `## Unreleased — pending promotion to main` changelog in the plugin doc only; **promote to main + main docs ONLY on explicit user approval**, then versions reconverge). Reworked **[plugin/README.md](../plugin/README.md)** contract (build-plugin-first default; stateless **or** stateful; "Own data, own Docker"; "Versioned, gated promotion — UAT↔Prod" rule) + **[ports.md](../architecture/ports.md)** rule 5 (plugin datastore ports). Synced index ([docs/README.md](../README.md)) + router ([CLAUDE.md](../../../CLAUDE.md) task-router row). **RedirectMap docs promoted to a subfolder** [`plugin/redirectmap/`](../plugin/redirectmap/README.md) (README + overview/errors/decisions/integration — Compare-parity); all refs (docs/README, plugin/README, root CLAUDE.md, dev-rules §6.3) point to `redirectmap/` (merge-back = `redirectmap/integration.md`). Also fixed 3 dangling `CLAUDE.md §6.7` refs (playbook/improvement-plan/tech-stack) → "CLAUDE.md always-on rule 5 (Docs discipline)". No app code touched.
>
> **[2026-06-19] committed the pending pile (3 repos) + E5 code (RAG reindex command):**
> **(commits)** all uncommitted work landed — **PiKaOs `develop`** (ahead 2, unpushed): `5fbfe14` drop per-repo CLAUDE.md (single shared router at the umbrella root) · `61d5f12` split 4-stack as the only way to run (removed root all-in-one compose; new `deploy/docker-compose.data.yml` + `frontend.dev.yml` + `stop.bat`; sim.yml = default DEV overlay; CI seeds `*.example` then runs split stacks). **PiKaOs-Docs `main`** (ahead 2): `ac90a23` translate all doc prose Thai→English + consolidate single router (new `docs/pikaos-dev-rules.md` + `docs/architecture/ports.md` + `docs/prompts/`). **PiKaOs-Plugin `main`** (ahead 3, **one repo holds both apps**): `5a2b43a` Compare ports → 5174/8001 (registry) · `c5496c6` **add RedirectMap app** (5175/8002, 55 files, first time tracked — verified no node_modules/.env/secrets; `Ref/` = one 21KB xlsx). **Nothing pushed yet.**
> **(E5 — real bge-m3, build-order §6.7 step 1, code half ◐)** the gap was: ingest only fired on upload → no way to re-embed existing docs after flipping the embedder. Added the **"single rebuild command"** ([knowledge-rag.md §3](../architecture/knowledge-rag.md)): `repositories/documents.ids_for_reindex` (owner-scope + `embedding_model != current` stale filter, oldest-first) → `services/knowledge_service.reindex_targets` (admin = whole corpus · else own docs · `only_stale`) → **`POST /api/knowledge/reindex`** ([routers/knowledge.py](../../../PiKaOs-Core/Backend/app/routers/knowledge.py), `codex.manage`, returns `{matched, queued, model}`, best-effort enqueue, idempotent) + schema `KnowledgeReindexOut`. **Frontend:** `api.js reindexKnowledge` + a **"Rebuild index" button** in the codex live panel ([codex.jsx](../../../PiKaOs-Core/Frontend/src/screens/extra/codex.jsx) `CodexDocs`, gated by `codex.manage`) + i18n `codex.docs.reindex*` (en/th). flip = **env** (`embed_provider=ollama` in `.env.ai`, Tier-0 bootstrap per the config comment — no UI for the flip in v1). `tests/test_knowledge.py::test_reindex_targets_scope_and_stale_filter` added (repo + service, real DB).
> **(E5 verified live ✅ [2026-06-19])** ran on the 4-stack: **backend 187 tests green** · **vite build green** (121 modules — FE edits compile) · pulled **bge-m3 (1.2GB)** into the pikaos-ai ollama (profile `localai`) · `EMBED_PROVIDER=ollama` in `.env.ai` · direct adapter proof (`OllamaEmbedder` → real 1024-dim vector, not a hash) · **full API E2E** (login admin → upload .md → worker ingest `done` model=bge-m3 → `POST /reindex` → `{matched:1, queued:1, model:'bge-m3'}` → semantic search ranks **paraphrased** queries correctly: "how many docker stacks…" → Deployment chunk **0.669** > 0.331; "what runs background jobs" → arq-worker chunk **0.483** > 0.424). **⚠⚠ load-bearing gotcha (cost us a wrong-looking run):** flipping `EMBED_PROVIDER` requires **recreating BOTH the backend AND the worker** — the **search query is embedded in the web/backend process** (reads `.env.ai` via backend.yml env_file) while chunks are embedded in the worker; if only the worker is flipped, query(stub) vs chunks(bge-m3) live in different spaces → near-zero/garbage scores (saw 0.024/-0.013 before recreating the backend). Base URL differs per process and is already handled: worker→`ollama:11434` (ai.yml override, same net), backend→`host.docker.internal:11434` (host-published ollama, `.env.ai` default). `.env.ai` is gitignored (local runtime) — the flip is not committed; `.env.ai.example` documents the option. **Next: E6 converters (pdf/word→md + keep Ref via `documents.source_object_key`) → E7 ingest enrich A+B + RAG answer service (search→answer+citations).**
>
> **[2026-06-18] split 4-stack as default** — removed root all-in-one docker-compose.yml, moved data → [`deploy/docker-compose.data.yml`](../../../PiKaOs-Core/deploy/docker-compose.data.yml), added [`deploy/docker-compose.frontend.dev.yml`](../../../PiKaOs-Core/deploy/docker-compose.frontend.dev.yml) (Vite dev :5173 → host.docker.internal:8000), [`sim.yml`](../../../PiKaOs-Core/deploy/docker-compose.sim.yml) = dev overlay (host.docker.internal URLs + UVICORN_RELOAD + bind-mount + extra_hosts host-gateway), start.bat → launch 4 stacks + stop.bat, CI uses split, [ports.md](../architecture/ports.md)/[CLAUDE.md](../../../CLAUDE.md)/[deploy.md](../architecture/deploy.md)/[tech-stack](../architecture/tech-stack.md) synced. **Gotcha:** if an old `pikaos-data_*` volume was init'd with mismatched creds → backend auth fails via host.docker.internal (localhost masks it via trust) → `docker compose -p pikaos-data -f deploy/docker-compose.data.yml down -v` then up again.
>
> **[2026-06-18] Lock design: Agentic GraphRAG (knowledge base system) → [knowledge-rag.md §6](../architecture/knowledge-rag.md) + plan E5–E9:** consulted with user → extend Phase E into a full knowledge base. **Ingest:** File(pdf/word/md) → markdown (truth, MinIO) + keep original as **Ref** (`documents.source_object_key`) → **summarize at ingest** [A context-prepend (free) + B doc-summary (1 call/doc); C contextual-chunk deferred] → bge-m3 embed (summary+chunks) → pgvector. **Query:** rewrite → 2-level retrieve (summary→chunk + scope) → synthesize + **citations(Ref)**. **Key insight (user pushed):** "summaries are necessary, otherwise retrieval has problems" → correct: raw chunks lack context so retrieval is poor; **doc summary = coarse layer "find the file fast" instead of a graph** (much simpler). markdown remains truth; summary/links/embeddings = derived, one-way rebuild from md (hard rule §0). model for summarize/answer goes through `llm_connections` (dev=quality API, local once GPU available); embed=bge-m3. **Hermes (multi-agent) is not tied to basic search** — search/answer = single LLM loop; Hermes wraps complex queries in a later phase. graph + **Obsidian-style UI** (force-graph + node-detail panel per user's mockup) = **E9 deferred**. **v1 = E5–E8** ("upload any file → ask → answer with sources"). **New order: E5–E8 before D1/HERMES** (knowledge base = the agent's foundation). **New deps: `pypdf` + `mammoth`/`python-docx`** (tech-stack decision before E6). **Next: start E5 (real bge-m3)** — pull bge-m3 on pikaos-ai + flip `embed_provider=ollama` + re-ingest existing docs.
>
> **[2026-06-18] Local AI (Ollama llama3.2:1b) on pikaos-ai ✅ truly verified:** enabled compose profile `localai` → ollama service in pikaos-ai + `ollama pull llama3.2:1b` (1.3GB). **proof:** (1) direct `POST /api/generate` → response `'PIKAOS LOCAL AI OK'` (load 3.3s / total 3.6s on CPU, no GPU); (2) **app adapter** — ran `OllamaProvider.complete()` ([llm_ollama.py](../../../PiKaOs-Core/Backend/app/services/llm_ollama.py)) from inside the worker container (pikaos-ai): `LLM_BASE_URL=http://ollama:11434` → local model → real completion (`TEXT='PIKAOS LOCAL AI OK'`, stop=end, tokens=42). Proves the worker (AI box) uses a local model server in the same box — backend uninvolved / not competing for resources. **Limitation:** no REST endpoint yet to trigger `agent_run` (the worker can handle it but there's no enqueue route — only ingest) → full agent loop e2e can't yet be fired via the API; but every layer it depends on (local model serve · worker→ollama reachability · app OllamaProvider adapter) is verified. provider flip = env `LLM_PROVIDER=ollama` or (the correct no-hardcode way) create an llm_connection via API/UI (not done yet — optional). **ollama + model still run in pikaos-ai (use RAM)** — shut down when unused: `docker compose -p pikaos-ai --profile localai down` (leaving worker: `... up -d`). **Aside:** removed `design-system/` from PiKaOs main (`465212a`, pushed — all 87 files live in PiKaOs-Docs); develop no longer has it.
>
> **[2026-06-18] Split AI tier into pikaos-ai (worker + Ollama-profile) ✅ verified cross-stack:** user's rationale: "may run a local AI server myself — if merged with backend it competes for resources / is slow". worker (arq: agent loop + RAG ingest) = AI tier, talks to backend via **Redis queue + Postgres, not HTTP** → splitting boxes needs no inter-service key. Added [`deploy/docker-compose.ai.yml`](../../../PiKaOs-Core/deploy/docker-compose.ai.yml): worker (env `${VAR:-default}` → runs in both dev/prod) + **ollama** service behind compose **profile `localai`** (opt-in, not loaded by default — no need to load GB models yet); worker → `http://ollama:11434` when provider=ollama. rewired the running sim (prod-mode) → **4 projects**: `pikaos-data · pikaos-backend (API only, worker removed) · pikaos-ai (worker) · pikaos-frontend`. **verified cross-stack:** worker(pikaos-ai) connects to external Redis prod-auth across stacks (`Starting worker for 3 functions`, `clients_connected=3`); upload doc (backend) → enqueue Redis (data) → worker(ai) pulls job → log `ingest_document(7a8c…) ● done — 2 chunks (model=stub)` → writes pgvector (data) → semantic search 2 hits. AI truly split by network/project. recipe → [deploy.md §2.8](../architecture/deploy.md). **Pending:** `ai.yml` not committed yet (along with the existing pile) · to prove a real local model = `--profile localai up` + `ollama pull llama3.2:1b` + `LLM_PROVIDER=ollama` in `.env.ai` (not done yet — avoiding a GB download) · the 4-project stack is still running.
>
> **[2026-06-18] Prod-mode on docker (the real thing, on split) ✅ verified live:** elevated §2.6 dev-sim → **production** on the existing 3 stacks. `ENVIRONMENT=production` + real strong secrets (gen `secrets.token_hex`) + **Redis auth** + `COOKIE_SECURE=true` — **dev `Backend/.env` untouched** (keeps start.bat from breaking). secrets live in `deploy/.env.prod` (**gitignored** — added `.env.prod` to [.gitignore](../../../PiKaOs-Core/.gitignore); template [`.env.prod.example`](../../../PiKaOs-Core/deploy/.env.prod.example) tracked). overlays have **no secrets**, referencing `${VAR}` interpolation from `--env-file`: [`docker-compose.prod.data.yml`](../../../PiKaOs-Core/deploy/docker-compose.prod.data.yml) (db/redis/minio init prod creds; `environment:` beats `env_file:`) + [`docker-compose.prod.backend.yml`](../../../PiKaOs-Core/deploy/docker-compose.prod.backend.yml) (backend+worker prod env, YAML anchor `*prod-env`). ⚠ must `down -v` to wipe pgdata first (Postgres bakes the password only at first init). **verified:** migrate 0001–0005 + seed ran on external prod DB · backend boots clean with log **"Application startup complete"** = `production_violations()` passed (guard checks JWT/SECRET_KEY≥32 · cookie_secure · seed_password · minio_secret_key · redis_url-has-pw) · `ENVIRONMENT=production COOKIE_SECURE=true` truly active in container · **Redis auth enforced** (`NOAUTH` if no pw / `PONG` if pw) · login(prod seed) 200 + Set-Cookie `HttpOnly; SameSite=lax; **Secure**` · `/me` 27 perms (RBAC on external prod DB) · `/api/storage/status` external `reachable:true` without leaking secret · SPA `localhost/` 200 + proxied `/api/health` 200 + deep-link fallback 200. recipe → [deploy.md §2.7](../architecture/deploy.md). **⚠ HTTPS caveat:** `COOKIE_SECURE=true` → refresh cookie sent only over HTTPS; on http the access-token login works but the refresh round-trip needs TLS in front (real prod has HTTPS) — correct behavior, not a bug. **Pending:** new files (prod overlays + .env.prod.example + .gitignore + deploy.md §2.7) not committed yet (awaiting user's go-ahead) · the prod-mode stack is still running · next, for a full browser flow = add TLS termination (self-signed) in front of the frontend.
>
> **[2026-06-18] Simulate split-service deploy with Docker (topology B) ✅ verified live:** rehearsed split-deploy on one machine = **3 stacks split by project/network** to prove the env-driven switch for real (without touching code). Added overlay [`deploy/docker-compose.sim.yml`](../../../PiKaOs-Core/deploy/docker-compose.sim.yml) (overrides `DATABASE_URL`/`REDIS_URL`/`MINIO_ENDPOINT` → `host.docker.internal` via `environment:`, which beats `env_file`; backend+worker see the datastore as **external**, mimicking RDS/ElastiCache/S3 reached by URL). Order: `docker compose down` → `pikaos-data` (db+redis+minio, publish ports to host) → `pikaos-backend` (backend.yml+sim.yml, build) → `pikaos-frontend` (nginx prod, `BACKEND_URL=http://host.docker.internal:8000`). **verified:** migrate 0001–0005 + seed ran against external Postgres successfully · `/api/health` `db/redis/minio = ok` · login + `/me` 27 perms · `/api/storage/status` `endpoint=host.docker.internal:9000 reachable:true` without leaking secret · SPA `localhost/` 200 + proxied `localhost/api/health` 200 + deep-link fallback 200 · **truly split network** `pikaos-backend_default` has only backend+worker (no datastore). recipe + verify steps → [deploy.md §2.6](../architecture/deploy.md). **Back to all-in-one:** shut down the 3 projects then `start.bat`. **Pending:** sim.yml + deploy.md not committed yet (awaiting user's go-ahead) · the sim stack is still running.
>
> **[2026-06-18] Env split per component + prep for split-server deploy ✅ (4 steps):** **Storage pluggable** — `storage_provider`(minio|s3)+`storage_region`, [`storage.py`](../../../PiKaOs-Core/Backend/app/storage.py) `status()`, route `/api/storage/status|test` (read-only, gated by new perm `infra.manage`) + tools-tab `StoragePanel`. Switch to S3 = edit env ([memory `no-hardcode-config-driven`](.) tier boundary: Tier0 .env-only · Tier1 read-mostly+guarded · Tier2 UI). · **Env forward fix** (`7dc6382`) — compose didn't forward SECRET_KEY/ENVIRONMENT/STORAGE_*/LLM keys → settings in .env were ignored (worker without SECRET_KEY = can't decrypt LLM key); fixed + complete .env.example + SECRET_KEY guard. · **Env split per component** (`cf7f82a`) — root .env → **`Backend/.env`** (stack+DB/MinIO creds: db·minio·backend·worker) · **`.env.ai`** (LLM/embed: backend·worker) · **`Frontend/.env`** (VITE_* public). compose `env_file:` per service (dropped interpolation), db healthcheck `$$POSTGRES_USER`. **Multi-server prep (4 steps):** (1) `7468877` Redis auth optional in dev / enforced in prod (`REDIS_PASSWORD`+`--requirepass`, prod guard requires `redis_url` to have a pw) · (2) `809d96c` Frontend Dockerfile multi-stage (target `dev`=vite / `prod`=nginx static + proxy `${BACKEND_URL}` resolver-deferred) · (3) `d3aca85` [`deploy/`](../../../PiKaOs-Core/deploy) per-role compose (backend.yml=API+worker · frontend.yml=nginx; existing all-in-one untouched) · (4) [`deploy.md`](../architecture/deploy.md) (same-server↔3-server · sizing+cost · prod checklist). **186 tests · build green · auth path truly verified (NOAUTH/PONG) · prod nginx serves SPA 200.** AI server=worker talks via shared Redis/DB, not the API → no inter-service key needed. **Next:** pick a cloud → IaC/k8s + CI/CD per component · UI verify (playwright MCP).
>
> **[2026-06-18] E4 (UI codex against the API) + Storage pluggable ✅:** **E4** — codex screen ([extra/codex.jsx](../../../PiKaOs-Core/Frontend/src/screens/extra/codex.jsx)) adds a **"เอกสาร (live)"** mode alongside the existing "บันทึก (local)" mode (Segmented toggle): upload→`POST /api/knowledge/docs` · list + ingest_status badge · **semantic search** `GET /search` · delete + download (presigned). `api.js` `raw()` adds `form` (multipart) + `listDocuments/getDocument/uploadDocument/deleteDocument/searchKnowledge`. upload/delete gated by `codex.manage`. `Codex` receives `can` (passed by App.jsx). i18n `codex.mode.*`/`codex.docs.*` (th+en). commit `1a8f70e`. **Storage pluggable (no-hardcode tier boundary)** — answering the user's question "is moving MinIO config into the UI appropriate?": **analysis → drew 3 tiers** (Tier0 bootstrap=.env only · Tier1 infra=read-mostly+guarded · Tier2 app=full UI; rule "breaks one feature→UI is fine · breaks the whole system / is a key that decrypts a secret→.env"). Did the Tier-1-safe part: storage **pluggable via .env** (`storage_provider` minio|s3 + `storage_region`; the same `minio` client talks to MinIO/AWS S3 — switch=edit env, no code change) + tools tab **read-only `StoragePanel`** (provider/endpoint/bucket/region + Test-connection) gated by new perm **`infra.manage`** (admin) · `routers/storage.py` `/api/storage/status|test` returns no creds · `test_storage.py` (admin 200 without leaking secret · manager 403). **creds stay in .env (Tier0), not editable via UI**. commit `256facc`, **185 green + build green**. (memory `no-hardcode-config-driven` updated with the tier boundary.) **Next:** UI verify (playwright MCP) · enable real retrieval (Ollama/key) · to open Tier-1 cred editing via the UI requires test-before-save+SSRF guard+audit+migration.
>
> **[2026-06-18] E3 — RAG retrieval into the agent loop ✅:** before running the agent → prepend top-k codex chunks as system context the LLM can cite. `services/retrieval_service.py` (`query_from_input` = task/first-user-msg · `format_context` numbered `[n]` · `context_for_run` owner-scoped: admin sees all / else org-wide ∪ dept ∪ own — reuses `doc_chunks.search`+`get_embedder()`) → `agent_runner` injects after `messages_from_run`, **gated by `config.engine_retrieval_top_k`** (default **0=off** → existing + engine tests unaffected), best-effort try/except (retrieval failing doesn't fail the run) + **creates no run_step / consumes no quota** → safe to re-derive on resume. embedder = config (`embed_provider`, separate from LLM role). `tests/test_retrieval.py` (pure + owner-scope DB). commit `fdd008b`, **184 green**. **Next E4** (UI codex: upload/ingest status/search against the API) · enable for real: set `engine_retrieval_top_k>0` + connect a real LLM/embed provider · UI verify (pending playwright MCP restart).
>
> **[2026-06-18] Close the LLM+RAG loop: run docker · review · verify E2E · commit + ER doc:** brought the whole stack up on docker (db = `pgvector/pgvector:pg16`, migrations 0003/0004/0005 + seed ran through, backend healthy) → **`pytest` = 181 green** (4 warnings = the old JWT key-length ones). **(review found + fixed a real bug)** the test→review→commit loop caught a **permission mismatch**: all `/api/llm/*` (incl. list GET) gated by `llm.manage` (admin-only), but NAV "จัดการเครื่องมือ" ([data.jsx](../../../PiKaOs-Core/Frontend/src/data/data.jsx) `toolsmgr`) + `AiApiPanel` gated by `options.manage` → **a manager could open the screen but the panel 403'd** (loads on mount). `llm.manage` was also missing on the frontend. **Fix:** added `llm.manage` to [data-users.jsx](../../../PiKaOs-Core/Frontend/src/data/data-users.jsx) PERMISSIONS (group Admin → admin gets it automatically) + [screens-tools.jsx](../../../PiKaOs-Core/Frontend/src/screens/screens-tools.jsx) computes `mayLlm = can("llm.manage")`, renders the "AI MODEL & API" section only when `mayLlm`, passes `mayEdit={mayLlm}` (a custom role with llm.manage but not options.manage can edit). vite build green. **(real E2E verify — not just unit tests)** hit the live backend (httpx like the test suite): login→llm list/create/activate/bind role(`engine/search/summarize`)→**API key not leaked in the response** (`api_key_set` only, `key leaked? False`)→bad provider 400→upload .md→worker ingest `pending→done` in 2s→RAG search 2 hits top score **1.0** (pgvector cosine)→delete cascade. Full flow HTTP→service→repo→DB/MinIO→arq worker→pgvector→perm gate→secret mask. **commit `42cca31`** "feat: runtime LLM provider config (Ollama/OpenAI/Anthropic) + knowledge RAG" — `develop` is ahead of `origin/develop` by **2 commits, not pushed yet**. **(ER doc + process rule)** audited 17 tables: **dropped nothing** (the schema is well curated — unused tables already deferred; `rooms` is the only one with 0 code but it's in the engine baseline, **intentionally locked** [modularity.md](../architecture/modularity.md) §1). Rewrote [**data-model.md**](../architecture/data-model.md) = ER as-built table by table (what each column holds · what an FK does when the parent is deleted · status legend 🟢LIVE 11/🟡ENGINE 4/⚪unused 1=rooms/🧪TEST 1=stub_tool_writes · ER mermaid · FK map) **in non-technical language**. **New rule (hard rule): change the schema → update data-model.md in the same commit** → CLAUDE.md §2.3 + task router (both repos) + pointer docs/README.md. **⚠️ process risk:** [PiKaOs-Core/CLAUDE.md](../../../CLAUDE.md) = **gitignored** (local-only) → can drift from the tracked one ([PiKaOs-Docs/CLAUDE.md](../../../CLAUDE.md)); must decide which is canonical. **Not yet verified:** real UI clicks (the จัดการเครื่องมือ screen) + a real provider call (used the stub embedder, didn't hit Ollama/Anthropic for real). **Next:** push develop? · E3 (`agent_runner` pulls top-k chunks into context + binds provider role `search`) · E4 (UI codex: upload/ingest status/search) · C3 HERMES · verify UI/real-provider · fix the gitignored CLAUDE.md drift.
>
> **[2026-06-17] Phase E / M2 RAG core ✅ (ingest + semantic search):** the vector layer of the knowledge base ([knowledge-rag.md](../architecture/knowledge-rag.md) §3) — pgvector turned back on. **E1 locked: embedding = bge-m3 / dim 1024 / via Ollama** (`config.embed_*`: provider/model/base_url/dim/chunk_max/top_k; **default provider `stub`** → dev/test run offline without Ollama). · db image `postgres:16-alpine` → **`pgvector/pgvector:pg16`** · migration `0005_doc_chunks` (`CREATE EXTENSION vector` + table `doc_chunks(embedding vector(1024))` + HNSW cosine index + columns `documents.ingest_status`/`embedding_model`). · `models.py` adds a custom `Vector` UserDefinedType (DDL-only) + `DocChunk` (FK `document_id` **ON DELETE CASCADE** → deleting a doc = no orphan vectors · owner/dept denormalized from the doc for scope filtering). · pipeline: [`services/embeddings.py`](../../../PiKaOs-Core/Backend/app/services/embeddings.py) (`StubEmbedder` deterministic hash unit-vector + `OllamaEmbedder` `/api/embed` via httpx **zero-dep** + `get_embedder()` factory from config) · [`services/chunking.py`](../../../PiKaOs-Core/Backend/app/services/chunking.py) (`chunk_markdown` splits by heading + splits long sections — pure) · [`services/ingestion_service.py`](../../../PiKaOs-Core/Backend/app/services/ingestion_service.py) (read MinIO `storage.get_object` → chunk → embed → `replace_chunks`; pdf/image = `skipped` pending OCR · mark `ingest_status`) · [`repositories/doc_chunks.py`](../../../PiKaOs-Core/Backend/app/repositories/doc_chunks.py) **raw SQL** (asyncpg has no vector codec → send a `'[..]'::vector` literal, no pgvector binding added) `replace_chunks`/`search` (`<=>` cosine + scope `can_view` in SQL)/`delete`/`count`. · arq job `ingest_document` (worker) + [`app/queue.py`](../../../PiKaOs-Core/Backend/app/queue.py) (`enqueue` best-effort A9) — knowledge router enqueues after upload. · `GET /api/knowledge/search?q=&k=` (read = logged-in user, scope in service: admin/dept/owner) + schemas `KnowledgeSearchResult/Out` + `DocumentOut.ingest_status`. · tests: `test_chunking`+`test_embeddings` (pure, **14 pass local**) + `test_doc_chunks` (pgvector search/scope/cascade) + `test_ingestion` (stub embedder + monkeypatch MinIO, real DB). **Not run on docker yet** (db image changed → needs a rebuild; see "how to verify" at the end of this entry). **Next E3: `agent_runner` step 1 pulls top-k into context + binds provider role `search` · E4 UI codex (upload/ingest status/search).** The "delete doc → it's gone" criterion ✅ passes via CASCADE. **verify:** user runs `start.bat` (rebuilds db to pgvector — if there's a collation warn/conflict, delete the `pikaos_pgdata` volume then start again, seed recreates it) → `docker compose exec backend pytest` (expect ~161+22≈183 green).
>
> **[2026-06-16] No-hardcode — LLM config settable in DB/UI (server-scope) ✅:** user's new principle = **stop hardcoding everything, configure from "จัดการเครื่องมือ" + DB** ([memory: no-hardcode-config-driven]). config has 2 levels: **server** (admin-set, shared — e.g. LLM API-vs-Local, search model) + **per-user**. Built the server-LLM slice:
> migration `0003_llm_connections` (provider/model/base_url/`api_key_enc`/`is_active` + partial unique index for 1 active) · `app/crypto.py` (Fernet, key derived from `secret_key`/jwt_secret — **added dep `cryptography`**) · `repositories/llm_connections.py` · `services/llm_config_service.py` (encrypt key, mask on read `api_key_set`, `ConfiguredLLMProvider` resolves the active row per call with a 15s cache → editing in the UI needs **no restart**, falls back to .env) · `routers/llm_config.py` `/api/llm/connections` CRUD+`/activate` gated by **`llm.manage`** (added to seed) · worker startup uses `ConfiguredLLMProvider` instead of building from settings. `tests/test_llm_config.py` (crypto roundtrip · mask · build_provider · DB activate 1-active). ✅ **159 tests green** (install cryptography live + restart backend/worker; **must rebuild the image (start.bat) once** to make the dep permanent). **(2) Frontend rewire ✅ (2026-06-16):** `AiApiPanel` ([screens-tools.jsx](../../../PiKaOs-Core/Frontend/src/screens/screens-tools.jsx)) drops hardcoded `SM_MODELS`/localStorage → calls the real `/api/llm/connections` (list/add/activate/delete · provider dropdown ollama/openai/anthropic · model free-text · SecretInput · "กำลังใช้" badge). `api.js` +5 fn · i18n `llmcfg.*` (th+en) · fixed a section title that wrongly recycled `head.title`. **build + lint green (0 errors)** in docker. Visible on the "จัดการเครื่องมือ" screen → AI MODEL & API. Secrets = **encrypt-in-DB**. **(3) Per-system LLM assignment (role assignment) ✅ (2026-06-16):** migration `0004_llm_role_bindings` (`role` pk → `connection_id` FK CASCADE) · `repositories/llm_role_bindings.py` · `llm_config_service.ROLES=("engine","search","summarize")` + `roles_out`/`set_role`/`provider_for_role` (resolve **role binding → active → .env**, per-system cache) · `ConfiguredLLMProvider(role="engine")` · `routers/llm_config.py` `roles_router` `/api/llm/roles` (GET list · PUT `/{role}` set/clear) gated by `llm.manage` · `api.js` `llmRoles`/`setLlmRole` · `AiApiPanel` has a "มอบหมายให้ระบบ" section (Select connection per role, "ค่าเริ่มต้น"=active) · i18n `llmcfg.roles.*`/`llmcfg.role.*`. Admin can choose that search/RAG uses llama while engine uses Claude. ✅ **161 tests green + build green** (smoke endpoint: list 3 roles · bad role→400 · clear→200). **Next: generic `configs` table (server+user scope) for per-user prefs + bind role `search` when building RAG (phase E/M2).**
>
> **[2026-06-16] C1 cont. — OpenAI + Anthropic adapters ✅ (all 3 real providers complete):** added `services/llm_openai.py`
> (`/chat/completions`, Bearer, `to_openai_messages`/`to_openai_tools`/`parse_openai_response`, tool-call id threading `call_<n>`, tokens=`total_tokens`)
> + `services/llm_anthropic.py` (`/v1/messages`, headers `x-api-key`+`anthropic-version: 2023-06-01`, `to_anthropic` hoists system → top-level,
> assistant `tool_use`↔user `tool_result` linked by `tool_use_id` using synthetic id `toolu_<n>`, **doesn't send `temperature`** (400 on Opus 4.8), `max_tokens` required,
> default model `claude-opus-4-8`). **Based on the claude-api skill** (endpoint/header/model id exact, not guessed). Called via the **existing httpx — no SDK dep added**
> (matches the zero-dep ethos + same as Ollama). new config `openai_api_key`/`openai_base_url`/`openai_default_model` · `anthropic_api_key`/`anthropic_base_url`/`anthropic_version`/`anthropic_default_model` · `llm_max_tokens`.
> `worker.build_llm_provider()` routes 4 ways (stub\|ollama\|openai\|anthropic; default stub → nothing breaks). `tests/test_llm_openai.py`+`test_llm_anthropic.py` (14 cases, helpers + `complete()` via httpx MockTransport — no key needed).
> ✅ **152 tests green in docker.** Use for real: set `LLM_PROVIDER=anthropic` + `ANTHROPIC_API_KEY=...` (or `openai`+`OPENAI_API_KEY`) in `.env` → restart worker. **Next: streaming (token-delta) to close C1 / C2 rate-limit / C3 HERMES / M2 RAG.**
>
> **[2026-06-16] Knowledge base M1 (storage layer) ✅:** the markdown layer of the knowledge base ([knowledge-rag.md](../architecture/knowledge-rag.md) §5).
> `repositories/documents.py` (SQL + dept-scope `_scope`: org-wide when `department_id=NULL` ∪ the user's dept · `user_department_ids`) ·
> `services/knowledge_service.py` (pure: `safe_name`/`build_object_key`/`infer_kind`/`can_view`/`can_manage` + create→MinIO(`to_thread`)+row / list / get(presigned) / delete) ·
> `routers/knowledge.py` = `POST/GET/DELETE /api/knowledge/docs` (write gated by **`codex.manage`** already in seed · read = logged-in user, scope in service · upload cap 25MB) ·
> new `storage.remove_object` · `schemas.DocumentOut/DocumentListOut` · wired in `main.py`. The `documents` table + MinIO already exist (reused). **The first real write endpoint** (previously only pure require_perm tests).
> `tests/test_knowledge.py` (pure helpers + scope + repo dept-scope on a real DB). ✅ **ran: 138 tests green** (`docker compose exec backend pytest`, 2026-06-16 — incl. C1 + M1, 4 warnings = the old JWT key-length ones).
> **Next M2 (RAG core):** migration `CREATE EXTENSION vector` + `doc_chunks(embedding vector(1024))` · chunk by heading · embed bge-m3 (Ollama, reuse) + StubEmbedder · ingestion arq job · retrieval `GET /api/knowledge/search`.
> (CLAUDE.md hit 300 lines — knowledge's router row not added yet; awaiting a trim.)
>
> **[2026-06-16] Phase C begins — C1 (Local/Ollama) ✅:** the first real LLM provider. `services/llm_ollama.py` =
> `OllamaProvider.complete(model, messages, tools)` follows the existing `LLMProvider` interface (B3) → swaps in **without touching the agent loop**.
> 3 pure helpers: `to_ollama_messages` (convert assistant/tool_call/tool → ollama) · `to_ollama_tools` (schema → function spec,
> default empty params) · `parse_ollama_response` (normalize tool-use from `message.tool_calls`, tokens = prompt+eval).
> Calls `/api/chat` (stream=false) via the **existing httpx — no dependency added**. new config `llm_provider`/`llm_base_url`
> (default `host.docker.internal:11434`)/`llm_default_model` (`llama3.1`)/`llm_request_timeout_s`; **default `llm_provider="stub"`**
> → existing code + 117 tests unbroken. `worker.build_llm_provider()` picks stub↔ollama by config (tools still stub until C5).
> `tests/test_llm_ollama.py` (11 cases: helpers + `complete()` via httpx `MockTransport`, no Ollama needed). ✅ ran in docker (incl. in the 138 green).
> Try it for real: `ollama pull llama3.1` on the host → set `LLM_PROVIDER=ollama` in `.env` →
> restart worker. **Next: C1 cont. (OpenAI/Anthropic adapter + streaming) or C3 (HERMES plan/advance/finalize).** Linux: add
> `extra_hosts: ["host.docker.internal:host-gateway"]` to the `worker`/`backend` services in compose.
>
> **[2026-06-16] B7 ✅ — Phase B fully closed (B1–B7):** structured logging — `app/logging_ctx.py` (contextvars +
> `RunContextFilter` stamps every log record with `run_id`/`parent_run_id`/`quest_id`/`agent_id`) · `bind_run`/`reset_run`
> in `agent_runner.run_job` (per job, no leak across runs) + enrich in `run()` · `configure_worker_logging` (scoped `pikaos.*`,
> propagate=False so it doesn't clash with arq) · added INFO `run started`/`run done`. real worker smoke: `INFO pikaos.engine
> [run=… quest=…] run done (steps=3, tokens=7)`. **117 tests green.** Phase B (engine core with stub) done — **next
> Phase C (HERMES + real LLM provider)** or infra work the user asks for (take backend out of docker → run via cmd, leaving only services in docker).
>
> **[2026-06-16] Modularity + ER consolidation (clean DB):** Decision **Modular Monolith** (locked,
> [modularity.md](../architecture/modularity.md)) — each system is a module (bounded context) that can be deployed locally per department · rule: FKs point to
> **core only** (no module↔module; soft-ref) · footprint per system (stateless=no DB · engine=Postgres-lite) ·
> ship select modules with `ENABLED_MODULES` + compose `profiles` (one codebase, no fork). **ER consolidation:** merged
> the 5 old migration files → `0001_baseline` (organized by module core/knowledge/engine) + `0002_stub_tool_sink` (test fixture, separate) ·
> **deferred `subtasks`(C3)/`tools_config`(C5)/`notifications`(C6)** that no code touches yet → 17→**13 domain tables** · ER §7 rewritten/removed
> embedding · recreated volume · **112 tests green**. Code is still flat — moving into `app/modules/` = a later-phase job (one module at a time, starting with compare).
> **Next (pick):** move code into modules one by one · build real `ENABLED_MODULES`/profiles · go back to finish B7 (logging) · phase C/D.
>
> **[2026-06-16] Knowledge storage decision (locked):** chose **Hermes + Obsidian (markdown = source of truth)** ·
> Postgres for structured data · **pgvector = a disposable/rebuildable cache** to enable later when needed. Rationale: important system, low maintenance, durable.
> Wrote the design into [architecture/knowledge-rag.md](../architecture/knowledge-rag.md) (hard rule: one-way rebuild `markdown → vector`,
> no data-only-in-vector · vault structure · criteria for enabling vector) + pointer in docs/README.md · system-design §8 · improvement-plan phase E.
> **Not implemented yet** (the markdown store can be done now, the vector layer = phase E). CLAUDE.md hit 301 lines — no router row added (rule §8).
> **[2026-06-16] Removed pgvector (project clean):** db image `pgvector/pgvector:pg16` → `postgres:16-alpine` · removed `pgvector` from requirements · removed `Document.embedding`+`Vector` import (models + migration 0001) · recreated `pikaos_pgdata` volume (seed-reproducible). Confirmed: `pg_extension where extname='vector'`=0, no embedding column, **112 tests green**. Phase E will `CREATE EXTENSION vector` back when needed (knowledge-rag §4). **Next: redesign/consolidate the ER (merge tables that can be merged, reduce the bloated/hard-to-read ER, emphasize SQL principles).**
>
> **[2026-06-16] Assessed all systems (read-only) + resilience decision:** surveyed FE/BE/infra fully —
> FE is mature (~19k lines, one weakness: no CI/lint/test), BE foundation is solid (auth/RBAC/compare/SSRF)
> but **the engine is still 0 lines**. Added **A7 (SSRF, missing from the table) · A8 (multi-worker+restart) ·
> A9 (graceful degradation)** to [improvement-plan](improvement-plan.md) — cost-effective failure protection without splitting into
> microservices. Fixed the pending [pikaos-dev-rules.md](../pikaos-dev-rules.md) §4 (said RBAC was still client-side even though A1 is done).
> Bottleneck = I/O not CPU → speed up with parallelism/queue, not by optimizing numbers.
>
> **[2026-06-15] docs split by function:** added `process/playbook.md` (working style/guidelines) +
> `process/lessons.md` (experience + decision log — consolidated the "don't repeat mistakes" that used to be in the PROMPT into one place);
> [docs/README.md](../README.md) rewritten as a router split by 4 functions; CLAUDE.md has a **Task router** at the top +
> split out Room §1.7 → [features/room-3d.md](../features/room-3d.md). CLAUDE.md = exactly 300 lines (hit the §8 ceiling).
>
> Existing structure: `architecture/` · `features/` · `process/` + index (COMPARE.md → `features/compare.md`;
> CLAUDE.md + README.md stay at root — **do not move**). Links checked, 0 broken.

### Docs in /docs

| File | Content | Status |
|---|---|---|
| `architecture/system-design.md` | engine/HERMES/WS/data model blueprint + build order | ✅ patched to match risk-mitigation |
| `architecture/design-review.md` | critical review + P0–P2 risks | ✅ (pre-existing) |
| `architecture/risk-mitigation.md` | design fixing 15/15 risks + adjusted build order | ✅ |
| `architecture/tech-stack.md` | real stack + planned additions + dependency policy | ✅ |
| `process/improvement-plan.md` | 6-phase plan A–F + acceptance criteria | ✅ |
| `features/compare.md` | Compare UAT vs Prod (moved from /COMPARE.md) | ✅ in production use |
| `features/checklist-audit.md` | website audit feature per checklist (adapters/matching/verify/IA output) + §3.0 Discovery | ✅ design done, not implemented |
| `features/sitemap-generate.md` | Generate mode: URL → IA diagram (tree builder/classifier/AI Local→API/export) — CLAUDE.md §2.7 points here | ✅ design done, not implemented (phase G1–G3) |
| `features/checklist-templates/ir-website-standard.json` | TIPAK CSV — flat 73 items | ✅ (topic_th empty: re-export UTF-8) |
| `features/checklist-templates/esg-website-standard.json` | SEAFCO PDF IA — tree 159 nodes | ✅ (vision-read: verify against original) |
| `features/checklist-templates/corporate-website-standard.json` | WD emmx — tree 173 nodes/10 menus | ✅ created (`verified:false` — DFS-reconstruct, pending MindMaster verification) |

### "Designed but not coded" risks (order per improvement-plan)
- **Phase A (can start immediately)**: RBAC server-side · WS refactor (token out of URL + per-quest authz) ·
  FK `documents.owner_id` · boot asserts prod secrets · pin minio · passlib→argon2-cffi · CI.
- ✅ **A7 SSRF guard done (2026-06-15)** → [`net_guard.py`](../../../PiKaOs-Core/Backend/app/services/net_guard.py) +
  [`tests/test_net_guard.py`](../../../PiKaOs-Core/Backend/tests/test_net_guard.py) (38 passed locally; live-server auth test runs in docker).
  Remaining: DNS-rebinding (pin IP).
- ✅ **A4 boot asserts + minio pin done (2026-06-15)** → `config.production_violations()` + `main.lifespan`
  (prod + default secret → dies at boot) · [`tests/test_config.py`](../../../PiKaOs-Core/Backend/tests/test_config.py) ·
  `docker-compose.yml` pins minio by digest.
- ✅ **A1 RBAC server-side done (2026-06-15)** → migration `0002_rbac` (4 tables) · `repositories/rbac.py` ·
  `services/rbac_service.py` (effective perms + Redis cache) · `deps.require_perm` · `/me`+login return `permissions[]` ·
  RBAC seed in `scripts/seed.py` · [`tests/test_rbac.py`](../../../PiKaOs-Core/Backend/tests/test_rbac.py) (8 passed, 51 total on machine).
  **Must restart the backend container** for the migration+seed to run. **Phase A is closed** — only A2's Phase B part (per-quest authz + run_steps backfill)
  remains, which waits on the engine tables. ✅ A1·A3·A4·A5·A6·A7·A8·A9 + A2 (P0 token-in-URL + per-user channel) — done 2026-06-16;
  latest migration `0004_engine` (B1 ✅); backend tests **93 green**; CI `.github/workflows/ci.yml` runs for real on push.
> **[2026-06-16] Phase B begins — B1 ✅:** `0004_engine` creates 10 engine tables (`departments`/`user_departments` m:n · `rooms`/`agents`/`quests`/`runs`/`subtasks`/`run_steps`/`tools_config`/`notifications`) + `documents.department_id` · FK/cascade/UNIQUE per risk-mitigation §4.4 · ORM models in `models.py` · schema-only (dept seed + CRUD = phase D). · **B2 ✅** `worker` service in compose + `app/worker.py` (arq 0.28, ping job; enqueue→pong confirmed). · **B3 ✅ (2026-06-16)** `services/agent_runner.run` loop + worker job `agent_run` + `repositories/runs.py` (atomic `reserve_quota`) + config timeouts/max_steps + cancel flag in `redis_client`. 2-phase tool (`idempotency_key="{run_id}:{seq}"`) · resume by effect class (read/idempotent_write→rerun, side_effect/unknown→`waiting_input`) · per-step `asyncio.wait_for` · LLM provider+tool registry **injected** via `set_engine_runtime` (real stub=B4). worker boots with `ping, agent_run`. · **B4 ✅ (2026-06-16)** `services/engine_stubs.py` (StubLLMProvider reads a `@@stub@@`+JSON script from the seed message · StubToolRegistry 3 tools: `echo`=read/`upsert`=idempotent_write/`record`=side_effect) → sink `stub_tool_writes` (migration `0005` + `repositories/stub_tools.py`) → bound via `set_engine_runtime` at `worker.startup` · roll-up `runs.tokens_used` (`add_run_tokens`). Smoke via real worker: run=done, steps=llm/tool(2-phase)/llm, side-effect wrote 1 row, `tokens_used=9`. **101 tests green.** · **B5 ✅ (2026-06-16)** `services/events.py` (per-step+per-run event → Redis `quest:<id>`, best-effort, cap 16KB) — runner emits on every step/status. `services/quest_service.py` (authz `can_view` owner/dept/admin · `snapshot` · `backfill`+cross-quest guard) + `repositories/quests.py`. `routers/ws.py` removes the A2 stub: subscribe→authz→snapshot + `backfill` frame. Real pubsub smoke: `run:running→llm→tool(pending)→tool(done)→llm→run:done`. **108 tests green.** · **B6 ✅ (2026-06-16)** `test_engine_resume.py` — integration on a real Postgres (local-engine + `db_factory` inject, simulate a crash with `_Crash(BaseException)` that slips past `except Exception`). All 4 acceptance gates pass: kill mid side_effect → `waiting_input`, one row written · kill mid LLM → resume the same conversation, no duplication · quota exactly at the line `used==Σ tokens` + `quota_exceeded` · snapshot recovers the timeline. **112 tests green.** **Next B7 (structured logging: every worker line has `run_id`/`parent_run_id`/`quest_id` — closes phase B) → then enter phase C (HERMES + real LLM provider C1–C6) or D (move FE→BE) in parallel.**
- **Recommended next**: bind `require_perm("compare.run")` + rate-limit at compare (compare-hardening §2 already unblocked) or A3 FK (small).
- **Phase B**: engine core + arq + 2-phase resume + atomic quota + timeout.
- ✅ **Answered (2026-06-12): multi-tenancy = one org, many departments** → `department_id` on every scopable table
  from the first migration (design: [system-design §7.1](../architecture/system-design.md#71-department-scoping--multi-tenancy--one-org-many-departments)). Phase B1 is ready to start on this.

### Compare/Sitemap risks
✅ **[2026-06-15] written to file** → [features/compare-hardening.md](../features/compare-hardening.md)
(SSRF P0 + design guard phase A7 · authz/rate-limit P1 · robustness P2/P3) — fully references real code, not implemented yet.

### Audit feature ("enter URL → check missing/extra per checklist → output as IA")
- Design complete in `checklist-audit.md`, not implemented yet.
- Phase 1 (stateless, immediate): `/api/audit/import` (CSV+IA) · `/api/audit` page-level · Audit screen + export.
- **Sitemap Discovery** ✅ written to file as §3.0 in checklist-audit.md (sitemap ∪ crawl menu,
  robots.txt fallback, anchor text → title score, shared SSRF guard with A7, config `audit_crawl_*`).
  Implementation note: `_PageParser` must be extended to capture anchor text alongside href (currently captures only href).

### Source checklist files the user sent (uploads/)
- `20250327-TIPAK-IR-Checklist(...).csv` — IR, corrupted Thai.
- `20260506-SEAFCO-FSTE-ESG-Sitemap.pdf` — ESG IA, image PDF.
- `WD-Sitemap-Template.emmx` — Corporate IA, Edraw MindMaster (binary page.bin; strings extractable, structure imprecise).

### Next tasks (pick)
1. Finish converting WD emmx + verify the structure with the user.
2. docs/features/compare-hardening.md (move compare risks + SSRF guard design).
3. Implement phase A1 (RBAC) or A7 (SSRF) — security work can start immediately.
4. Implement phase 1 of audit.
