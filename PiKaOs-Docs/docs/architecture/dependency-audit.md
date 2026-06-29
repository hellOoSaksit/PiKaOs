---
title: Dependency buy-vs-build audit (system-wide)
type: architecture
status: active
keywords: [dependencies, buy vs build, libraries, audit, pgvector, markitdown, rapidfuzz, litellm, arq, ssrf, reuse]
related: [./tech-stack.md, ../process/ai-runbooks.md, ./knowledge-rag.md, ../process/lessons.md]
summary: >
  System-wide "buy vs build" audit (2026-06-27): every place we hand-roll functionality, the mature
  library that could replace it, and the verdict (SWAP / ADD-later / KEEP-CUSTOM) with the reason.
  The standing rule: prefer a good maintained library over self-maintained code, within the dep policy.
updated: 2026-06-27
---

# Dependency buy-vs-build audit (system-wide)

> Goal (user, 2026-06-27): **use good maintained libraries so we don't have to maintain equivalent
> code ourselves.** This audit surveyed the whole backend for hand-rolled functionality and the
> ready-made tool that could replace it. Method: 3 parallel research passes (RAG/ingestion ·
> web/sitemap/SSRF/scraping · LLM/engine/infra), each cross-checked against the
> [dependency policy](tech-stack.md) and the documented locked decisions ([lessons.md](../process/lessons.md)).
> The standing preference is **buy over build** — but never at the cost of a security boundary, a
> documented locked decision, an AGPL/abandoned/​supply-chain-risk dependency, or the dep policy's
> "don't add a lib for a <1-day pattern". Adopt behind the [safe-upgrade + rollback runbook](../process/ai-runbooks.md#r4--audit-dependencies--versions).

## Headline

The backend is **mostly not accidentally hand-rolled** — most custom code is backed by a documented
locked decision, a security concern, or the dep policy. The whole-system sweep found exactly **one
clear swap worth doing now** (the pgvector codec); everything else is either a deliberate keep or a
deferred adopt-when-it-hurts.

## Verdict table

| Area | Hand-rolled now (file) | Existing tool | Verdict | Why |
|---|---|---|---|---|
| **pgvector access** | `format_vector()` → `'[..]'::vector` string literal (asyncpg has no codec) — [doc_chunks.py](../../../PiKaOs-Core/Backend/app/repositories/doc_chunks.py) | **`pgvector`** 0.4.2 (MIT, official) | **SWAP ✅ now** | Ships an asyncpg codec → deletes the brittle float-`repr` literal the module's own docstring apologises for. Keeps raw-SQL search (the locked decision); only the literal hack goes. ~½ day. |
| **doc → markdown** | pypdf + mammoth, 4 kinds — [converters.py](../../../PiKaOs-Core/Backend/app/services/converters.py) | **MarkItDown** 0.1.6 (MS, MIT) | **ADD later** | Swap when pptx/xlsx/images-OCR/tables are needed: one MIT lib (`markitdown[pdf,docx,pptx,xlsx]`) replaces both + adds formats, in-memory `convert_stream`. (PyMuPDF4LLM rejected — **AGPL**.) |
| **fuzzy / text similarity** | `difflib.SequenceMatcher` — RedirectMap `discover_service.py` (path match) + Compare `compare_service.py` (`bodySim`) | **rapidfuzz** 3.14.5 (MIT) | **✅ ADOPTED (plugin-first, 2026-06-27)** | Maintained C++ similarity, far faster on long bodies; swapped in **both plugins first** (RedirectMap 0.4.1 · Compare 0.1.2) as the testbed before folding into main's compare_service (§6 build-first). Indel ratio ≈ difflib; may differ at the margin (can shift a borderline auto-pick). |
| **LLM adapters** | 3 httpx adapters (no SDK) — `llm_{anthropic,openai,ollama}.py` | official `anthropic`/`openai` SDK; litellm | **KEEP (re-eval at C2)** | No-SDK is deliberate (tech-stack §3). SDKs now only need httpx+pydantic+anyio (already in-stack) → re-evaluate when **streaming + per-provider backoff (C2)** land. **litellm rejected** — Mar-2026 PyPI supply-chain compromise + 100-provider surface. |
| **SSRF guard** | `net_guard.py` (×3 apps) — private-IP block + httpx redirect hook | `advocate` (BSD) | **KEEP 🔒** | The only Python SSRF lib is **abandoned + `requests`-only** (can't attach to our async httpx). Replacing a working security boundary with a dead dep is worse. Real gap = DNS-rebinding pin-IP (hand-write ~20 lines). |
| **HTML extraction** | stdlib `html.parser` — `content.py`, `page_inspect.py` | trafilatura, selectolax, bs4 | **KEEP** | Dated locked "stdlib-only HTML" decision; trafilatura solves NLP-body extraction, not our block-aligned diff / chrome taxonomy / heading outline. Revisit only if `page_inspect` regex breaks in the wild (then selectolax, MIT). |
| **sitemap parse** | async `ElementTree` + caps — `sitemap.py` (×3) | usp (GPLv3, sync), advertools (pandas) | **KEEP** | Ours is async (guarded client injected) + capped + auth-aware; usp is sync (would bypass the SSRF client) + GPLv3. Add robots.txt `Sitemap:` + `.xml.gz` by hand (compare-hardening §3 P2). |
| **chunking** | heading-split — [chunking.py](../../../PiKaOs-Core/Backend/app/services/chunking.py) | LangChain/LlamaIndex splitters, semantic-text-splitter, chonkie | **KEEP** | Heading-bounded chunking is a locked design ([knowledge-rag §3](knowledge-rag.md)); alternatives add Rust/numpy deps to replace ~60 tested pure-py lines. |
| **embeddings client** | zero-dep httpx `OllamaEmbedder` + `StubEmbedder` — [embeddings.py](../../../PiKaOs-Core/Backend/app/services/embeddings.py) | fastembed, sentence-transformers | **KEEP** | Zero-dep embedder is a locked decision; fastembed/ST pull onnxruntime/torch into the worker image. StubEmbedder is the offline-test enabler no lib gives. |
| **agent engine** | `agent_runner.py` (loop/resume/quota/2-phase) | LangGraph, Temporal | **KEEP** | The product's core guarantees (effect-class resume, atomic quota SQL, replay-safety) — explicitly weighed & frameworks rejected (risk-mitigation §1). |
| **RBAC** | `require_perm` + `rbac_service.py` | Casbin, OPA | **KEEP** | "role→perms+overrides is plain" — deliberate (risk-mitigation §2). |
| **IIS web.config** | string template + `quoteattr` — RedirectMap `webconfig.py` | (none) | **KEEP** | No lib generates IIS rewrite configs; stdlib XML-escape is the security-relevant part, done. |
| **xlsx · argon2 · JWT · Fernet · MinIO · alembic · arq** | — | openpyxl · argon2-cffi · PyJWT · cryptography · minio · alembic · arq | **KEEP (already libs)** | Already the right, maintained, correctly-pinned standard libraries. Nothing to do. |

*(Frontend is already built on the React/Vite ecosystem — no hand-rolled equivalents to "buy".)*

## Risk flags surfaced during the sweep

- **arq is in maintenance-only mode (2026).** Still ships fixes (Py 3.14), deliberately chosen over
  Celery — but flag a future Python bump it doesn't follow as the re-evaluation trigger (ReArq is the
  closest async-native successor).
- **litellm PyPI supply-chain compromise (Mar 2026)** — reinforces keeping the 3 custom LLM adapters.
- **PyJWT pinned 2.13.0 = exactly the CVE-2026-48523 fix** — already covered; do not downgrade, and
  never swap to the abandoned python-jose (CVE-2024-33663).
- **net_guard DNS-rebinding pin-IP** is still a TODO — no library does it for httpx; ~20-line custom
  transport, real SSRF hardening.

## Standing decision

Prefer adopting a mature, well-maintained, sensibly-licensed library over hand-maintaining equivalent
code (the user's goal: stop being the maintainer). Gate every adoption through
[R4 — safe upgrade + rollback](../process/ai-runbooks.md#r4--audit-dependencies--versions) so a bad
upgrade can't take the system down. Re-run this audit periodically (R4 trigger). License/abandonment/
supply-chain are hard stops; a documented locked decision is overridden only with explicit approval.
