"""Tests for the module registry / ENABLED_MODULES seam (modularity.md §2.5).

Pure — no DB. Exercises module enable/disable parsing and that register_routers loads only the
active modules' routers, so a lightweight build can drop a whole bounded context.

    docker compose exec backend pytest tests/test_modules.py
"""
from __future__ import annotations

from fastapi import FastAPI

from app import modules
from app.config import settings


def test_star_enables_all_plugins_empty_is_base_only(monkeypatch):
    # "*" = full build (every plugin); "" / unset = Base only (NO plugins) — the new default.
    monkeypatch.setattr(settings, "enabled_modules", "*")
    assert modules.enabled_optional_modules() == set(modules.OPTIONAL_MODULE_NAMES)
    monkeypatch.setattr(settings, "enabled_modules", "")
    assert modules.enabled_optional_modules() == set()


def test_allowlist_limits_optional(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "knowledge")
    assert modules.enabled_optional_modules() == {"knowledge"}


def test_unknown_module_name_is_ignored(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "knowledge, nope")
    assert modules.enabled_optional_modules() == {"knowledge"}


def test_base_always_active_plugins_gated(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "knowledge")  # only the knowledge plugin on
    assert modules.is_module_active("infra")       # Base — ignores ENABLED_MODULES
    assert modules.is_module_active("core")
    assert modules.is_module_active("engine")      # engine is part of the Base now (always on)
    assert modules.is_module_active("knowledge")   # enabled plugin
    assert not modules.is_module_active("nope")    # unknown name, never active


def test_active_modules_is_base_only_when_empty(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "")  # Base only — no plugins
    assert [m.name for m in modules.active_modules()] == ["infra", "core", "engine"]


def test_register_routers_loads_only_active(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "*")
    full = FastAPI()
    assert set(modules.register_routers(full)) == {"infra", "core", "engine", "knowledge"}

    monkeypatch.setattr(settings, "enabled_modules", "")  # Base only — knowledge plugs out
    slim = FastAPI()
    loaded = modules.register_routers(slim)
    # engine stays (Base); knowledge plugs out.
    assert "engine" in loaded and "knowledge" not in loaded
    # dropping the knowledge plugin means fewer mounted routes — a real, observable plug-out.
    assert len(slim.routes) < len(full.routes)


def test_base_only_drops_all_plugins(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "")  # the clean/prod default
    base = FastAPI()
    loaded = modules.register_routers(base)
    assert set(loaded) == {"infra", "core", "engine"}
    assert "knowledge" not in loaded
