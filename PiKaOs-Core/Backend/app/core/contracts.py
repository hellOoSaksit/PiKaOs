"""Core-owned contract registry — the named extension points plugins implement (plugin-architecture.md §5).

Core defines the **interface** + the **DI token**; a plugin binds an implementation under that token
([`container`](container.py)); a consumer resolves it by the token. The token is namespaced by its
*providing* plugin (§6) even though Core declares the name here — that's the shared agreement, the one
surface both sides depend on instead of importing each other.

Cross-boundary contracts today:
  - `ai` provides `ai.LLM` (the configured-LLM factory) + consumes `knowledge.Retriever` (RAG).
  - `knowledge` provides `knowledge.Retriever` + consumes `ai.LLM` + `minio.Storage`.
  - tool plugins provide `postgres.Connection` / `minio.Storage`; an auth plugin provides `identity.Provider`.
The `Retriever` Protocol lives HERE (not in the engine) so the ai plugin (consumer) and the knowledge
plugin (provider) both reference it without importing each other.
"""
from __future__ import annotations

from typing import Protocol, runtime_checkable


@runtime_checkable
class Retriever(Protocol):
    """Optional RAG source the engine injects at runtime — so the engine never imports the knowledge
    plugin (plugin-architecture.md §5). A build without knowledge resolves the `knowledge.Retriever`
    contract to None → the agent runs without retrieved context. A provider plugin binds an impl that
    structurally matches this (the knowledge plugin's KnowledgeRetriever); `runtime_checkable` lets the
    consumer-driven contract test assert the binding satisfies this interface."""
    async def retrieve_context(self, db, *, owner_id, run_input: dict | None, k: int) -> str: ...


# DI token a knowledge-style plugin binds (manifest `provides: ["knowledge.Retriever"]`); the engine
# resolves it at worker startup. Optional — unresolved (no knowledge plugin) → retriever=None.
RETRIEVER = "knowledge.Retriever"

# The configured-LLM factory the `ai` plugin provides. Resolve it and call it with a role
# ("engine" | "answer" | "summarize" | "search") to get a provider exposing
# `async complete(*, model, messages, tools) -> LLMResult`. Consumers (e.g. knowledge's RAG answer /
# summarize) resolve this instead of importing the ai plugin. Unbound (ai disabled) → the consumer skips.
AI_LLM = "ai.LLM"

# The DB connection a tool plugin (postgres) provides — {"engine", "session_factory"}.
# The kernel consumes this instead of importing db.py's globals directly (kernel-redesign seam).
POSTGRES_CONNECTION = "postgres.Connection"

# The object-storage facade a tool plugin (minio) provides — exposes status/ensure_bucket/put_object/
# get_object/presigned_get/remove_object/ping. The kernel resolves this instead of importing storage.py.
STORAGE = "minio.Storage"

# The identity/RBAC provider an auth plugin binds — authenticate(token)->user, has_perm, has_role.
# The kernel's identity.py FastAPI deps resolve this per request; unbound → BootstrapProvider (deny data,
# console-code gates setup). The interface (IdentityProvider Protocol) lives in identity.py.
IDENTITY = "identity.Provider"

__all__ = ["Retriever", "RETRIEVER", "AI_LLM", "POSTGRES_CONNECTION", "STORAGE", "IDENTITY"]
