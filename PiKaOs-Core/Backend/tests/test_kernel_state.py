"""Kernel local-JSON state store (replaced the app_settings + user_settings DB tables).

Isolated to a tmp dir via KERNEL_STATE_DIR so it never touches a real state file.

    docker compose exec backend pytest tests/test_kernel_state.py
"""
from __future__ import annotations

import pytest

from app.core import kernel_state


@pytest.fixture
def tmp_state(tmp_path, monkeypatch):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    return tmp_path


def test_missing_returns_default(tmp_state):
    assert kernel_state.read_json("absent", {"d": 1}) == {"d": 1}
    assert kernel_state.read_json("absent", []) == []


def test_write_read_roundtrip_and_atomic_overwrite(tmp_state):
    kernel_state.write_json("app_settings", {"nav": {"value": [{"g": 1}], "updated_at": "t1"}})
    assert kernel_state.read_json("app_settings", {})["nav"]["value"] == [{"g": 1}]
    # overwrite leaves no stray .tmp and reads the new value
    kernel_state.write_json("app_settings", {"nav": {"value": [{"g": 2}], "updated_at": "t2"}})
    assert kernel_state.read_json("app_settings", {})["nav"]["value"] == [{"g": 2}]
    assert not (tmp_state / "app_settings.json.tmp").exists()


def test_user_settings_scoped_per_user(tmp_state):
    store = {"ua": {"theme": "pro-dark", "lex": "english_pro"}, "ub": {"theme": "pro"}}
    kernel_state.write_json("user_settings", store)
    got = kernel_state.read_json("user_settings", {})
    assert got["ua"] == {"theme": "pro-dark", "lex": "english_pro"}
    assert got["ub"] == {"theme": "pro"}          # a user only sees their own keys


def test_thai_content_preserved(tmp_state):
    kernel_state.write_json("app_settings", {"k": {"value": "สวัสดี"}})
    assert kernel_state.read_json("app_settings", {})["k"]["value"] == "สวัสดี"
