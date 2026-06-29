"""DI container — the seam through which Core and plugins share services without importing each other
(plugin-architecture.md §5, Pattern A). Core-owned infrastructure; mirrors the kit's `ctx.container`.

A plugin `register()`s an implementation under a **namespaced token** (e.g. `knowledge.Retriever`); a
consumer (the engine, another plugin) `resolve()`s it by the same token. Neither side imports the other
— the token + the Core-defined interface ([`contracts`](contracts.py)) are the only shared surface. This
is the runtime half of the no-import rule the `.importlinter` gate enforces statically.
"""
from __future__ import annotations

from typing import Any, Callable


class Container:
    """A tiny token→provider registry. A provider is bound either as a ready instance or as a
    zero-arg factory (called lazily, once, on first resolve — so wiring order is cheap)."""

    def __init__(self) -> None:
        self._instances: dict[str, Any] = {}
        self._factories: dict[str, Callable[[], Any]] = {}

    def bind(self, token: str, provider: Any) -> None:
        """Register `provider` under `token`. A callable is treated as a lazy factory; anything else
        is stored as a ready instance. Re-binding a token replaces it (last writer wins, logged by caller)."""
        if callable(provider) and not isinstance(provider, type) and not hasattr(provider, "__self__"):
            self._factories[token] = provider
        else:
            self._instances[token] = provider

    def has(self, token: str) -> bool:
        return token in self._instances or token in self._factories

    def resolve(self, token: str, default: Any = None) -> Any:
        """Return the service bound to `token`, materializing + caching a factory on first use. Returns
        `default` when nothing is bound — so an optional contract (no provider plugin enabled) degrades
        gracefully instead of raising (plugin-architecture.md §5: a `consume` may resolve to nothing)."""
        if token in self._instances:
            return self._instances[token]
        factory = self._factories.get(token)
        if factory is None:
            return default
        instance = factory()
        self._instances[token] = instance
        return instance
