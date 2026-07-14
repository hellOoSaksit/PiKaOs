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


def test_db_config_is_reserved_from_generic_settings_api(client):
    # generic settings PUT/GET must 404 on db_config (like mcp_allowlist / credentials)
    put = client.put("/api/settings/global/db_config", json={"value": {"dsn": "x"}}, headers=_AUTH)
    assert put.status_code == 404
    assert client.get("/api/settings/global/db_config", headers=_AUTH).status_code == 404


def test_a_normal_global_key_still_round_trips(client):
    put = client.put("/api/settings/global/theme", json={"value": {"mode": "dark"}}, headers=_AUTH)
    assert put.status_code == 200
    got = client.get("/api/settings/global/theme", headers=_AUTH)
    assert got.status_code == 200 and got.json()["value"] == {"mode": "dark"}


def test_an_oversized_value_is_refused_and_never_persisted(client):
    """`put_global` is `ai_safe`, so an AI holding options.manage may write here. Unbounded, that
    authority is a DoS: `app_settings` is one JSON file that every settings read/write reparses and
    rewrites in full, so a single huge value taxes the reserved installer keys sharing it too."""
    resp = client.put("/api/settings/global/bloat", json={"value": "x" * 70_000}, headers=_AUTH)
    assert resp.status_code == 413
    assert kernel_state.read_json("app_settings", {}).get("bloat") is None


def test_the_nav_writer_is_capped_too(client):
    """`put_nav` carries the same `ai_safe` authority over the same blob — capping only `put_global`
    would leave the identical DoS one route away."""
    resp = client.put("/api/settings/nav", json={"value": ["x" * 70_000]}, headers=_AUTH)
    assert resp.status_code == 413
    assert kernel_state.read_json("app_settings", {}).get("nav") is None


def test_a_value_just_under_the_cap_is_accepted(client):
    """The cap must not be so eager that a legitimate config blob trips it."""
    resp = client.put("/api/settings/global/big", json={"value": "x" * 60_000}, headers=_AUTH)
    assert resp.status_code == 200


def test_the_cap_counts_the_bytes_that_will_be_persisted_not_ascii_escapes(client):
    """Values are stored with `ensure_ascii=False`, so a Thai label costs 3 UTF-8 bytes, not the 6 of
    a `\\uXXXX` escape. Measuring the escaped form would reject a value that fits on disk."""
    thai = "ก" * 20_000                                    # 60 KB as UTF-8; 120 KB escaped
    resp = client.put("/api/settings/global/thai", json={"value": thai}, headers=_AUTH)
    assert resp.status_code == 200
