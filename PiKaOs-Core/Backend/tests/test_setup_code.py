"""Console-only rotating setup code — app/core/setup_state.py + routers/setup.py + generate_setup_code.

    docker compose exec backend pytest tests/test_setup_code.py

Design: docs/superpowers/specs/2026-07-02-setup-code-bootstrap-design.md.
"""
from __future__ import annotations

import re

import pytest
from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from scripts import generate_setup_code

CODE_RE = re.compile(r"^PIKA-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$")


@pytest.fixture
def tmp_state(tmp_path, monkeypatch):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    return tmp_path


# --- setup_state ---------------------------------------------------------------------------------

def test_generate_code_matches_the_safe_alphabet():
    code = setup_state.generate_code()
    assert CODE_RE.match(code), code


def test_generate_code_is_random():
    assert setup_state.generate_code() != setup_state.generate_code()


def test_write_then_read_roundtrips(tmp_state):
    assert setup_state.read_code() is None
    setup_state.write_code("PIKA-ABCD-2345")
    assert setup_state.read_code() == "PIKA-ABCD-2345"


def test_clear_code_removes_it(tmp_state):
    setup_state.write_code("PIKA-ABCD-2345")
    setup_state.clear_code()
    assert setup_state.read_code() is None


def test_verify_code_matches_case_insensitively(tmp_state):
    setup_state.write_code("PIKA-ABCD-2345")
    assert setup_state.verify_code("pika-abcd-2345") is True
    assert setup_state.verify_code("PIKA-ABCD-2345") is True


def test_verify_code_rejects_wrong_code(tmp_state):
    setup_state.write_code("PIKA-ABCD-2345")
    assert setup_state.verify_code("PIKA-0000-0000") is False


def test_verify_code_rejects_when_none_set(tmp_state):
    assert setup_state.verify_code("anything") is False


# --- generate_setup_code.py (the once-per-boot entrypoint step) ----------------------------------

def test_skips_and_clears_when_auth_enabled(tmp_state, monkeypatch, capsys):
    setup_state.write_code("PIKA-ABCD-2345")  # pretend a previous boot left a code behind
    monkeypatch.setenv("ENABLED_MODULES", "auth,knowledge")
    generate_setup_code.main()
    assert setup_state.read_code() is None
    assert capsys.readouterr().out == ""            # nothing printed once auth is on


def test_generates_and_prints_banner_when_auth_absent(tmp_state, monkeypatch, capsys):
    monkeypatch.setenv("ENABLED_MODULES", "knowledge")
    generate_setup_code.main()
    code = setup_state.read_code()
    assert code is not None and CODE_RE.match(code)
    out = capsys.readouterr().out
    assert code in out
    assert "═" in out                                 # the box-drawing border rule


# --- routers/setup.py (HTTP surface) --------------------------------------------------------------

@pytest.fixture
def client(tmp_state):
    import app.main as main
    with TestClient(main.app) as c:
        yield c


def test_status_reports_needs_setup_true_when_code_present(tmp_state, client):
    setup_state.write_code("PIKA-ABCD-2345")
    assert client.get("/api/setup/status").json() == {"needsSetup": True}


def test_status_reports_needs_setup_false_when_no_code(tmp_state, client):
    assert client.get("/api/setup/status").json() == {"needsSetup": False}


def test_verify_code_endpoint_accepts_the_right_code(tmp_state, client):
    setup_state.write_code("PIKA-ABCD-2345")
    resp = client.post("/api/setup/verify-code", json={"code": "pika-abcd-2345"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_verify_code_endpoint_rejects_a_wrong_code(tmp_state, client):
    setup_state.write_code("PIKA-ABCD-2345")
    resp = client.post("/api/setup/verify-code", json={"code": "PIKA-0000-0000"})
    assert resp.status_code == 401


def test_verify_code_endpoint_rejects_when_no_code_set(tmp_state, client):
    resp = client.post("/api/setup/verify-code", json={"code": "anything"})
    assert resp.status_code == 401
