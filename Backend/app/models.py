"""SQLAlchemy models."""
from __future__ import annotations

import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


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
    """File metadata + embedding (scaffold for MinIO/pgvector RAG — not used yet)."""

    __tablename__ = "documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False, default="md")  # md|image|log|pdf|other
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    object_key: Mapped[str] = mapped_column(String(512), nullable=False)  # MinIO object path
    content_type: Mapped[str] = mapped_column(String(128), nullable=False, default="application/octet-stream")
    size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    embedding: Mapped[list[float] | None] = mapped_column(Vector(1536), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
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
