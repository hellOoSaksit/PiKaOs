"""Normalize the operator's DB choice into one asyncpg DSN + guard against the Supabase
transaction pooler (pgbouncer port 6543 breaks asyncpg prepared statements)."""
from __future__ import annotations
from urllib.parse import urlsplit, urlunsplit

BUNDLED_DSN = "postgresql+asyncpg://pikaos:pikaos@db:5432/pikaos"


class DbDsnError(Exception):
    """A supplied DB connection is malformed or unsupported (e.g. a transaction pooler URL)."""


def build(provider: str, fields: dict) -> str:
    if provider == "bundled":
        return BUNDLED_DSN
    if provider == "pg":
        host = fields["host"]; port = fields.get("port", 5432)
        user = fields["user"]; pw = fields["password"]; db = fields["dbname"]
        return f"postgresql+asyncpg://{user}:{pw}@{host}:{port}/{db}"
    if provider == "supabase":
        raw = (fields.get("connectionString") or "").strip()
        if not raw:
            raise DbDsnError("supabase connection string is required")
        parts = urlsplit(raw)
        return urlunsplit(("postgresql+asyncpg", parts.netloc, parts.path, parts.query, ""))
    raise DbDsnError(f"unknown provider '{provider}'")


def reject_pooler(dsn: str) -> None:
    parts = urlsplit(dsn)
    host = (parts.hostname or "").lower()
    if "pooler" in host or parts.port == 6543:
        raise DbDsnError(
            "transaction-pooler endpoint not supported — use the direct or session-mode "
            "connection (port 5432) with SSL"
        )
