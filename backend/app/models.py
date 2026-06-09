"""SQLAlchemy ORM models.

The prototype stored vocabulary as a stack of localStorage override maps
(terms / aliases / removed / thover / canonover / confirmed). Backed by a real
DB we collapse all of that into plain rows: a Term row IS the canonical entry,
its `id` is the stable key the UI uses for every edit, and edits are just
UPDATE/DELETE. Derived categories (e.g. IR+WD) own no rows — the matcher unions
their source categories at query time.
"""
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Category(Base):
    __tablename__ = "categories"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    label: Mapped[str] = mapped_column(String(160))
    is_base: Mapped[bool] = mapped_column(Boolean, default=False)
    # non-empty => derived/combined category that unions these source keys (read-only)
    from_keys: Mapped[list] = mapped_column(JSON, default=list)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    terms: Mapped[list["Term"]] = relationship(
        back_populates="category", cascade="all, delete-orphan"
    )


class Term(Base):
    __tablename__ = "terms"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    category_key: Mapped[str] = mapped_column(
        ForeignKey("categories.key", ondelete="CASCADE"), index=True
    )
    canon: Mapped[str] = mapped_column(String(200))  # English head term (display)
    th: Mapped[str] = mapped_column(String(300))     # Thai description
    is_base: Mapped[bool] = mapped_column(Boolean, default=False)
    confirmed: Mapped[bool] = mapped_column(Boolean, default=False)  # human-promoted to "complete"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    category: Mapped[Category] = relationship(back_populates="terms")
    aliases: Mapped[list["Alias"]] = relationship(
        back_populates="term", cascade="all, delete-orphan"
    )


class Alias(Base):
    __tablename__ = "aliases"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    term_id: Mapped[str] = mapped_column(
        ForeignKey("terms.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(String(300))

    term: Mapped[Term] = relationship(back_populates="aliases")


class TrainFile(Base):
    __tablename__ = "train_files"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    category_key: Mapped[str] = mapped_column(String(64), index=True)
    name: Mapped[str] = mapped_column(String(255))
    rows: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class LogEntry(Base):
    __tablename__ = "logs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    actor: Mapped[str] = mapped_column(String(120), default="ผู้ใช้")
    action: Mapped[str] = mapped_column(String(160))
    detail: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
