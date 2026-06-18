"""Knowledge / codex HTTP routes — the document store (markdown-as-truth).

Thin edge over services/knowledge_service (§2.1): parse the request → call the service →
shape the response / map domain errors to HTTP. Writes require the existing `codex.manage`
permission; reads are any authenticated user, scoped by department in the service.
RAG search lands here later (phase E) as `GET /search`.
"""
from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from .. import queue
from ..config import settings
from ..db import get_db
from ..deps import get_current_user, require_perm
from ..models import User
from ..schemas import DocumentListOut, DocumentOut, KnowledgeSearchOut, KnowledgeSearchResult
from ..services import knowledge_service
from ..services.embeddings import get_embedder

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

# Refuse files large enough to blow up memory / MinIO on a single dev box. Tune later.
_MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


@router.post("/docs", response_model=DocumentOut, status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    department_id: uuid.UUID | None = Form(default=None),
    user: User = Depends(require_perm("codex.manage")),
    db: AsyncSession = Depends(get_db),
) -> DocumentOut:
    """Store an uploaded file in the codex (MinIO + metadata row)."""
    data = await file.read()
    if not data:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "empty file")
    if len(data) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                            f"file too large (> {_MAX_UPLOAD_BYTES // (1024 * 1024)} MB)")
    doc = await knowledge_service.create_document(
        db, user=user, data=data, name=file.filename,
        content_type=file.content_type, department_id=department_id,
    )
    # Index it for RAG in the background (E2). Best-effort: a Redis outage leaves the file
    # stored with ingest_status="pending" — it just isn't searchable until re-ingested.
    await queue.enqueue("ingest_document", str(doc.id))
    return DocumentOut.model_validate(doc)


@router.get("/search", response_model=KnowledgeSearchOut)
async def search_documents(
    q: str,
    k: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> KnowledgeSearchOut:
    """Semantic search over the codex (RAG retrieval). Returns the top-k chunks the caller may
    read, ranked by similarity. Any authenticated user; scope is enforced in the service."""
    k = settings.embed_search_top_k if k <= 0 else max(1, min(k, 50))
    results = await knowledge_service.search_documents(
        db, embedder=get_embedder(), user=user, query=q, k=k
    )
    return KnowledgeSearchOut(items=[KnowledgeSearchResult(**r) for r in results])


@router.get("/docs", response_model=DocumentListOut)
async def list_documents(
    kind: str | None = None,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentListOut:
    """Documents visible to the caller (own + department + org-wide), newest first."""
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    items, total = await knowledge_service.list_documents(
        db, user=user, kind=kind, limit=limit, offset=offset
    )
    return DocumentListOut(items=[DocumentOut.model_validate(d) for d in items], total=total)


@router.get("/docs/{doc_id}", response_model=DocumentOut)
async def get_document(
    doc_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> DocumentOut:
    """Document metadata + a presigned download URL."""
    try:
        doc, url = await knowledge_service.get_document_with_url(db, user=user, doc_id=doc_id)
    except knowledge_service.NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "document not found")
    except knowledge_service.Forbidden:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
    out = DocumentOut.model_validate(doc)
    out.url = url
    return out


@router.delete("/docs/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    user: User = Depends(require_perm("codex.manage")),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Delete a document (owner or admin)."""
    try:
        await knowledge_service.delete_document(db, user=user, doc_id=doc_id)
    except knowledge_service.NotFound:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "document not found")
    except knowledge_service.Forbidden:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "forbidden")
