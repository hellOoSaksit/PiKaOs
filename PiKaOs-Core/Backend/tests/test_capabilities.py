"""GET /api/capabilities — the C1 capability handshake (open-mode spec §2, phase 1).

    docker compose exec backend pytest tests/test_capabilities.py
"""
from __future__ import annotations

import re
from types import SimpleNamespace

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from app.core.instance import instance_id
from app.core.routers import health

UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")


@pytest.fixture
def tmp_state(tmp_path, monkeypatch):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    return tmp_path


def _client() -> TestClient:
    app = FastAPI()
    app.include_router(health.router)
    app.state.plugin_states = lambda: [
        {"id": "sample", "version": "1.0.0", "state": "active"},
        {"id": "offone", "version": "2.0.0", "state": "disabled"},
    ]
    return TestClient(app)


def test_instance_id_is_a_uuid_and_stable(tmp_state):
    a, b = instance_id(), instance_id()
    assert UUID_RE.match(a)
    assert a == b


def test_default_mode_is_login(tmp_state):
    r = _client().get("/api/capabilities")
    assert r.status_code == 200
    body = r.json()
    assert body["v"] == 1
    assert body["authMode"] == "login"
    assert UUID_RE.match(body["instanceId"])


def test_open_mode_reports_open_and_lists_active_plugins(tmp_state):
    setup_state.write_auth_mode("open")
    body = _client().get("/api/capabilities").json()
    assert body["authMode"] == "open"
    assert body["plugins"] == [{"id": "sample", "version": "1.0.0", "frontend": None}]


def test_setup_mode_reports_login_on_the_wire(tmp_state):
    # internal 3-valued state, 2-valued C1 surface: "setup" is not "open"
    setup_state.write_auth_mode("setup")
    assert _client().get("/api/capabilities").json()["authMode"] == "login"


def test_production_login_mode_hides_plugins_from_anonymous(tmp_state, monkeypatch):
    monkeypatch.setattr(
        health, "settings",
        SimpleNamespace(is_production=True, app_version="0.0", build_hash="b", app_name="t"),
    )
    setup_state.write_auth_mode("login")
    body = _client().get("/api/capabilities").json()
    assert body["authMode"] == "login"
    assert body["plugins"] == []          # Fix-SEC-10 discipline: no recon aid pre-auth
