"""Console-only rotating setup code + bootstrap session token —
app/core/setup_state.py + app/core/identity.py's BootstrapProvider + routers/setup.py +
scripts/generate_setup_code.py.

    docker compose exec backend pytest tests/test_setup_code.py

Design: docs/superpowers/specs/2026-07-02-setup-code-bootstrap-design.md,
docs/superpowers/specs/2026-07-02-bootstrap-install-shell-design.md.
"""
from __future__ import annotations

import asyncio
import re

import pytest
from fastapi import FastAPI
from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from app.core.identity import ADMIN_ROLE, BOOTSTRAP
from scripts import generate_setup_code

CODE_RE = re.compile(r"^PIKA-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{4}$")
CODE = "PIKA-ABCD-2345"
TOKEN = "test-session-token-value"


@pytest.fixture
def tmp_state(tmp_path, monkeypatch):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    return tmp_path


# --- setup_state: code -----------------------------------------------------------------------------

def test_generate_code_matches_the_safe_alphabet():
    code = setup_state.generate_code()
    assert CODE_RE.match(code), code


def test_generate_code_is_random():
    assert setup_state.generate_code() != setup_state.generate_code()


def test_write_then_read_roundtrips(tmp_state):
    assert setup_state.read_code() is None
    setup_state.write(CODE, TOKEN)
    assert setup_state.read_code() == CODE


def test_clear_removes_code_and_token(tmp_state):
    setup_state.write(CODE, TOKEN)
    setup_state.clear()
    assert setup_state.read_code() is None
    assert setup_state.read_session_token() is None


def test_verify_code_matches_case_insensitively(tmp_state):
    setup_state.write(CODE, TOKEN)
    assert setup_state.verify_code("pika-abcd-2345") is True
    assert setup_state.verify_code(CODE) is True


def test_verify_code_rejects_wrong_code(tmp_state):
    setup_state.write(CODE, TOKEN)
    assert setup_state.verify_code("PIKA-0000-0000") is False


def test_verify_code_rejects_when_none_set(tmp_state):
    assert setup_state.verify_code("anything") is False


# --- setup_state: session token ---------------------------------------------------------------------

def test_generate_session_token_is_random():
    assert setup_state.generate_session_token() != setup_state.generate_session_token()


def test_verify_session_token_matches(tmp_state):
    setup_state.write(CODE, TOKEN)
    assert setup_state.verify_session_token(TOKEN) is True


def test_verify_session_token_rejects_wrong_token(tmp_state):
    setup_state.write(CODE, TOKEN)
    assert setup_state.verify_session_token("wrong") is False


def test_verify_session_token_rejects_when_none_set(tmp_state):
    assert setup_state.verify_session_token(TOKEN) is False


def test_verify_session_token_rejects_none_candidate(tmp_state):
    setup_state.write(CODE, TOKEN)
    assert setup_state.verify_session_token(None) is False


# --- identity.BootstrapProvider: the synthetic-admin path -------------------------------------------

def test_bootstrap_denies_without_a_token(tmp_state):
    assert asyncio.run(BOOTSTRAP.authenticate(None)) is None
    assert asyncio.run(BOOTSTRAP.authenticate("garbage")) is None


def test_bootstrap_authenticates_the_right_session_token(tmp_state):
    setup_state.write(CODE, TOKEN)
    user = asyncio.run(BOOTSTRAP.authenticate(TOKEN))
    assert user is not None and user.role == ADMIN_ROLE


def test_bootstrap_admin_has_every_perm_and_role(tmp_state):
    setup_state.write(CODE, TOKEN)
    user = asyncio.run(BOOTSTRAP.authenticate(TOKEN))
    assert asyncio.run(BOOTSTRAP.has_perm(user, "plugins.manage")) is True
    assert BOOTSTRAP.has_role(user, "admin") is True


def test_bootstrap_still_denies_a_stale_token_after_clear(tmp_state):
    setup_state.write(CODE, TOKEN)
    setup_state.clear()
    assert asyncio.run(BOOTSTRAP.authenticate(TOKEN)) is None


# --- generate_setup_code.py (the once-per-boot entrypoint step) -------------------------------------

def test_skips_and_clears_when_auth_enabled(tmp_state, monkeypatch, capsys):
    setup_state.write(CODE, TOKEN)  # pretend a previous boot left a code behind
    monkeypatch.setenv("ENABLED_MODULES", "auth,knowledge")
    generate_setup_code.main()
    assert setup_state.read_code() is None
    assert capsys.readouterr().out == ""            # nothing printed once auth is on


def test_generates_and_prints_banner_when_auth_absent(tmp_state, monkeypatch, capsys):
    monkeypatch.setenv("ENABLED_MODULES", "knowledge")
    generate_setup_code.main()
    code = setup_state.read_code()
    assert code is not None and CODE_RE.match(code)
    assert setup_state.read_session_token()          # a token was generated alongside the code
    out = capsys.readouterr().out
    assert code in out
    assert "═" in out                                 # the box-drawing border rule


# --- routers/setup.py (HTTP surface) -----------------------------------------------------------------

@pytest.fixture
def client(tmp_state):
    import app.main as main
    with TestClient(main.app) as c:
        yield c


def test_status_reports_needs_setup_true_when_code_present(tmp_state, client):
    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("setup")
    body = client.get("/api/setup/status").json()
    assert body["needsSetup"] is True
    assert body["bootstrapAuthorized"] is False       # no Authorization header sent


def test_status_reports_needs_setup_false_when_no_code(tmp_state, client):
    assert client.get("/api/setup/status").json() == {
        "needsSetup": False, "bootstrapAuthorized": False, "needsFirstAdmin": False,
        "needsDbConfig": False,
    }


def test_status_reports_bootstrap_authorized_with_a_valid_token(tmp_state, client):
    setup_state.write(CODE, TOKEN)
    resp = client.get("/api/setup/status", headers={"Authorization": f"Bearer {TOKEN}"})
    assert resp.json()["bootstrapAuthorized"] is True


def test_verify_code_endpoint_accepts_the_right_code_and_returns_a_token(tmp_state, client):
    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("setup")
    resp = client.post("/api/setup/verify-code", json={"code": "pika-abcd-2345"})
    assert resp.status_code == 200
    assert resp.json() == {"ok": True, "token": TOKEN}


def test_verify_code_endpoint_rejects_a_wrong_code(tmp_state, client):
    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("setup")
    resp = client.post("/api/setup/verify-code", json={"code": "PIKA-0000-0000"})
    assert resp.status_code == 401


def test_verify_code_endpoint_rejects_when_no_code_set(tmp_state, client):
    setup_state.write_auth_mode("setup")
    resp = client.post("/api/setup/verify-code", json={"code": "anything"})
    assert resp.status_code == 401


# --- end-to-end: the token verify-code hands back actually unlocks a plugins.manage route -----------

def test_bootstrap_token_unlocks_the_plugins_list_route(tmp_state, client):
    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("setup")
    verify = client.post("/api/setup/verify-code", json={"code": CODE})
    token = verify.json()["token"]
    resp = client.get("/api/plugins", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_plugins_route_still_401s_without_a_token(tmp_state, client):
    resp = client.get("/api/plugins")
    assert resp.status_code == 401


# --- auth mode + setup-completed flags (open-mode spec §4, phase 1) --------------------------------

def test_auth_mode_defaults_to_login(tmp_state):
    assert setup_state.read_auth_mode() == "login"


def test_auth_mode_roundtrips(tmp_state):
    setup_state.write_auth_mode("open")
    assert setup_state.read_auth_mode() == "open"
    setup_state.write_auth_mode("setup")
    assert setup_state.read_auth_mode() == "setup"


def test_auth_mode_unknown_value_reads_as_login(tmp_state):
    kernel_state.write_json("auth_mode", {"mode": "banana"})
    assert setup_state.read_auth_mode() == "login"


def test_setup_completed_roundtrips(tmp_state):
    assert setup_state.is_setup_completed() is False
    setup_state.mark_setup_completed()
    assert setup_state.is_setup_completed() is True


# --- boot decision: generate_setup_code.main() writes this boot's auth_mode ----

def test_boot_with_auth_enabled_sets_login_mode_and_no_code(tmp_state, monkeypatch):
    monkeypatch.setenv("ENABLED_MODULES", "auth")
    generate_setup_code.main()
    assert setup_state.read_auth_mode() == "login"
    assert setup_state.read_code() is None


def test_boot_after_setup_completed_opens_without_code_or_banner(tmp_state, monkeypatch, capsys):
    monkeypatch.setenv("ENABLED_MODULES", "")
    setup_state.mark_setup_completed()
    generate_setup_code.main()
    assert setup_state.read_auth_mode() == "open"
    assert setup_state.read_code() is None
    assert capsys.readouterr().out == ""          # open boots silently — nothing to paste


def test_fresh_boot_prints_code_and_sets_setup_mode(tmp_state, monkeypatch, capsys):
    monkeypatch.setenv("ENABLED_MODULES", "")
    generate_setup_code.main()
    assert setup_state.read_auth_mode() == "setup"
    assert setup_state.read_code() is not None
    assert "PIKA-" in capsys.readouterr().out


def test_verify_code_flips_server_open(tmp_state):
    from app.core.routers import setup as setup_router

    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("setup")
    app = FastAPI()
    app.include_router(setup_router.router)
    client = TestClient(app)

    r = client.post("/api/setup/verify-code", json={"code": CODE})
    assert r.status_code == 200
    assert setup_state.is_setup_completed() is True
    assert setup_state.read_auth_mode() == "open"


def test_wrong_code_flips_nothing(tmp_state):
    from app.core.routers import setup as setup_router

    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("setup")
    app = FastAPI()
    app.include_router(setup_router.router)
    client = TestClient(app)

    r = client.post("/api/setup/verify-code", json={"code": "PIKA-WRNG-WRNG"})
    assert r.status_code == 401
    assert setup_state.is_setup_completed() is False
    assert setup_state.read_auth_mode() == "setup"


# --- first-admin bootstrap window (auth enabled, zero users — 2026-07-14 spec) ---------------------

def _client() -> TestClient:
    from app.core.routers import setup as setup_router
    app = FastAPI()
    app.include_router(setup_router.router)
    return TestClient(app)


def test_status_reports_first_admin_window(tmp_state):
    """Code live + mode 'login' = the ownerless-auth window: needsFirstAdmin, NOT needsSetup."""
    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("login")
    body = _client().get("/api/setup/status").json()
    assert body["needsFirstAdmin"] is True
    assert body["needsSetup"] is False


def test_status_first_run_unchanged(tmp_state):
    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("setup")
    body = _client().get("/api/setup/status").json()
    assert body["needsSetup"] is True
    assert body["needsFirstAdmin"] is False


def test_verify_code_refuses_in_login_mode(tmp_state):
    """In the first-admin window the code belongs to /api/auth/bootstrap-admin. verify-code must NOT
    accept it — accepting would mark setup completed and declare authMode 'open' on a server whose
    identity provider is the auth plugin (a mixed, half-open state)."""
    setup_state.write(CODE, TOKEN)
    setup_state.write_auth_mode("login")
    resp = _client().post("/api/setup/verify-code", json={"code": CODE})
    assert resp.status_code == 409
    assert setup_state.is_setup_completed() is False
