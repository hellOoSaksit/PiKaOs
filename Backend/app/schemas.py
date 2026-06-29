"""Pydantic request/response schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field


class LoginIn(BaseModel):
    usernameOrEmail: str = Field(min_length=1)
    password: str = Field(min_length=1)


class NavConfigIn(BaseModel):
    value: list   # the sidebar nav arrangement (list of groups) — the frontend owns the shape


class NavConfigOut(BaseModel):
    value: list | None = None
    updated_at: datetime | None = None


class SettingValueIn(BaseModel):
    value: Any   # a personal preference value (theme string, lexicon id, ...)


class UserSettingsOut(BaseModel):
    values: dict   # {key: value} of the current user's settings


class GlobalConfigOut(BaseModel):
    value: Any = None   # a shared (global) config blob — shape owned by the frontend


class ForgotIn(BaseModel):
    usernameOrEmail: str = Field(min_length=1)


class TokenOut(BaseModel):
    accessToken: str
    tokenType: str = "bearer"
    expiresIn: int


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    username: str
    email: str
    display: str
    role: str
    status: str
    avatar: str
    quota: int | None
    period: str
    used: int
    last_login: datetime | None = None
    created_at: datetime
    permissions: list[str] = []  # server-resolved effective perms (set by /me + login)


class LoginResult(BaseModel):
    token: TokenOut
    user: UserOut


class HealthOut(BaseModel):
    status: str
    version: str       # app_version (versions.md registry — surfaced here per the SSOT rule)
    build: str         # build_hash (immutable build identity)
    db: str
    redis: str
    minio: str


class VersionOut(BaseModel):
    """Lightweight liveness + build identity — no dependency I/O, so it's safe as the container
    HEALTHCHECK probe and as the SPA's version-skew check (release-and-rollback.md §4/§7)."""
    version: str       # app_version
    build: str         # build_hash
    name: str          # app_name


# --- knowledge / document store (markdown-as-truth — docs/architecture/knowledge-rag.md) ---


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    owner_id: uuid.UUID | None = None
    kind: str                          # md|image|pdf|log|other
    name: str
    content_type: str
    size: int
    department_id: uuid.UUID | None = None
    ingest_status: str = "pending"     # RAG ingest state: pending|done|failed|skipped (E2)
    summary: str | None = None         # doc-level summary produced at ingest (E7 enrich B)
    created_at: datetime
    url: str | None = None             # presigned download link — set only on the detail (GET /docs/{id})


class DocumentListOut(BaseModel):
    items: list[DocumentOut]
    total: int                         # total matching the scope/filter (for pagination)


# RAG retrieval — one matched chunk from semantic search (GET /api/knowledge/search)
class KnowledgeSearchResult(BaseModel):
    id: uuid.UUID                      # chunk id
    document_id: uuid.UUID
    document_name: str
    document_kind: str
    seq: int
    heading: str
    content: str
    score: float                       # cosine similarity (higher = closer)


class KnowledgeSearchOut(BaseModel):
    items: list[KnowledgeSearchResult]


# RAG answer — POST /api/knowledge/answer (E8: search → answer with citations, knowledge-rag.md §6.5)
class KnowledgeAnswerIn(BaseModel):
    question: str
    k: int = 0                         # 0 → server default (config.rag_answer_top_k)


class KnowledgeAnswerSource(BaseModel):
    n: int                             # citation marker [n] in the answer text
    document_id: uuid.UUID
    document_name: str
    heading: str
    score: float


class KnowledgeAnswerOut(BaseModel):
    answer: str
    sources: list[KnowledgeAnswerSource]
    rewritten_query: str               # the query actually searched (may equal the question)
    used_chunks: int                   # how many chunks were fed to the answer model


# RAG rebuild — result of POST /api/knowledge/reindex ('single rebuild command', knowledge-rag.md §3)
class KnowledgeReindexOut(BaseModel):
    matched: int   # documents in scope to rebuild
    queued: int    # ingest jobs actually enqueued (best-effort; < matched on a Redis outage)
    model: str     # the embedding model they'll be (re)embedded with


# --- runtime LLM provider config (no-hardcode — admin sets API vs Local from the UI) ---


class LlmConnectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    provider: str = Field(description="ollama | openai | anthropic")
    model: str = ""
    base_url: str | None = None
    api_key: str | None = None         # write-only — encrypted at rest, never returned


class LlmConnectionUpdate(BaseModel):
    name: str | None = None
    provider: str | None = None
    model: str | None = None
    base_url: str | None = None
    api_key: str | None = None         # omit/empty = leave the stored key unchanged


class LlmConnectionOut(BaseModel):
    id: uuid.UUID
    name: str
    provider: str
    model: str
    base_url: str | None = None
    is_active: bool
    api_key_set: bool                  # masked — true if a key is stored (the value is never sent)
    created_at: datetime


# Per-system LLM assignment (which connection a role uses — engine/search/summarize)
class LlmRoleSet(BaseModel):
    connection_id: uuid.UUID | None = None    # null = clear the binding (fall back to active)


class LlmRoleOut(BaseModel):
    role: str
    connection_id: uuid.UUID | None = None
    connection_name: str | None = None


# Object-storage status (read-only) — surfaced in the tools tab. No secrets: access/secret keys
# stay in env (bootstrap config, never UI-editable — storage.py / the no-hardcode config tiers).
class StorageStatusOut(BaseModel):
    provider: str                          # minio | s3
    endpoint: str
    bucket: str
    secure: bool
    region: str | None = None
    reachable: bool                        # can the configured store be reached right now
