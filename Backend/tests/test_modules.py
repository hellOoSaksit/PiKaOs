"""Tests for the module registry / ENABLED_MODULES seam (modularity.md §2.5).

Pure — no DB. Exercises module enable/disable parsing and that register_routers loads only the
active modules' routers, so a lightweight build can drop a whole bounded context.

    docker compose exec backend pytest tests/test_modules.py
"""
from __future__ import annotations

from fastapi import FastAPI

from app import modules
from app.config import settings


def test_star_or_empty_enables_all_optional(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "*")
    assert modules.enabled_optional_modules() == set(modules.OPTIONAL_MODULE_NAMES)
    monkeypatch.setattr(settings, "enabled_modules", "")
    assert modules.enabled_optional_modules() == set(modules.OPTIONAL_MODULE_NAMES)


def test_allowlist_limits_optional(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "compare")
    assert modules.enabled_optional_modules() == {"compare"}


def test_unknown_module_name_is_ignored(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "compare, nope")
    assert modules.enabled_optional_modules() == {"compare"}


def test_foundation_always_active_optional_gated(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "compare")  # engine/knowledge off
    assert modules.is_module_active("infra")       # foundation — ignores ENABLED_MODULES
    assert modules.is_module_active("core")
    assert modules.is_module_active("compare")     # enabled optional
    assert not modules.is_module_active("engine")  # optional, not enabled
    assert not modules.is_module_active("knowledge")


def test_active_modules_is_foundation_plus_enabled_in_order(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "engine")
    assert [m.name for m in modules.active_modules()] == ["infra", "core", "engine"]


def test_register_routers_loads_only_active(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "*")
    full = FastAPI()
    assert set(modules.register_routers(full)) == {"infra", "core", "engine", "knowledge", "compare"}

    monkeypatch.setattr(settings, "enabled_modules", "compare")
    slim = FastAPI()
    loaded = modules.register_routers(slim)
    assert "compare" in loaded and "knowledge" not in loaded and "engine" not in loaded
    # dropping engine + knowledge means fewer mounted routes — a real, observable plug-out.
    assert len(slim.routes) < len(full.routes)
