"""Removal-isolation gate — proves §2.2 / §13 of plugin-architecture.md.

The litmus of a real plugin: disable it and Core + every other plugin still boot, with that
plugin's routes simply absent. test_modules.py asserts which *module names* load; this asserts the
observable surface — the concrete route **paths** appear only when the plugin is enabled, while the
Base routes are present in every build. Runs plugin-free via the synthetic `sample` plugin (conftest).

    docker compose exec backend pytest tests/test_isolation.py
"""
from __future__ import annotations

from fastapi import FastAPI

from app import modules
from app.core.config import settings

BASE_PATH = "/api/health"        # infra (Base) — must exist in every build
SAMPLE_PREFIX = "/api/sample"    # the synthetic sample plugin's namespaced routes


def _paths() -> set[str]:
    """Mount a fresh app under the current ENABLED_MODULES and return its real route paths.
    Reads them from the OpenAPI schema — this FastAPI version includes routers lazily, so
    `app.routes` holds unresolved wrappers; `app.openapi()` forces the actual path strings."""
    app = FastAPI()
    modules.register_routers(app)
    return set(app.openapi()["paths"].keys())


def test_base_only_has_no_sample_routes(sample_plugins, monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "")  # prod default — Base only
    paths = _paths()
    assert BASE_PATH in paths, "Base /api/health must boot with every plugin disabled"
    assert not any(p.startswith(SAMPLE_PREFIX) for p in paths), (
        "disabled sample plugin must mount NO routes (removability litmus, §2.2)")


def test_enabling_sample_adds_its_routes(sample_plugins, monkeypatch):
    monkeypatch.setattr(settings, "enabled_modules", "sample")
    paths = _paths()
    assert BASE_PATH in paths, "Base survives when a plugin is enabled"
    assert any(p.startswith(SAMPLE_PREFIX) for p in paths), (
        "enabled sample plugin must mount its /api/sample routes")


def test_star_is_superset_of_base_only(sample_plugins, monkeypatch):
    """Plug-out is strictly subtractive: the Base-only build is a subset of the full build, and the
    difference is exactly plugin routes (nothing Base disappears when plugins switch off)."""
    monkeypatch.setattr(settings, "enabled_modules", "*")
    full = _paths()
    monkeypatch.setattr(settings, "enabled_modules", "")
    base = _paths()
    assert base <= full
    assert all(not p.startswith(SAMPLE_PREFIX) for p in base)
    assert any(p.startswith(SAMPLE_PREFIX) for p in full - base)
