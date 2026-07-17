"""Pydantic request/response schemas."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class NavConfigIn(BaseModel):
    value: list   # the sidebar nav arrangement (list of groups) — the frontend owns the shape


class NavConfigOut(BaseModel):
    value: list | None = None
    updated_at: datetime | None = None


class SettingValueIn(BaseModel):
    value: Any   # a personal preference value (theme string, lexicon id, ...)


class UserSettingsOut(BaseModel):
    values: dict   # {key: value} of the current user's settings


class PluginHealth(BaseModel):
    """One plugin's state for /health (plugin-architecture.md §14). `version` comes from the plugin's
    manifest (never hardcoded — ties to versions.md); `state` is active · degraded · disabled."""
    id: str
    version: str
    state: str         # active | degraded (enabled but its router failed to mount, §8) | disabled


class HealthOut(BaseModel):
    status: str
    # Detail fields are optional (Fix-SEC-10): an unauthenticated caller in production gets only
    # `status` (a shallow readiness signal for load-balancer/uptime probes), while authenticated
    # dashboards and every non-production caller get the full breakdown below. Dev + tests are
    # unchanged because the trim only applies to production-unauthenticated requests.
    version: str | None = None   # app_version (versions.md registry — surfaced here per the SSOT rule)
    build: str | None = None     # build_hash (immutable build identity)
    db: str | None = None
    redis: str | None = None
    minio: str | None = None
    plugins: list[PluginHealth] = []   # Core + each plugin's state + manifest version (§14)


class VersionOut(BaseModel):
    """Lightweight liveness + build identity — no dependency I/O, so it's safe as the container
    HEALTHCHECK probe and as the SPA's version-skew check (release-and-rollback.md §4/§7)."""
    version: str       # app_version
    build: str         # build_hash
    name: str          # app_name


class PluginCapability(BaseModel):
    """One installed+active plugin as the C1 handshake reports it (capability-handshake spec §2).
    `frontend` stays None until catalog FE distribution (phase 3) fills it."""
    id: str
    version: str | None = None
    frontend: dict | None = None


class CapabilitiesOut(BaseModel):
    """C1 capability handshake — the first thing a client reads off a server. ADDITIVE-ONLY:
    fields are never removed or re-meaninged (spec §2)."""
    v: int
    instanceId: str
    authMode: str            # "open" | "login" — computed server-side (C3)
    version: str
    build: str
    plugins: list[PluginCapability] = []


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


# Object-storage status (read-only) — surfaced in the tools tab. No secrets: access/secret keys
# stay in env (bootstrap config, never UI-editable — storage.py / the no-hardcode config tiers).
class StorageStatusOut(BaseModel):
    provider: str                          # minio | s3
    endpoint: str
    bucket: str
    secure: bool
    region: str | None = None
    reachable: bool                        # can the configured store be reached right now


# MCP tool catalog (/api/mcp) — Core's capabilities as tools an external AI client may call.
# `effect` drives the desktop gateway's consent gate: side_effect always prompts.
class McpToolOut(BaseModel):
    name: str
    description: str
    input_schema: dict
    effect: str            # read | idempotent_write | side_effect


class McpToolsOut(BaseModel):
    tools: list[McpToolOut]


class McpCallIn(BaseModel):
    name: str
    arguments: dict = Field(default_factory=dict)


class McpCallOut(BaseModel):
    result: Any


class McpAllowlistIn(BaseModel):
    entries: dict[str, dict]


class McpAllowlistOut(BaseModel):
    entries: dict[str, dict]
