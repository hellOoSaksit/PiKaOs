"""DI container unit tests (plugin-architecture.md §5). Pure — no DB, sync."""
from __future__ import annotations

from app.container import Container


def test_bind_instance_and_resolve():
    c = Container()
    svc = object()
    c.bind("x.Svc", svc)
    assert c.has("x.Svc")
    assert c.resolve("x.Svc") is svc


def test_missing_token_returns_default_not_raises():
    c = Container()
    assert c.resolve("nope") is None
    sentinel = object()
    assert c.resolve("nope", sentinel) is sentinel


def test_factory_is_lazy_and_cached():
    c = Container()
    calls = {"n": 0}

    def factory():
        calls["n"] += 1
        return object()

    c.bind("x.Lazy", factory)
    assert calls["n"] == 0, "factory not called until first resolve"
    first = c.resolve("x.Lazy")
    second = c.resolve("x.Lazy")
    assert first is second, "factory result is cached (singleton)"
    assert calls["n"] == 1


def test_rebind_replaces():
    c = Container()
    c.bind("x.Svc", "a")
    c.bind("x.Svc", "b")
    assert c.resolve("x.Svc") == "b"
