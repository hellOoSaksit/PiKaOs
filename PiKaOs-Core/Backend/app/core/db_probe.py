"""Connectivity check for a candidate DSN — a throwaway async engine + SELECT 1, then disposed.
Mirrors scripts/migrate_plugins.py's throwaway pattern; never touches the live container."""
from __future__ import annotations

import logging


class DbProbeError(Exception):
    """The candidate DSN did not accept a connection. The router turns this into a GENERIC 400 —
    the real driver exception (host, auth failure) stays in the server log only."""


async def _aprobe(dsn: str) -> None:
    from sqlalchemy import text
    from app.plugins.postgres.engine import create_engine
    engine = create_engine(dsn)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    finally:
        await engine.dispose()


async def probe(dsn: str) -> None:
    """Await me from the request handler's own event loop — never wrap in `asyncio.run` (the uvicorn
    worker already owns a running loop, and nesting one raises `RuntimeError: cannot be called from a
    running event loop`). Any failure is logged server-side with its real detail, then re-raised as a
    detail-free `DbProbeError` the router maps to a generic 400."""
    try:
        await _aprobe(dsn)
    except Exception as exc:                                  # noqa: BLE001 — generic to client, real detail logged
        logging.getLogger("pikaos.setup.db").warning("db probe failed: %s", exc)
        raise DbProbeError("could not connect to the database") from exc
