"""app/core/update_schedule.py — the flock'd scheduled-update store (spec §6.1-§6.2)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.core import kernel_state, update_schedule as us


@pytest.fixture(autouse=True)
def _isolate_kernel_state(monkeypatch, tmp_path):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))


def iso(**delta): return (datetime.now(timezone.utc) + timedelta(**delta)).isoformat()


def due_entry(plugin_id: str = "crm", tag: str = "v1.0.0", **ago):
    """A PENDING entry whose time has already passed — the state `claim_due` exists to act on.

    It cannot be created through `add_entry`, which rejects a past time on purpose, so the row is
    added in the future and then back-dated in the store. (The plan's own Task 6 tests called
    `add_entry(at_iso=iso(seconds=-30))` directly and could never have passed against the
    implementation on the same page.)
    """
    entry = us.add_entry(kind=us.KIND_PLUGIN, at_iso=iso(hours=1), by="u1", plugin_id=plugin_id, tag=tag)
    back_dated = iso(**(ago or {"seconds": -30}))
    kernel_state.update(
        "update_schedule",
        lambda s: {"entries": [{**e, "at": back_dated} if e["id"] == entry["id"] else e
                               for e in s["entries"]]},
        {"entries": []})
    return entry


def test_add_list_cancel_roundtrip():
    e = us.add_entry(kind=us.KIND_PLUGIN, at_iso=iso(hours=1), by="u1", plugin_id="crm", tag="v1.1.0")
    assert e["status"] == us.PENDING and e["id"].startswith("sched_")
    assert us.list_entries()[0]["id"] == e["id"]
    assert us.cancel(e["id"])["status"] == us.CANCELLED
    assert us.cancel("sched_ghost") is None


def test_cancel_cannot_call_back_an_entry_that_already_left_pending():
    """A running action is already touching the plugin tree — "cancelled" would be a lie."""
    e = due_entry(tag="v1.1.0")
    us.claim_due(iso())
    assert us.cancel(e["id"]) is None
    assert us.list_entries()[0]["status"] == us.RUNNING


def test_add_entry_rejects_past_times():
    with pytest.raises(ValueError):
        us.add_entry(kind=us.KIND_CORE_REMINDER, at_iso=iso(minutes=-5), by="u1")


def test_add_entry_rejects_a_naive_timestamp_and_an_unknown_kind():
    """A naive time is ambiguous by exactly the operator's UTC offset — accepting it schedules the
    update at the wrong hour rather than failing."""
    naive = datetime.now() + timedelta(hours=1)
    with pytest.raises(ValueError):
        us.add_entry(kind=us.KIND_CORE_REMINDER, at_iso=naive.isoformat(), by="u1")
    with pytest.raises(ValueError):
        us.add_entry(kind="reboot-the-building", at_iso=iso(hours=1), by="u1")


def test_claim_due_is_first_come_and_flips_to_running():
    e = due_entry(tag="v1.1.0")
    got = us.claim_due(iso())
    assert got["id"] == e["id"] and got["status"] == us.RUNNING and got["startedAt"]
    assert us.claim_due(iso()) is None                     # nothing left to claim


def test_claim_due_ignores_future_entries_and_drains_the_due_ones_one_at_a_time():
    due_a = due_entry("a", seconds=-60)
    due_b = due_entry("b", seconds=-30)
    us.add_entry(kind=us.KIND_PLUGIN, at_iso=iso(hours=3), by="u1", plugin_id="later", tag="v1.0.0")
    assert us.claim_due(iso())["id"] == due_a["id"]
    assert us.claim_due(iso())["id"] == due_b["id"]
    assert us.claim_due(iso()) is None                     # the future entry is NOT claimed


def test_claim_due_compares_instants_not_strings():
    """The same instant written with a non-UTC offset must still be due. A lexicographic compare of
    the ISO strings gets this wrong — "2026-…T23:00:00+07:00" sorts after a UTC "now" whose clock
    digits are smaller, so the entry would sit unclaimed until its offset happened to line up."""
    at = (datetime.now(timezone.utc) - timedelta(minutes=5)).astimezone(timezone(timedelta(hours=7)))
    e = us.add_entry(kind=us.KIND_PLUGIN, at_iso=iso(hours=1), by="u1", plugin_id="crm", tag="v1.0.0")
    # rewrite the stored `at` to the equivalent +07:00 instant, bypassing add_entry's normalization
    kernel_state.update("update_schedule",
                        lambda s: {"entries": [{**s["entries"][0], "at": at.isoformat()}]},
                        {"entries": []})
    assert us.claim_due(iso())["id"] == e["id"]


def test_finish_and_sweep():
    e = due_entry()
    us.claim_due(iso())
    us.finish(e["id"], us.DONE, "switched")
    assert us.list_entries()[0]["status"] == us.DONE
    e2 = due_entry("x")
    us.claim_due(iso())
    stuck = us.sweep_stuck(iso(minutes=11))
    assert [s["id"] for s in stuck] == [e2["id"]]
    assert us.list_entries()[0]["status"] == us.FAILED


def test_sweep_leaves_a_freshly_claimed_entry_alone():
    """The sweep is crash-recovery, not a timeout on legitimate work — a claim made a moment ago is
    an update in progress, and failing it would let a second runner start the same switch."""
    due_entry()
    us.claim_due(iso())
    assert us.sweep_stuck(iso()) == []
    assert us.list_entries()[0]["status"] == us.RUNNING


def test_a_malformed_row_does_not_break_the_sweep_over_the_others():
    """One corrupt entry must not stop the store from recovering every other stuck claim."""
    good = due_entry()
    us.claim_due(iso())
    kernel_state.update("update_schedule",
                        lambda s: {"entries": [{"id": "sched_bad", "status": us.RUNNING,
                                                "startedAt": "not-a-time"}, *s["entries"]]},
                        {"entries": []})
    assert [s["id"] for s in us.sweep_stuck(iso(minutes=11))] == [good["id"]]
