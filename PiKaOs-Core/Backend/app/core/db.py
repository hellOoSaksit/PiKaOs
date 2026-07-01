"""Async SQLAlchemy engine + session."""
from __future__ import annotations

from collections.abc import AsyncGenerator

from fastapi import Request
from pgvector.asyncpg import register_vector
from sqlalchemy import event
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from .config import settings


async def _register_vector_if_available(conn) -> None:
    """Register the pgvector codec on a connection, tolerating the `vector` type being absent.

    The `knowledge` plugin OWNS pgvector now — it creates `CREATE EXTENSION vector` in its migrate()
    step. So the type may not exist when a connection opens: the plugin is disabled (zero-datastore /
    knowledge-off), or this connection was opened during boot before the plugin's migrate ran. In those
    cases we skip the codec instead of crashing every connection — a connection opened after the
    extension exists (e.g. at request time, once migrate has run) registers it. Connections without the
    codec are only used for non-vector work, so skipping is safe."""
    try:
        await register_vector(conn)
    except ValueError:
        pass  # `vector` type not installed on this connection yet — see docstring


def register_pgvector(eng: AsyncEngine) -> AsyncEngine:
    """Register pgvector's asyncpg codec on every connection this engine opens (leniently — see
    `_register_vector_if_available`), so the RAG repo binds/reads embeddings as `list[float]` directly
    instead of formatting a `'[..]'::vector` string literal (app/plugins/knowledge/doc_chunks.py).

    Returns the engine so the call site can wrap creation in one expression. Tests that build their own
    engine call this too (the codec is per-engine)."""
    @event.listens_for(eng.sync_engine, "connect")
    def _on_connect(dbapi_connection, _record):  # noqa: ANN001 — SQLAlchemy event signature
        dbapi_connection.run_async(_register_vector_if_available)
    return eng


engine = register_pgvector(
    create_async_engine(settings.database_url, pool_pre_ping=True, future=True)
)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)


class Base(DeclarativeBase):
    pass


def _session_factory_from(request: Request) -> async_sessionmaker[AsyncSession]:
    """The session factory a tool bound under `postgres.Connection` on the app container
    (`main.py:lifespan`), else this module's `SessionLocal` — the bootstrap path used before startup, in
    kernel mode (no postgres tool enabled), or if the container wiring is unavailable for any reason.
    Never raises: DB access must not fail on composition wiring."""
    try:
        from .contracts import POSTGRES_CONNECTION
        conn = request.app.state.container.resolve(POSTGRES_CONNECTION)
        if conn and conn.get("session_factory"):
            return conn["session_factory"]
    except Exception:  # noqa: BLE001 — fall back to the module factory on any wiring gap
        pass
    return SessionLocal


async def get_db(request: Request) -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a transactional session."""
    async with _session_factory_from(request)() as session:
        yield session
