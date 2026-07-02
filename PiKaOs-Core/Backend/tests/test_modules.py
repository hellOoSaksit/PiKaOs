"""Tests for the module registry / ENABLED_MODULES seam (plugin-architecture.md §2.5).

Pure — no DB. Exercises module enable/disable parsing and that register_routers loads only the active
modules' routers, so a lightweight build can drop a whole bounded context. Runs plugin-free: the
`sample`/`sampletool` synthetic plugins (conftest) stand in for real features. The **Base** is now just
`infra` + `core` — the old always-on `engine` module moved into the `ai` plugin.

    docker compose exec backend pytest tests/test_modules.py
"""
from __future__ import annotations

from fastapi import FastAPI

from app import modules
from app.core.config import settings


def test_star_enables_all_plugins_empty_is_base_only(sample_plugins, monkeypatch):
    # "*" = full build (every plugin); "" / unset = Base only (NO plugins) — the default.
    monkeypatch.setattr(settings, "enabled_modules", "*")
    assert modules.enabled_optional_modules() == {"sample", "sampletool"}
    monkeypatch.setattr(settings, "enabled_modules", "")
    assert modules.enabled_optional_modules() == set()


def test_allowlist_limits_optional(sample_plugins, monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "sample")
    assert modules.enabled_optional_modules() == {"sample"}


def test_unknown_module_name_is_ignored(sample_plugins, monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "sample, nope")
    assert modules.enabled_optional_modules() == {"sample"}


def test_base_always_active_plugins_gated(sample_plugins, monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "sample")  # only the sample plugin on
    assert modules.is_module_active("infra")       # Base — ignores ENABLED_MODULES
    assert modules.is_module_active("core")
    assert modules.is_module_active("sample")      # enabled plugin
    assert not modules.is_module_active("sampletool")  # discovered but not enabled
    assert not modules.is_module_active("nope")    # unknown name, never active


def test_active_modules_is_base_only_when_empty(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "")  # Base only — no plugins
    assert [m.name for m in modules.active_modules()] == ["infra", "core"]


def test_register_routers_loads_only_active(sample_plugins, monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "sample")
    full = FastAPI()
    # sample (routed capability) mounts; sampletool isn't enabled in this build.
    assert set(modules.register_routers(full)) == {"infra", "core", "sample"}

    monkeypatch.setattr(settings, "enabled_modules", "")  # Base only — sample plugs out
    slim = FastAPI()
    loaded = modules.register_routers(slim)
    assert "sample" not in loaded
    # dropping the sample plugin means fewer mounted routes — a real, observable plug-out.
    assert len(slim.routes) < len(full.routes)


def test_base_only_drops_all_plugins(monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "")  # the clean/prod default
    base = FastAPI()
    loaded = modules.register_routers(base)
    assert set(loaded) == {"infra", "core"}


def test_plugin_states_report_manifest_version_and_active_disabled(sample_plugins, monkeypatch):
    # /health (§14): every discovered plugin appears with its MANIFEST version + active/disabled state.
    monkeypatch.setattr(settings, "enabled_modules", "sample")
    states = {s["id"]: s for s in modules.plugin_states()}
    assert states["sample"]["state"] == "active"
    assert states["sample"]["version"] == sample_plugins.sample.version

    monkeypatch.setattr(settings, "enabled_modules", "")  # disabled, but still listed
    states = {s["id"]: s for s in modules.plugin_states()}
    assert states["sample"]["state"] == "disabled"
