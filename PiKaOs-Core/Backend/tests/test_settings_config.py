"""routers/settings_config.py — the settings tier is now the shared `nav` blob + per-user `/me`. The
generic `/settings/global/{key}` KV was removed (G1): it had no consumers and was an authz side-channel.
`GET /nav` is intentionally open to every authenticated user (the sidebar needs it on load); `PUT /nav`
requires `options.manage` and is NOT an AI tool.

    docker compose exec backend pytest tests/test_settings_config.py
"""
from __future__ import annotations

from uuid import UUID

import pytest
from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from app.core.contracts import IDENTITY


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Bootstrap session token → BootstrapProvider grants the synthetic admin (has_perm True), so the
    # nav-cap tests below can PUT /nav. The identity-stub tests rebind IDENTITY for their own scope.
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as c:
        yield c


_AUTH = {"Authorization": "Bearer a-session-token"}


# --- a permission-less / permissioned stub identity, bound through the DI seam -----------------------

class _StubUser:
    id = UUID(int=1)
    role = "member"      # deliberately NOT admin, so no role==admin shortcut can mask a missing perm
    status = "active"


class _StubProvider:
    """Authenticates any bearer to a fixed non-admin user; `has_perm` answers from a fixed perm set."""
    def __init__(self, perms):
        self._perms = set(perms)

    async def authenticate(self, token):
        return _StubUser() if token else None

    async def has_perm(self, user, perm):
        return perm in self._perms

    def has_role(self, user, *roles):
        return _StubUser.role in roles


def _bind_identity(client, perms):
    client.app.state.container.bind(IDENTITY, _StubProvider(perms))


# --- the removed global tier is gone ----------------------------------------------------------------

def test_the_generic_global_kv_route_is_removed(client):
    assert client.get("/api/settings/global/anything", headers=_AUTH).status_code == 404
    assert client.put("/api/settings/global/anything", json={"value": 1}, headers=_AUTH).status_code == 404


# --- GET /nav is intentionally open; PUT /nav is gated on options.manage ----------------------------

def test_nav_read_is_open_to_a_permissionless_user(client):
    _bind_identity(client, perms=set())                       # authenticated, but holds NO permissions
    assert client.get("/api/settings/nav", headers=_AUTH).status_code == 200


def test_nav_write_is_forbidden_without_options_manage(client):
    _bind_identity(client, perms=set())
    assert client.put("/api/settings/nav", json={"value": ["a"]}, headers=_AUTH).status_code == 403


def test_nav_write_is_allowed_with_options_manage(client):
    _bind_identity(client, perms={"options.manage"})
    assert client.put("/api/settings/nav", json={"value": ["a"]}, headers=_AUTH).status_code == 200


# --- the size cap now lives only on the nav writer --------------------------------------------------

def test_the_nav_writer_is_capped(client):
    resp = client.put("/api/settings/nav", json={"value": ["x" * 70_000]}, headers=_AUTH)
    assert resp.status_code == 413
    assert kernel_state.read_json("app_settings", {}).get("nav") is None


def test_a_nav_value_just_under_the_cap_is_accepted(client):
    # NavConfigIn.value is typed `list` (the nav arrangement is a list of groups) — wrap the payload
    # accordingly; a bare string body would 422 on schema validation before the size guard even runs.
    resp = client.put("/api/settings/nav", json={"value": ["x" * 60_000]}, headers=_AUTH)
    assert resp.status_code == 200


def test_the_cap_counts_utf8_bytes_not_ascii_escapes(client):
    """Stored with `ensure_ascii=False`, so a Thai char costs 3 UTF-8 bytes, not the 6 of a \\uXXXX
    escape. Measuring the escaped form would reject a value that fits on disk."""
    thai = "ก" * 20_000                                        # 60 KB UTF-8; 120 KB escaped
    resp = client.put("/api/settings/nav", json={"value": [thai]}, headers=_AUTH)
    assert resp.status_code == 200


# --- the nav write is audited (key only) ------------------------------------------------------------

def test_nav_write_lands_in_audit_trail_with_key_only(client):
    from app.core import audit
    _bind_identity(client, perms={"options.manage"})
    assert client.put("/api/settings/nav", json={"value": ["secret-layout"]}, headers=_AUTH).status_code == 200
    rows = audit.read(action="settings.write")
    assert rows and rows[0]["target"] == "nav"
    import json as _json
    assert "secret-layout" not in _json.dumps(rows)   # key only — never the value
