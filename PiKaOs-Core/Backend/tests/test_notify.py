"""app/core/notify.py — capped i18n-clean notification store (audit-notifications v2 spec §1).

    docker compose exec backend pytest tests/test_notify.py
"""
from __future__ import annotations

import pytest

from app.core import kernel_state, notify


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))


def test_emit_list_and_cap():
    for i in range(notify.CAP + 10):
        notify.emit("plugin", "notif.plugin.installed", {"plugin": f"p{i}"})
    rows = notify.list_all()
    assert len(rows) == notify.CAP
    assert rows[0]["params"]["plugin"] == f"p{notify.CAP + 9}"     # newest first, oldest dropped
    assert rows[0]["read"] is False and rows[0]["id"].startswith("ntf_")


def test_params_must_be_small_strings():
    with pytest.raises(ValueError):
        notify.emit("x", "k", {"big": "y" * 500})
    with pytest.raises(ValueError):
        notify.emit("x", "k", {"obj": {"nested": True}})
    with pytest.raises(ValueError):
        notify.emit("x", "k", {f"k{i}": "v" for i in range(9)})    # > 8 entries


def test_mark_read_specific_all_and_idempotent():
    a = notify.emit("x", "k1")
    notify.emit("x", "k2")
    assert notify.unread_count() == 2
    assert notify.mark_read([a["id"], "ntf_ghost"]) == 1           # unknown id = no-op, not an error
    assert notify.unread_count() == 1
    assert notify.mark_read() == 1
    assert notify.mark_read() == 0


def test_corrupt_blob_self_heals(tmp_path):
    kernel_state.write_json("notifications", {"not": "a list"})
    assert notify.list_all() == []
    notify.emit("x", "k")
    assert len(notify.list_all()) == 1
