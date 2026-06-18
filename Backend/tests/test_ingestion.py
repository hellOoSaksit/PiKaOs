"""Tests for the RAG ingestion service (phase E/M2).

Runs `ingest_document` against the real DB (needs pgvector — migration 0005) with a StubEmbedder
and MinIO stubbed out (monkeypatched), so the full chunk→embed→store path is exercised offline.

    docker compose exec backend pytest tests/test_ingestion.py
"""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app import storage
from app.config import settings
from app.models import Document
from app.repositories import doc_chunks as chunks_repo
from app.repositories import documents as docs_repo
from app.services import ingestion_service
from app.services.embeddings import StubEmbedder

_MD = "# Intro\nhello world\n\n## Details\nmore body text here\n\n## More\nand even more"


def test_ingest_markdown_creates_chunks(monkeypatch):
    did = uuid.uuid4()
    monkeypatch.setattr(storage, "get_object", lambda key: _MD.encode("utf-8"))

    async def main():
        eng = create_async_engine(settings.database_url)
        Session = async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as db:
                await docs_repo.insert_document(
                    db, doc_id=did, owner_id=None, department_id=None, kind="md",
                    name="notes.md", object_key=f"k/{did}", content_type="text/markdown", size=len(_MD),
                )
                result = await ingestion_service.ingest_document(db, StubEmbedder(), did)
                n = await chunks_repo.count_for_document(db, did)
                doc = await docs_repo.get_document(db, did)
                return result, n, doc.ingest_status, doc.embedding_model
        finally:
            async with Session() as c:
                await c.execute(sql_delete(Document).where(Document.id == did))
                await c.commit()
            await eng.dispose()

    result, n, status, model = asyncio.run(main())
    assert result == {"status": "done", "chunks": 3}     # 3 headings with bodies
    assert n == 3
    assert status == "done" and model == "stub"


def test_ingest_is_idempotent_replace(monkeypatch):
    """Re-ingesting replaces chunks rather than appending (rebuildable cache)."""
    did = uuid.uuid4()
    monkeypatch.setattr(storage, "get_object", lambda key: _MD.encode("utf-8"))

    async def main():
        eng = create_async_engine(settings.database_url)
        Session = async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as db:
                await docs_repo.insert_document(
                    db, doc_id=did, owner_id=None, department_id=None, kind="md",
                    name="n.md", object_key=f"k/{did}", content_type="text/markdown", size=1,
                )
                await ingestion_service.ingest_document(db, StubEmbedder(), did)
                await ingestion_service.ingest_document(db, StubEmbedder(), did)   # twice
                return await chunks_repo.count_for_document(db, did)
        finally:
            async with Session() as c:
                await c.execute(sql_delete(Document).where(Document.id == did))
                await c.commit()
            await eng.dispose()

    assert asyncio.run(main()) == 3      # not 6 — replaced, not appended


def test_ingest_skips_non_text_kind(monkeypatch):
    did = uuid.uuid4()
    # get_object must not even be called for a skipped kind
    monkeypatch.setattr(storage, "get_object",
                        lambda key: (_ for _ in ()).throw(AssertionError("should skip")))

    async def main():
        eng = create_async_engine(settings.database_url)
        Session = async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as db:
                await docs_repo.insert_document(
                    db, doc_id=did, owner_id=None, department_id=None, kind="image",
                    name="p.png", object_key=f"k/{did}", content_type="image/png", size=1,
                )
                result = await ingestion_service.ingest_document(db, StubEmbedder(), did)
                doc = await docs_repo.get_document(db, did)
                return result, doc.ingest_status
        finally:
            async with Session() as c:
                await c.execute(sql_delete(Document).where(Document.id == did))
                await c.commit()
            await eng.dispose()

    result, status = asyncio.run(main())
    assert result == {"status": "skipped", "chunks": 0} and status == "skipped"


def test_ingest_missing_document_is_noop(monkeypatch):
    monkeypatch.setattr(storage, "get_object", lambda key: b"")

    async def main():
        eng = create_async_engine(settings.database_url)
        Session = async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as db:
                return await ingestion_service.ingest_document(db, StubEmbedder(), uuid.uuid4())
        finally:
            await eng.dispose()

    assert asyncio.run(main()) == {"status": "missing", "chunks": 0}
