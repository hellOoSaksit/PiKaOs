"""RAG ingestion — turn a stored document into searchable chunks (phase E/M2, knowledge-rag.md §3).

The heavy half of the knowledge pipeline, run by the arq worker so embedding a big file can't block
the API (E2). One document at a time: read its bytes from MinIO → chunk along markdown headings →
embed each chunk → replace its rows in `doc_chunks`. Markdown stays the source of truth; these
chunks are a rebuildable cache, so this is safe to re-run any time (it replaces, never appends).

`ingest_document` takes the embedder + db as arguments (not globals) so it's testable directly with
a StubEmbedder against a real DB, exactly like the agent_runner loop. The worker job is a thin shim
that resolves the configured embedder and calls it.

Only text-shaped documents are embedded for now (md / log); pdf/image are marked `skipped` until
extraction/OCR lands (E2, later). No SQL here (repositories) and no FastAPI types (routers) — §2.1.
"""
from __future__ import annotations

import asyncio
import logging

import uuid

from .. import storage
from ..config import settings
from ..repositories import doc_chunks as chunks_repo
from ..repositories import documents as docs_repo
from . import chunking
from .embeddings import Embedder

log = logging.getLogger("pikaos.engine.ingest")

# Document kinds whose bytes are text we can chunk + embed directly. pdf/image need
# extraction/OCR first (deferred) → marked "skipped" so the UI shows they weren't indexed.
_EMBEDDABLE_KINDS = {"md", "log"}


def _embed_text(heading: str, content: str) -> str:
    """What we actually embed for a chunk: its heading (context) prepended to its body."""
    return f"{heading}\n{content}" if heading else content


async def ingest_document(db, embedder: Embedder, doc_id: uuid.UUID) -> dict:
    """Chunk + embed one document into `doc_chunks`. Returns `{status, chunks}`.

    Records ingest state on the document throughout so the result is observable without the
    worker logs. Never raises for an expected condition (missing/non-text doc); on an unexpected
    failure it marks the doc `failed` and re-raises so the job is visibly failed."""
    doc = await docs_repo.get_document(db, doc_id)
    if doc is None:
        return {"status": "missing", "chunks": 0}

    if doc.kind not in _EMBEDDABLE_KINDS:
        await chunks_repo.delete_for_document(db, doc_id)
        await docs_repo.set_ingest_status(db, doc_id, status="skipped", embedding_model="")
        return {"status": "skipped", "chunks": 0}

    try:
        raw = await asyncio.to_thread(storage.get_object, doc.object_key)
        body = raw.decode("utf-8", errors="replace")
        pairs = chunking.chunk_markdown(body, max_chars=settings.embed_chunk_max_chars)

        if not pairs:
            await chunks_repo.delete_for_document(db, doc_id)
            await docs_repo.set_ingest_status(db, doc_id, status="done", embedding_model=embedder.model_name)
            return {"status": "done", "chunks": 0}

        vectors = await embedder.embed([_embed_text(h, c) for h, c in pairs])
        rows = [
            {"seq": i, "heading": h, "content": c, "embedding": vec}
            for i, ((h, c), vec) in enumerate(zip(pairs, vectors))
        ]
        n = await chunks_repo.replace_chunks(
            db, document_id=doc.id, owner_id=doc.owner_id, department_id=doc.department_id,
            embedding_model=embedder.model_name, chunks=rows,
        )
        await docs_repo.set_ingest_status(db, doc_id, status="done", embedding_model=embedder.model_name)
        log.info("ingested document %s — %d chunks (model=%s)", doc_id, n, embedder.model_name)
        return {"status": "done", "chunks": n}
    except Exception:
        await docs_repo.set_ingest_status(db, doc_id, status="failed")
        log.exception("ingest failed for document %s", doc_id)
        raise
