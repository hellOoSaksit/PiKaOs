"""Event Bus unit tests (plugin-architecture.md §5/§8). Pure — no DB. (asyncio_mode=auto, no decorator.)"""
from __future__ import annotations

from app.events import EventBus


async def test_subscribers_receive_in_registration_order():
    bus = EventBus()
    seen: list[str] = []

    async def a(p): seen.append(f"a:{p['doc']}")
    async def b(p): seen.append(f"b:{p['doc']}")

    bus.subscribe("knowledge.ingested", a)
    bus.subscribe("knowledge.ingested", b)
    await bus.emit("knowledge.ingested", {"doc": "1"})
    assert seen == ["a:1", "b:1"]


async def test_emit_with_no_subscribers_is_noop():
    await EventBus().emit("nobody.listening", {"x": 1})  # must not raise


async def test_failing_handler_is_isolated():
    bus = EventBus()
    delivered: list[dict] = []

    async def boom(p): raise RuntimeError("handler blew up")
    async def good(p): delivered.append(p)

    bus.subscribe("e", boom)
    bus.subscribe("e", good)
    await bus.emit("e", {"n": 1})  # boom is logged + skipped, never propagates
    assert delivered == [{"n": 1}], "a failing subscriber must not stop the others (fault isolation §8)"


async def test_off_removes_handler():
    bus = EventBus()
    hits: list[int] = []

    async def h(p): hits.append(1)

    bus.subscribe("e", h)
    bus.off("e", h)
    await bus.emit("e", {})
    assert hits == []
