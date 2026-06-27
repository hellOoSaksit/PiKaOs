"""Async SQLAlchemy engine + session."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from pgvector.asyncpg import register_vector
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


def register_pgvector(eng: AsyncEngine) -> AsyncEngine:
    """Register pgvector's asyncpg codec on every connection this engine opens, so the RAG repo
    binds/reads embeddings as `list[float]` directly instead of formatting a `'[..]'::vector`
    string literal (repositories/doc_chunks.py). The `vector` type must exist — it does once
    migration 0005 has run `CREATE EXTENSION vector`, which is before any app/test query.

    Returns the engine so the call site can wrap creation in one expression. Tests that build
    their own engine call this too (the codec is per-engine)."""
    @event.listens_for(eng.sync_engine, "connect")
    def _on_connect(dbapi_connection, _record):  # noqa: ANN001 — SQLAlchemy event signature
        dbapi_connection.run_async(register_vector)
    return eng


engine = register_pgvector(
    create_async_engine(settings.database_url, pool_pre_ping=True, future=True)
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a transactional session."""
    async with SessionLocal() as session:
        yield session
