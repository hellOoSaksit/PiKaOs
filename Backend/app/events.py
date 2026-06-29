"""Event Bus — the async, fire-and-forget channel for cross-plugin reactions (plugin-architecture.md §5,
Pattern B). Core-owned; mirrors the kit's `ctx.events`.

A plugin emits a **namespaced** event (e.g. `knowledge.ingested`) without knowing who listens; any number
of subscribers react. **Fault isolation (§8):** a subscriber that raises is logged and skipped — it never
fails the publisher or the other subscribers. This is the in-process implementation; a durable broker
(the same `subscribe`/`emit` surface) can replace it later without touching callers.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from typing import Awaitable, Callable

log = logging.getLogger("pikaos.events")

Handler = Callable[[dict], Awaitable[None]]


class EventBus:
    def __init__(self) -> None:
        self._subs: dict[str, list[Handler]] = defaultdict(list)

    def subscribe(self, event: str, handler: Handler) -> None:
        """Register an async `handler` for `event`. Multiple handlers per event run in registration order."""
        self._subs[event].append(handler)

    def off(self, event: str, handler: Handler | None = None) -> None:
        """Drop one handler, or all handlers for `event` when `handler` is None (plugin shutdown)."""
        if handler is None:
            self._subs.pop(event, None)
        elif event in self._subs:
            self._subs[event] = [h for h in self._subs[event] if h is not handler]

    async def emit(self, event: str, payload: dict) -> None:
        """Deliver `payload` to every subscriber of `event`, sequentially. A handler that raises is
        logged and skipped — the publisher is never affected (fault isolation, §8)."""
        for handler in list(self._subs.get(event, ())):
            try:
                await handler(payload)
            except Exception:  # noqa: BLE001 — isolation is the whole point: one bad listener can't cascade
                log.exception("event handler for %r failed — isolated, continuing", event)
