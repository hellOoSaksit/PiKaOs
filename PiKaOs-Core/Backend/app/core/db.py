"""DB session seam — the zero-datastore kernel owns NO engine.

SQLAlchemy, the engine, the session factory, the pgvector codec, and `Base` all left for the postgres
Tool (`app/plugins/postgres/`), which creates them and binds `{engine, session_factory, ping}` under the
`postgres.Connection` contract. This module is all that stays kernel-side: a FastAPI dependency that
resolves that contract off the app container and yields a session. It imports no sqlalchemy — the session
type is duck-typed.
"""
from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Request

from .contracts import POSTGRES_CONNECTION


async def get_db(request: Request) -> AsyncGenerator[Any, None]:
    """Yield a transactional session from the postgres Tool's factory (bound on `app.state.container`).

    DB-backed plugins (auth/ai/knowledge/...) declare `dependencies: ["postgres"]`, so the Tool is always
    enabled + bound when one of their routes runs. If it is somehow unbound, fail fast with a clear error
    rather than 500 deep inside a query."""
    conn = request.app.state.container.resolve(POSTGRES_CONNECTION)
    if not conn or not conn.get("session_factory"):
        raise RuntimeError("postgres.Connection is not bound — enable the postgres tool")
    async with conn["session_factory"]() as session:
        yield session
