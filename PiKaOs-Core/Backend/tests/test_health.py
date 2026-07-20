"""GET /api/health — deep readiness + the per-plugin state list (plugin-architecture.md §14).

    docker compose exec backend pytest tests/test_health.py
"""
from __future__ import annotations

from fastapi import FastAPI
from starlette.testclient import TestClient

from app.core.routers import health


def _client(states):
    app = FastAPI()
    app.include_router(health.router)
    app.state.plugin_states = lambda: states
    return TestClient(app)


def test_health_renders_active_and_disabled_plugins():
    r = _client([
        {"id": "good", "version": "1.2.3", "state": "active"},
        {"id": "off", "version": "2.0.0", "state": "disabled"},
    ]).get("/api/health")
    assert r.status_code == 200
    plugins = {p["id"]: p for p in r.json()["plugins"]}
    assert plugins["good"]["version"] == "1.2.3"
    assert plugins["good"]["state"] == "active"
    assert plugins["off"]["state"] == "disabled"


def test_health_renders_a_quarantined_plugin_without_500():
    """A quarantined plugin (K1) failed manifest validation, so `plugin_states()` reports it with
    `version=None` and a `reason` (modules.plugin_states). /health must still render — the whole point of
    §14 listing quarantined plugins is that the operator sees WHY a bad plugin didn't load, so the
    schema has to represent a version-less row instead of 500-ing on it."""
    r = _client([
        {"id": "good", "version": "1.2.3", "state": "active"},
        {"id": "bad", "version": None, "state": "quarantined", "reason": "manifest invalid: missing id"},
    ]).get("/api/health")
    assert r.status_code == 200
    plugins = {p["id"]: p for p in r.json()["plugins"]}
    assert plugins["bad"]["version"] is None
    assert plugins["bad"]["state"] == "quarantined"
    # the quarantine reason must reach the wire, not be silently dropped
    assert plugins["bad"]["reason"] == "manifest invalid: missing id"
