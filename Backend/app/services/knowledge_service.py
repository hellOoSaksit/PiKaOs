"""Knowledge / document store — markdown-as-truth (docs/architecture/knowledge-rag.md).

The codex's business logic (M1, phase E storage layer): put an uploaded file in MinIO +
its metadata row, and list/get/delete with owner + department scoping. No SQL here
(repositories/documents) and no FastAPI types (routers/knowledge) — service layer only
(§2.1). RAG ingest/retrieval (the vector layer) is later and reads this same table.

Scoping (system-design §7.1 — single org, many departments):
* a document with `department_id = NULL` is org-wide (everyone may read it);
* otherwise only members of that department (and the owner, and admins) may read it;
* write/delete are gated by the `codex.manage` permission AND ownership (admins override).

MinIO calls are sync (minio lib) → run off the event loop with `asyncio.to_thread`.
"""
from __future__ import annotations

import asyncio
import re
import uuid

from .. import storage
from ..models import Document, User
from ..repositories import doc_chunks as chunks_repo
from ..repositories import documents as docs_repo
from .embeddings import Embedder


class NotFound(Exception):
    """No document with that id."""


class Forbidden(Exception):
    """The user may not view / manage this document (scope or ownership)."""


_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")


def safe_name(name: str | None) -> str:
    """A MinIO-key-safe filename; never empty."""
    cleaned = _UNSAFE.sub("", (name or "").strip().replace(" ", "_"))
    return cleaned or "file"


def build_object_key(doc_id: uuid.UUID, name: str | None) -> str:
    """MinIO key for a document — namespaced by id so display names can collide freely."""
    return f"documents/{doc_id}/{safe_name(name)}"


def infer_kind(content_type: str | None, name: str | None) -> str:
    """Coarse class for the `documents.kind` column (md|image|pdf|log|other)."""
    n = (name or "").lower()
    ct = (content_type or "").lower()
    if n.endswith((".md", ".markdown")) or ct in ("text/markdown", "text/x-markdown"):
        return "md"
    if ct.startswith("image/"):
        return "image"
    if ct == "application/pdf" or n.endswith(".pdf"):
        return "pdf"
    if n.endswith((".log", ".txt")) or ct == "text/plain":
        return "log"
    return "other"


def _is_admin(user: User) -> bool:
    return getattr(user, "role", None) == "admin"


def can_view(user: User, doc: Document, dept_ids: list[uuid.UUID]) -> bool:
    """Read access: admin · owner · org-wide doc · a doc in one of the user's departments."""
    if _is_admin(user) or doc.owner_id == user.id:
        return True
    return doc.department_id is None or doc.department_id in dept_ids


def can_manage(user: User, doc: Document) -> bool:
    """Delete/overwrite: owner or admin (the route already required `codex.manage`)."""
    return _is_admin(user) or doc.owner_id == user.id


async def create_document(
    db, *, user: User, data: bytes, name: str | None,
    content_type: str | None, department_id: uuid.UUID | None,
) -> Document:
    doc_id = uuid.uuid4()
    key = build_object_key(doc_id, name)
    ct = (content_type or "application/octet-stream")
    await asyncio.to_thread(storage.put_object, key, data, ct)
    return await docs_repo.insert_document(
        db, doc_id=doc_id, owner_id=user.id, department_id=department_id,
        kind=infer_kind(content_type, name), name=(name or "file")[:255],
        object_key=key, content_type=ct[:128], size=len(data),
    )


async def list_documents(db, *, user: User, kind: str | None, limit: int, offset: int):
    """(items, total) of documents visible to `user`, newest first."""
    dept_ids = None if _is_admin(user) else await docs_repo.user_department_ids(db, user.id)
    items = await docs_repo.list_documents(db, dept_ids=dept_ids, kind=kind, limit=limit, offset=offset)
    total = await docs_repo.count_documents(db, dept_ids=dept_ids, kind=kind)
    return items, total


async def get_document_with_url(db, *, user: User, doc_id: uuid.UUID) -> tuple[Document, str]:
    """The document + a presigned download URL, or raise NotFound / Forbidden."""
    doc = await docs_repo.get_document(db, doc_id)
    if doc is None:
        raise NotFound
    dept_ids = [] if _is_admin(user) else await docs_repo.user_department_ids(db, user.id)
    if not can_view(user, doc, dept_ids):
        raise Forbidden
    url = await asyncio.to_thread(storage.presigned_get, doc.object_key)
    return doc, url


async def search_documents(db, *, embedder: Embedder, user: User, query: str, k: int) -> list[dict]:
    """Semantic search over the codex (RAG retrieval — phase E/M2). Embeds the query and returns
    the top-k chunks the user may read, scoped exactly like `can_view` (admin sees all; everyone
    else sees org-wide + their departments + their own docs). Each result is
    `{document_id, document_name, document_kind, heading, content, seq, score}` (score = cosine
    similarity, higher = closer)."""
    query = (query or "").strip()
    if not query:
        return []
    admin = _is_admin(user)
    dept_ids = None if admin else await docs_repo.user_department_ids(db, user.id)
    owner_id = None if admin else user.id
    vector = (await embedder.embed([query]))[0]
    return await chunks_repo.search(db, embedding=vector, dept_ids=dept_ids, owner_id=owner_id, k=k)


async def reindex_targets(
    db, *, user: User, only_stale: bool, current_model: str
) -> list[uuid.UUID]:
    """Document ids to re-ingest for a RAG rebuild (knowledge-rag.md §3 'single rebuild command').
    Admin rebuilds the whole corpus; anyone else (the route already required `codex.manage`)
    rebuilds only their own documents — re-embedding the org corpus is an admin-cost operation.
    `only_stale=True` skips docs already embedded with `current_model` (the 'I switched the
    embedder, re-embed the rest' case); False forces a full rebuild from markdown."""
    owner_id = None if _is_admin(user) else user.id
    exclude = current_model if only_stale else None
    return await docs_repo.ids_for_reindex(db, owner_id=owner_id, exclude_model=exclude)


async def delete_document(db, *, user: User, doc_id: uuid.UUID) -> None:
    doc = await docs_repo.get_document(db, doc_id)
    if doc is None:
        raise NotFound
    if not can_manage(user, doc):
        raise Forbidden
    try:
        await asyncio.to_thread(storage.remove_object, doc.object_key)
    except Exception:  # noqa: BLE001 — object may already be gone; the metadata row is the truth
        pass
    await docs_repo.delete_document(db, doc_id)
