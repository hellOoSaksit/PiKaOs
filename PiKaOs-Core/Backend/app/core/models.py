"""SQLAlchemy models."""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


# NOTE: extracted-plugin tables no longer live in Core's metadata —
#   * auth/RBAC (users · roles · permissions · role_perms · user_perms · departments · user_departments)
#     → the `auth` plugin;
#   * knowledge (documents · doc_chunks + the pgvector `Vector` type) → the `knowledge` plugin;
#   * ai/engine (agents · runs · run_steps · stub_tool_writes · tasks · rooms · llm_connections ·
#     llm_role_bindings) → the `ai` plugin;
#   * chat gateway (chat_links · chat_link_codes) → the `chat` plugin; the Telegram connection
#     (telegram_connections) → the `telegram` provider Tool.
# Each plugin owns those tables on its OWN metadata, created by its migrate() step, not by Core's Alembic
# baseline. Cross-plugin id columns (owner_id/user_id/department_id/task_id → auth/ai) are plain UUIDs
# (logical refs, no FK). Core's own remaining tables: app_settings, user_settings.


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
