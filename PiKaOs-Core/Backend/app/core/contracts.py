"""Core-owned contract registry — the named extension points plugins implement (plugin-architecture.md §5).

Mirrors the kit's `core/contracts/`: Core defines the **interface** + the **DI token**; a plugin binds an
implementation under that token ([`container`](container.py)); a consumer resolves it by the token. The
token is namespaced by its *providing* plugin (§6) even though Core declares the name here — that's the
shared agreement, the one surface both sides depend on instead of importing each other.

Today there is one cross-boundary contract: the engine consumes a RAG `Retriever` that the knowledge
plugin provides. The interface lives next to its only consumer (the engine, in `agent_runner`); this
module re-exports it so consumers import the contract from one obvious place.
"""
from __future__ import annotations

from .services.agent_runner import Retriever

# DI token a knowledge-style plugin binds (manifest `provides: ["knowledge.Retriever"]`); the engine
# resolves it at worker startup. Optional — unresolved (no knowledge plugin) → retriever=None.
RETRIEVER = "knowledge.Retriever"

# The DB connection a tool plugin (postgres) provides — {"engine", "session_factory"}.
# The kernel consumes this instead of importing db.py's globals directly (kernel-redesign seam).
POSTGRES_CONNECTION = "postgres.Connection"

# The object-storage facade a tool plugin (minio) provides — exposes status/ensure_bucket/put_object/
# get_object/presigned_get/remove_object/ping. The kernel resolves this instead of importing storage.py.
STORAGE = "minio.Storage"

__all__ = ["Retriever", "RETRIEVER", "POSTGRES_CONNECTION", "STORAGE"]
