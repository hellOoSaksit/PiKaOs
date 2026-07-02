"""routers/plugins.py — GET /api/plugins response shape.

Regression coverage for a bug the bootstrap-session-token work surfaced (2026-07-02): this endpoint
had never been reachable in kernel-only mode before (always 401, no auth plugin), so a pre-existing
mismatch between `Manifest.permissions` (a tuple of `{key, group, name_th, name_en}` dicts) and
`PluginOut.permissions` (declared `list[str]`) went uncaught — `_view()` passed the dicts straight
through, and FastAPI's response-model validation 500'd on the first plugin with a declared permission.

    docker compose exec backend pytest tests/test_plugins_router.py
"""
from __future__ import annotations

from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from app.core.routers.plugins import _view


def test_view_serializes_permission_objects_down_to_key_strings(sample_plugins):
    out = _view(reg={}, active=set())
    sample = next(p for p in out if p.id == "sample")
    assert sample.permissions == ["sample.manage"]   # not the raw {key, group, ...} dicts


def test_plugins_endpoint_returns_200_with_a_bootstrap_token(sample_plugins, tmp_path, monkeypatch):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as client:
        resp = client.get("/api/plugins", headers={"Authorization": "Bearer a-session-token"})
    assert resp.status_code == 200
    body = resp.json()
    sample = next(p for p in body if p["id"] == "sample")
    assert sample["permissions"] == ["sample.manage"]
