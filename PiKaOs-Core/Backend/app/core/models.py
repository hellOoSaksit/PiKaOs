"""SQLAlchemy models."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


# NOTE: extracted-plugin tables no longer live in Core's metadata —
#   * auth/RBAC (users · roles · permissions · role_perms · user_perms · departments · user_departments)
#     → the `auth` plugin (Phase C);
#   * knowledge (documents · doc_chunks + the pgvector `Vector` type)
#     → the `knowledge` plugin (PiKaOs-Plugin-Knowledge/backend/models.py).
# Each plugin owns those tables on its OWN metadata, created by its migrate() step, not by Core's Alembic
# baseline. Columns here that used to FK users.id/departments.id are plain UUIDs (logical refs, no FK).


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
        UUID(as_uuid=True), nullable=True
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
        UUID(as_uuid=True), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict | list | str] = mapped_column(JSONB, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


# --- Engine module (system-design §7; FK/index per risk-mitigation §4.4) ---
# Schema source of truth = migration 0001_baseline (organized by module — modularity.md).
# subtasks/tools_config/notifications are deferred to their phase (orchestrator/tools/notify, phase C).


class Room(Base):
    __tablename__ = "rooms"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="")
    template: Mapped[str] = mapped_column(String(64), nullable=False, default="")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Agent(Base):
    """An AI agent. `status` is set by the runner only (product rule), never user-settable."""

    __tablename__ = "agents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
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
        UUID(as_uuid=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    brief: Mapped[str] = mapped_column(Text, nullable=False, default="")
    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="open")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class Run(Base):
    """An execution run — kind 'agent' (the §4 loop) or 'orchestration' (orchestrator)."""

    __tablename__ = "runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="agent")
    parent_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("runs.id", ondelete="CASCADE"), nullable=True
    )
    agent_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agents.id", ondelete="SET NULL"), nullable=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    room_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True
    )
    department_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True
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


# --- Telegram channel (features/telegram-integration.md) — a 2-way agent chat channel -------------
# Plugs in like llm_connections: a DB-stored, admin-managed, ENCRYPTED connection (migration 0010).


class TelegramConnection(Base):
    """The Telegram bot (no-hardcode) — an admin pastes the BotFather token in the UI instead of
    `.env`; it's stored **encrypted** (app/crypto.py), never plaintext. At most one row is
    `is_active` (partial unique index, migration 0010). `mode` picks how updates arrive — `webhook`
    (hosted: Telegram POSTs to us, verified by the secret token) or `polling` (on-prem/air-gap: the
    worker long-polls getUpdates). Mirrors LlmConnection on purpose."""

    __tablename__ = "telegram_connections"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    bot_token_enc: Mapped[str | None] = mapped_column(String(1024), nullable=True)   # Fernet ciphertext
    mode: Mapped[str] = mapped_column(String(16), nullable=False, default="polling")  # webhook | polling
    webhook_secret_enc: Mapped[str | None] = mapped_column(String(1024), nullable=True)  # Fernet ciphertext
    bot_username: Mapped[str | None] = mapped_column(String(64), nullable=True)       # cached from getMe
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TelegramLink(Base):
    """The trust anchor — binds a Telegram identity to a PiKaOs user. Every inbound message resolves
    `tg_user_id` to this row; **all** permission/quota checks then run against `user_id` (the same
    RBAC the web app uses). No row → the bot only answers /start and /link. `task_id` is the
    persistent conversation thread (lazily created so context survives across messages)."""

    __tablename__ = "telegram_links"

    # Telegram's numeric user id — supplied by Telegram, NOT autoincrement (no sequence).
    tg_user_id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=False)
    tg_chat_id: Mapped[int] = mapped_column(BigInteger, nullable=False)    # private chat to reply into
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    task_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TelegramLinkCode(Base):
    """A short-lived, single-use code a logged-in user generates to claim their Telegram account.
    The user sends `/link <code>` to the bot; redeem checks it's unexpired + unused, writes the
    TelegramLink, and stamps `used_at`. Random + unguessable; expires in minutes (the real auth
    boundary is the user already being authenticated in the app when they minted it)."""

    __tablename__ = "telegram_link_codes"

    code: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
