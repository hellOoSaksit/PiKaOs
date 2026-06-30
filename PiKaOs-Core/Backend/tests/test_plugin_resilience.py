"""Plugin resilience + config gates — proves §8 (fault isolation), §10 (shutdown), §11 (config).

Pure (no DB): drives the Loader lifecycle with in-memory fake plugin modules and the real knowledge
manifest, so it runs in the normal pytest job alongside test_isolation/test_modules.

    docker compose exec backend pytest tests/test_plugin_resilience.py
"""
from __future__ import annotations

from types import SimpleNamespace

from app import modules, plugin_loader
from app.core.config import settings
from app.core.container import Container


def _mf(pid: str, deps: tuple[str, ...] = ()) -> plugin_loader.Manifest:
    return plugin_loader.Manifest(id=pid, name=pid, version="0.1.0", coreVersion="^0.1.0", dependencies=deps)


def _ctx() -> plugin_loader.PluginContext:
    return plugin_loader.PluginContext(container=Container(), events=None)


# --- §8 lifecycle fault isolation -------------------------------------------------------------------

def test_register_failure_is_isolated_others_still_boot(monkeypatch):
    """A plugin whose register() raises is marked degraded; the rest register + boot normally."""
    calls: list[str] = []
    good = SimpleNamespace(register=lambda c: calls.append("good.register"),
                           boot=lambda c: calls.append("good.boot"))

    def boom(c):
        raise RuntimeError("register kaboom")

    bad = SimpleNamespace(register=boom, boot=lambda c: calls.append("bad.boot"))
    monkeypatch.setattr(plugin_loader, "_import_enabled",
                        lambda enabled, manifests: [("bad", bad), ("good", good)])

    result = plugin_loader.register_plugins({"bad", "good"}, {"bad": _mf("bad"), "good": _mf("good")}, _ctx())

    assert result.booted == ["good"], "the healthy plugin still boots"
    assert "bad" in result.degraded and "register" in result.degraded["bad"]
    assert "bad.boot" not in calls, "a plugin that failed register() is skipped in the boot pass"
    assert calls == ["good.register", "good.boot"]


def test_boot_failure_marks_degraded(monkeypatch):
    def boom(c):
        raise RuntimeError("boot kaboom")

    bad = SimpleNamespace(register=lambda c: None, boot=boom)
    monkeypatch.setattr(plugin_loader, "_import_enabled", lambda e, m: [("bad", bad)])
    result = plugin_loader.register_plugins({"bad"}, {"bad": _mf("bad")}, _ctx())
    assert result.booted == [] and "boot" in result.degraded["bad"]


# --- §10 shutdown in reverse dependency order -------------------------------------------------------

def test_shutdown_runs_reverse_dependency_order(monkeypatch):
    order: list[str] = []
    a = SimpleNamespace(shutdown=lambda c: order.append("a"))
    b = SimpleNamespace(shutdown=lambda c: order.append("b"))  # b depends on a → boots a,b → shuts b,a
    monkeypatch.setattr(plugin_loader.importlib, "import_module",
                        lambda name: {"app.plugins.a": a, "app.plugins.b": b}[name])
    manifests = {"a": _mf("a"), "b": _mf("b", deps=("a",))}
    errors = plugin_loader.shutdown_plugins({"a", "b"}, manifests, _ctx())
    assert errors == {} and order == ["b", "a"]


def test_shutdown_failure_is_isolated(monkeypatch):
    a = SimpleNamespace(shutdown=lambda c: (_ for _ in ()).throw(RuntimeError("nope")))
    monkeypatch.setattr(plugin_loader.importlib, "import_module", lambda name: a)
    errors = plugin_loader.shutdown_plugins({"a"}, {"a": _mf("a")}, _ctx())
    assert "a" in errors  # logged + returned, never raised


# --- §8 + §14 router-mount isolation surfaces as a degraded /health state ---------------------------

def test_router_mount_failure_marks_degraded_not_fatal(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "knowledge")

    def boom(pid):
        raise RuntimeError("bad router import")

    monkeypatch.setattr(plugin_loader, "load_router", boom)
    names = [m.name for m in modules.active_modules()]
    assert "infra" in names and "core" in names and "engine" in names, "Base survives a bad plugin"
    assert "knowledge" not in names, "the failed plugin mounts no routes"
    states = {p["id"]: p["state"] for p in modules.plugin_states()}
    assert states["knowledge"] == "degraded"


def test_plugin_states_active_then_disabled(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "knowledge")
    modules.active_modules()
    assert {p["id"]: p["state"] for p in modules.plugin_states()}["knowledge"] == "active"
    monkeypatch.setattr(settings, "enabled_modules", "")
    modules.active_modules()
    assert {p["id"]: p["state"] for p in modules.plugin_states()}["knowledge"] == "disabled"


# --- §11 schema-validated, config-driven plugin config ----------------------------------------------

def test_load_config_returns_schema_defaults():
    cfg = plugin_loader.load_config(modules.PLUGIN_MANIFESTS["knowledge"])
    assert cfg == {"top_k": 5, "min_score": 0.0}


def test_load_config_empty_when_no_schema():
    assert plugin_loader.load_config(_mf("x")) == {}


def test_register_passes_plugin_config_via_ctx(monkeypatch):
    seen: dict = {}
    plugin = SimpleNamespace(register=lambda c: seen.update(c.config))
    monkeypatch.setattr(plugin_loader, "_import_enabled", lambda e, m: [("knowledge", plugin)])
    plugin_loader.register_plugins({"knowledge"}, modules.PLUGIN_MANIFESTS, _ctx())
    assert seen == {"top_k": 5, "min_score": 0.0}
