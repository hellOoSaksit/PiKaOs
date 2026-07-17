"""app/core/notify.py — capped i18n-clean notification store (audit-notifications v2 spec §1).

    docker compose exec backend pytest tests/test_notify.py
"""
from __future__ import annotations

import pytest

from app.core import kernel_state, notify
from tests.conftest import AUTH_HEADER


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


def test_emit_never_raises_when_the_store_cannot_be_written(monkeypatch):
    """Coercing bad params was only half of the guarantee — the WRITE can fail too.

    emit() runs at the success point of a mutation that has already persisted, so a full disk or an
    unwritable state dir must not turn a plugin install that really happened into a 500. audit.log()
    has had `test_log_never_raises` from the start; this is its missing twin, and without it the
    unguarded kernel_state.update() went unnoticed.
    """
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", "/proc/nonexistent-root/nope")
    notify.emit("plugin", "notif.plugin.installed", {"plugin": "crm"})   # must swallow, not raise


def test_bad_params_are_coerced_not_rejected():
    # emit() runs after the mutation it announces already persisted — it must never raise a
    # succeeded action into a 500. Oversized/wrong-typed params get sanitized and stored.
    notify.emit("x", "k", {"big": "y" * 500})
    assert notify.list_all()[0]["params"] == {"big": "y" * 200}     # truncated to _MAX_PARAM_CHARS

    notify.emit("x", "k", {"obj": {"nested": True}})
    assert notify.list_all()[0]["params"] == {"obj": "{'nested': True}"}   # non-str stringified

    notify.emit("x", "k", {f"k{i}": "v" for i in range(9)})
    stored = notify.list_all()[0]["params"]
    assert len(stored) == 8 and stored == {f"k{i}": "v" for i in range(8)}   # overflow dropped


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


# --- routes: the bell feed is any-authenticated-user, never anonymous ----------------------------

def test_notifications_routes_require_authentication(client):
    assert client.get("/api/notifications").status_code == 401
    assert client.put("/api/notifications/read", json={"ids": None}).status_code == 401


def test_notifications_read_and_mark(client):
    notify.emit("plugin", "notif.plugin.installed", {"plugin": "crm"})
    rows = client.get("/api/notifications", headers=AUTH_HEADER).json()
    assert rows[0]["key"] == "notif.plugin.installed" and rows[0]["read"] is False
    marked = client.put("/api/notifications/read", json={"ids": None}, headers=AUTH_HEADER).json()
    assert marked == {"marked": 1}
    assert client.get("/api/notifications", headers=AUTH_HEADER).json()[0]["read"] is True
