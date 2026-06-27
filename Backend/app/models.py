"""SQLAlchemy models."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import UserDefinedType

from .config import settings
from .db import Base


class Vector(UserDefinedType):
    """Minimal mapping for pgvector's `vector(N)` column — DDL/metadata only.

    Reads and writes of embeddings go through raw SQL in repositories/doc_chunks.py (asyncpg has
    no vector codec; we pass `'[..]'::vector` literals to stay zero-dep). This type exists so the
    ORM/migrations know the column shape; it deliberately has no bind/result processors, so the
    embedding column is never round-tripped through the ORM."""

    cache_ok = True

    def __init__(self, dim: int):
        self.dim = dim

    def get_col_spec(self, **_kw) -> str:
        return f"vector({self.dim})"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    display: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="member")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    avatar: Mapped[str] = mapped_column(String(64), nullable=False, default="🙂")
    quota: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    period: Mapped[str] = mapped_column(String(16), nullable=False, default="monthly")
    used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)

    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Document(Base):
    """File metadata for MinIO-stored documents. The knowledge store is markdown-as-truth
    (docs/architecture/knowledge-rag.md); a vector column is intentionally absent — RAG
    (phase E) adds embeddings via its own migration if/when retrieval need is real."""

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # FK → users.id, ON DELETE SET NULL: deleting a user keeps their docs but clears ownership
    # (owner_id is nullable). See migration 0003 / risk-mitigation §4.4 (A3).
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="md")  # md|image|log|pdf|other
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)  # MinIO object path (markdown truth once ingested)
    # The original uploaded file (pdf/word) kept as a Ref after conversion to markdown (E6,
    # knowledge-rag.md §6.4). NULL = the upload was already markdown/text (object_key IS the truth).
    source_object_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    content_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/octet-stream")
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    # department scoping (column added in migration 0004 — system-design §7.1)
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), index=True, nullable=True
    )
    # RAG ingest state (migration 0005) — markdown stays the truth; this just records whether the
    # file has been chunked+embedded into doc_chunks, and with which model (knowledge-rag.md §3).
    ingest_status: Mapped[str] = mapped_column(String(16), nullable=False, default="pending")  # pending|done|failed|skipped
    embedding_model: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    # Doc-level summary produced at ingest (enrich B, migration 0009, knowledge-rag.md §6.2) — a
    # coarse "what is this file" layer for high-level retrieval. Derived/rebuildable; NULL until
    # summarized (off by default, or no summarize provider configured).
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class DocChunk(Base):
    """RAG semantic index — one heading-bounded slice of a document + its embedding (migration
    0005, knowledge-rag.md §3). A **derived, rebuildable cache**: chunks are deleted+recreated on
    re-ingest and cascade-deleted with their document (no orphan vectors). owner_id/department_id
    are denormalized from the document so retrieval can scope by permission without a join.

    The `embedding` column is read/written only via raw SQL (repositories/doc_chunks.py) — see
    the Vector type docstring."""

    __tablename__ = "doc_chunks"
    __table_args__ = (UniqueConstraint("document_id", "seq", name="uq_doc_chunks_document_seq"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    document_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("documents.id", ondelete="CASCADE"), index=True, nullable=False
    )
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True, nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), index=True, nullable=True
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    heading: Mapped[str] = mapped_column(Text, nullable=False, default="")
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    embedding: Mapped[list[float]] = mapped_column(Vector(settings.embed_dim), nullable=False)
    embedding_model: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LlmConnection(Base):
    """Runtime-configurable LLM provider (no-hardcode) — an admin sets provider/model/endpoint/key
    from the UI instead of `.env`. The API key is stored **encrypted** (app/crypto.py), never
    plaintext. At most one row is `is_active` (partial unique index, migration 0003); the worker
    resolves the active one per call so edits apply without a restart."""

    __tablename__ = "llm_connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    provider: Mapped[str] = mapped_column(String(32), nullable=False)  # ollama|openai|anthropic
    model: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    api_key_enc: Mapped[str | None] = mapped_column(String(1024), nullable=True)  # Fernet ciphertext
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class LlmRoleBinding(Base):
    """Per-system LLM assignment (no-hardcode) — maps a system role (engine/search/summarize)
    to a specific `llm_connections` row, so an admin can route e.g. the search/RAG system to a
    local llama while the engine uses Claude. A role with no row falls back to the active
    connection (then the .env provider). Migration 0004; FK cascades when the connection is deleted."""

    __tablename__ = "llm_role_bindings"

    role: Mapped[str] = mapped_column(String(32), primary_key=True)  # engine | search | summarize
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("llm_connections.id", ondelete="CASCADE"), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class AppSetting(Base):
    """Server-scoped key/value config shared by every user and device (migration 0007).

    A small JSONB store for settings that must be identical app-wide — the first is the sidebar
    nav arrangement (`key="nav"`), which previously lived in per-browser localStorage. Reads are
    any authenticated user; a write needs the relevant permission (gated per key in the router).
    Generic so later server-scope config reuses the same table."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list] = mapped_column(JSONB, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class UserSetting(Base):
    """Per-user config that follows the user across devices (migration 0008).

    Personal preferences (theme, lexicon pack, ...) keyed by (user_id, key). Counterpart to
    `app_settings` (global); the two-tier config rule is in process/lessons.md. localStorage on the
    client is only a cache — this row is the source of truth."""

    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# --- RBAC (server-side permission model — mirrors Frontend/src/data/data-users.jsx) ---
# Roles map to permission sets; per-user overrides grant/deny single permissions on top.
# Effective perms = role_perms ∪ grants − denies (deny wins); admin implicitly has all.
# See docs/architecture/risk-mitigation.md §2.


class Role(Base):
    __tablename__ = "roles"

    key: Mapped[str] = mapped_column(String(32), primary_key=True)
    name_th: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    name_en: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    color: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Permission(Base):
    __tablename__ = "permissions"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    grp: Mapped[str] = mapped_column(String(32), nullable=False, default="")
    name_th: Mapped[str] = mapped_column(String(128), nullable=False, default="")
    name_en: Mapped[str] = mapped_column(String(128), nullable=False, default="")


class RolePerm(Base):
    """A permission granted to a role (the role's default set)."""

    __tablename__ = "role_perms"

    role_key: Mapped[str] = mapped_column(
        String(32), ForeignKey("roles.key", ondelete="CASCADE"), primary_key=True
    )
    perm_key: Mapped[str] = mapped_column(
        String(64), ForeignKey("permissions.key", ondelete="CASCADE"), primary_key=True
    )


class UserPerm(Base):
    """A per-user override: allow=True grants beyond the role, allow=False denies below it."""

    __tablename__ = "user_perms"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    perm_key: Mapped[str] = mapped_column(
        String(64), ForeignKey("permissions.key", ondelete="CASCADE"), primary_key=True
    )
    allow: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)


# --- Engine module (system-design §7; FK/index per risk-mitigation §4.4) ---
# Schema source of truth = migration 0001_baseline (organized by module — modularity.md).
# subtasks/tools_config/notifications are deferred to their phase (HERMES/tools/notify, phase C).


class Department(Base):
    """A department within the single org — scoping/visibility dimension (system-design §7.1)."""

    __tablename__ = "departments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name_th: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    name_en: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class UserDepartment(Base):
    """m:n user↔department — a user can belong to several departments; is_primary = default dept."""

    __tablename__ = "user_departments"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    department_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True
    )
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    template: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Agent(Base):
    """An AI agent. `status` is set by the runner only (product rule), never user-settable."""

    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    role: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="idle")
    model: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    skills: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    granted_tools: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)
    sprite: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    brief: Mapped[str] = mapped_column(Text, nullable=False, default="")
    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Run(Base):
    """An execution run — kind 'agent' (the §4 loop) or 'orchestration' (HERMES)."""

    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="agent")
    parent_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=True
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    quest_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("quests.id", ondelete="SET NULL"), nullable=True
    )
    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued")
    input: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tokens_used: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class RunStep(Base):
    """One worklog step. tool steps are two-phase (pending→done) with a deterministic
    idempotency_key for replay-safe resume (risk-mitigation §1). UNIQUE(run_id, seq)."""

    __tablename__ = "run_steps"
    __table_args__ = (UniqueConstraint("run_id", "seq", name="uq_run_steps_run_seq"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=False
    )
    seq: Mapped[int] = mapped_column(Integer, nullable=False)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)              # llm|tool|message|status
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="done")  # pending|done|failed
    idempotency_key: Mapped[str | None] = mapped_column(String(128), nullable=True)
    role: Mapped[str | None] = mapped_column(String(32), nullable=True)
    content: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class StubToolWrite(Base):
    """Sink for the B4 stub tools — see migration 0002_stub_tool_sink. Lets tests observe the
    engine's two-phase / effect-class semantics (at-most-once side_effect vs deduped
    idempotent_write). UNIQUE(idempotency_key) backs the upsert tool's ON CONFLICT DO NOTHING."""

    __tablename__ = "stub_tool_writes"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_stub_tool_writes_key"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), index=True, nullable=True
    )
    tool: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
