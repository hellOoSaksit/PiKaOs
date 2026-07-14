"""`/api/setup/db-test` + `/api/setup/db-config` — the setup-code-gated DB-choice routes (Task 3).

Both routes require a valid bootstrap Bearer (the token `verify-code` hands back — see
test_setup_code.py) and never leak the real driver exception or DSN to the client: only a generic
"database connection failed" crosses the wire, the real detail stays server-side in `db_probe`'s log.
Most tests monkeypatch `app.core.db_probe.probe` (an async coroutine now) so no live DB is needed;
`test_probe_real_path_refuses_a_dead_port` exercises the UN-monkeypatched `_aprobe` against a dead
port to prove the probe runs on the caller's loop and maps errors correctly (asyncio_mode=auto → a
bare `async def test_…` runs on the event loop, no decorator).

    docker compose exec backend pytest tests/test_setup_db.py
"""
from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from app.core import db_probe, setup_state

CODE = "PIKA-ABCD-2345"
TOKEN = "test-session-token-value"


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


async def _ok_probe(dsn):
    """Async stand-in for a successful probe — the route `await`s `probe`, so the stub must be a
    coroutine (a sync `lambda dsn: None` would make `await None` raise TypeError)."""
    return None


@pytest.fixture
def client(tmp_state):
    import app.main as main
    with TestClient(main.app) as c:
        yield c


@pytest.fixture
def bootstrap_token(tmp_state):
    """Seed a live setup code + session token (the state `verify-code` would have left behind) and
    hand back the token — same shape as test_setup_code.py's client fixture uses."""
    setup_state.write(CODE, TOKEN)
    return TOKEN


# --- db-test -------------------------------------------------------------------------------------

def test_db_test_requires_bootstrap_bearer(client):
    assert client.post("/api/setup/db-test", json={"provider": "bundled"}).status_code == 401


def test_db_test_ok_when_probe_succeeds(client, bootstrap_token, monkeypatch):
    monkeypatch.setattr("app.core.db_probe.probe", _ok_probe)                # pretend it connects
    r = client.post("/api/setup/db-test", json={"provider": "bundled"}, headers=_auth(bootstrap_token))
    assert r.status_code == 200 and r.json()["ok"] is True


def test_db_test_generic_400_when_probe_fails(client, bootstrap_token, monkeypatch):
    async def boom(dsn): raise db_probe.DbProbeError("real detail")
    monkeypatch.setattr("app.core.db_probe.probe", boom)
    r = client.post("/api/setup/db-test", json={"provider": "pg", "host": "h", "port": 5432,
                    "user": "u", "password": "p", "dbname": "d"}, headers=_auth(bootstrap_token))
    assert r.status_code == 400 and "real detail" not in r.text          # generic to client


def test_db_test_rejects_transaction_pooler(client, bootstrap_token):
    r = client.post("/api/setup/db-test", json={"provider": "supabase",
                    "connectionString": "postgresql://u:p@x.pooler.supabase.com:6543/postgres"},
                    headers=_auth(bootstrap_token))
    assert r.status_code == 400


def test_db_test_incomplete_pg_payload_is_generic_400(client, bootstrap_token):
    """A `pg` provider with no host/user/… makes `db_dsn.build` raise `KeyError` — the route must map
    it to the same generic 400, not leak a 500 (KeyError is in the routes' except tuple)."""
    r = client.post("/api/setup/db-test", json={"provider": "pg"}, headers=_auth(bootstrap_token))
    assert r.status_code == 400


# --- db-config -------------------------------------------------------------------------------------

def test_db_config_saves_and_signals_restart(client, bootstrap_token, monkeypatch, tmp_state):
    monkeypatch.setattr("app.core.db_probe.probe", _ok_probe)
    r = client.post("/api/setup/db-config", json={"provider": "bundled"}, headers=_auth(bootstrap_token))
    assert r.status_code == 200 and r.json()["restart_required"] is True
    from app.core import db_config
    assert db_config.is_configured() is True


def test_db_config_does_not_persist_on_failed_probe(client, bootstrap_token, monkeypatch, tmp_state):
    """A failed probe must leave NO db_config behind — the operator can retry with a corrected DSN."""
    async def boom(dsn): raise db_probe.DbProbeError("real detail")
    monkeypatch.setattr("app.core.db_probe.probe", boom)
    r = client.post("/api/setup/db-config", json={"provider": "bundled"}, headers=_auth(bootstrap_token))
    assert r.status_code == 400 and "real detail" not in r.text
    from app.core import db_config
    assert db_config.is_configured() is False


def test_db_config_second_call_conflicts(client, bootstrap_token, monkeypatch, tmp_state):
    monkeypatch.setattr("app.core.db_probe.probe", _ok_probe)
    client.post("/api/setup/db-config", json={"provider": "bundled"}, headers=_auth(bootstrap_token))
    r = client.post("/api/setup/db-config", json={"provider": "bundled"}, headers=_auth(bootstrap_token))
    assert r.status_code == 409


def test_db_config_requires_bootstrap_bearer(client):
    assert client.post("/api/setup/db-config", json={"provider": "bundled"}).status_code == 401


# --- status: needsDbConfig -------------------------------------------------------------------------

def test_status_reports_needsDbConfig_after_authorized(client, bootstrap_token, tmp_state):
    r = client.get("/api/setup/status", headers=_auth(bootstrap_token))
    assert r.json()["needsDbConfig"] is True       # authorized + no db_config marker


def test_status_reports_needsDbConfig_false_when_unauthorized(client, tmp_state):
    r = client.get("/api/setup/status")
    assert r.json()["needsDbConfig"] is False      # no bearer → never leak DB-config status


# --- real-path probe (un-monkeypatched) ------------------------------------------------------------

async def test_probe_real_path_refuses_a_dead_port():
    """Exercise the ACTUAL async `_aprobe`/`probe` against a guaranteed-dead port (1 → fast connection
    refused). Proves `probe` runs on the caller's already-running event loop (no nested `asyncio.run`,
    which would `RuntimeError`) and maps a real driver failure to `DbProbeError`. This is the test that
    would have caught the asyncio.run-on-a-running-loop bug — none of the monkeypatched tests could."""
    with pytest.raises(db_probe.DbProbeError):
        await db_probe.probe("postgresql+asyncpg://u:p@127.0.0.1:1/nope")
