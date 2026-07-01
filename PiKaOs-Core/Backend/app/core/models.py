"""SQLAlchemy models."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


# NOTE: extracted-plugin tables no longer live in Core's metadata —
#   * auth/RBAC (users · roles · permissions · role_perms · user_perms · departments · user_departments)
#     → the `auth` plugin;
#   * knowledge (documents · doc_chunks + the pgvector `Vector` type) → the `knowledge` plugin;
#   * ai/engine (agents · runs · run_steps · stub_tool_writes · tasks · rooms · llm_connections ·
#     llm_role_bindings) → the `ai` plugin.
# Each plugin owns those tables on its OWN metadata, created by its migrate() step, not by Core's Alembic
# baseline. Cross-plugin id columns (owner_id/user_id/department_id/task_id → auth/ai) are plain UUIDs
# (logical refs, no FK). Core's own remaining tables: app_settings, user_settings, telegram_*.


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
    # logical ref → ai.tasks.id (no cross-plugin FK): the conversation thread lives in the ai plugin now
    task_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
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
