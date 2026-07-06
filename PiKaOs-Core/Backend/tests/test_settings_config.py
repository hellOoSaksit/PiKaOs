"""routers/settings_config.py — the generic global-KV must NOT be a side-channel to installer-owned
keys (K4). `plugin_install_allowed_hosts` / `plugin_git_credentials` live in the same `app_settings`
blob, so `/api/settings/global/{key}` GET/PUT must refuse them (404) — otherwise `options.manage`
(weaker than `plugins.manage`) could widen the RCE allowlist or overwrite credentials, and any
authenticated user could read the credential blob.

    docker compose exec backend pytest tests/test_settings_config.py
"""
from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from app.core.git_installer import RESERVED_SETTINGS_KEYS


@pytest.fixture
def client(tmp_path, monkeypatch):
    # Bootstrap session token → BootstrapProvider grants every perm (incl. options.manage), so a 404 here
    # is the reserved-key guard, not an authz failure.
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as c:
        yield c


_AUTH = {"Authorization": "Bearer a-session-token"}


@pytest.mark.parametrize("key", sorted(RESERVED_SETTINGS_KEYS))
def test_reserved_keys_cannot_be_read_via_generic_settings(client, key):
    assert client.get(f"/api/settings/global/{key}", headers=_AUTH).status_code == 404


@pytest.mark.parametrize("key", sorted(RESERVED_SETTINGS_KEYS))
def test_reserved_keys_cannot_be_written_via_generic_settings(client, key):
    resp = client.put(f"/api/settings/global/{key}", json={"value": ["evil.example.com"]}, headers=_AUTH)
    assert resp.status_code == 404
    # and nothing was persisted under that key
    assert kernel_state.read_json("app_settings", {}).get(key) is None


def test_a_normal_global_key_still_round_trips(client):
    put = client.put("/api/settings/global/theme", json={"value": {"mode": "dark"}}, headers=_AUTH)
    assert put.status_code == 200
    got = client.get("/api/settings/global/theme", headers=_AUTH)
    assert got.status_code == 200 and got.json()["value"] == {"mode": "dark"}
