"""app/core/update_runner.py — firing policy, missed window, and the restart rule (spec §6.3)."""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.core import kernel_state, update_runner
from app.core import update_schedule as us


@pytest.fixture(autouse=True)
def _isolate_kernel_state(monkeypatch, tmp_path):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))


def iso(**delta): return (datetime.now(timezone.utc) + timedelta(**delta)).isoformat()


def due_entry(plugin_id="crm", tag="v1.0.0", **ago):
    """A PENDING row whose time has passed. `add_entry` refuses a past time on purpose, so queue it in
    the future and back-date the stored row (see test_update_schedule.due_entry)."""
    entry = us.add_entry(kind=us.KIND_PLUGIN, at_iso=iso(hours=1), by="u1", plugin_id=plugin_id, tag=tag)
    at = iso(**(ago or {"seconds": -30}))
    kernel_state.update("update_schedule",
                        lambda s: {"entries": [{**e, "at": at} if e["id"] == entry["id"] else e
                                               for e in s["entries"]]},
                        {"entries": []})
    return {**entry, "at": at}


def test_fire_marks_overdue_entries_missed(monkeypatch):
    """Past the grace window the server was demonstrably down over the scheduled hour. Applying it
    late would switch a plugin version at an arbitrary moment nobody chose."""
    monkeypatch.setattr(update_runner, "_perform_switch",
                        lambda *a: pytest.fail("an overdue entry must not switch anything"))
    entry = {"id": "s1", "kind": us.KIND_PLUGIN, "pluginId": "crm", "tag": "v1.0.0",
             "at": iso(minutes=-30), "startedAt": iso()}
    status, _ = update_runner.fire_entry(entry)
    assert status == us.MISSED


def test_fire_still_runs_an_entry_inside_the_grace_window(monkeypatch):
    """The boundary matters in the other direction too: a tick delayed by a few minutes (a slow
    restart, a busy host) must still apply the update rather than silently dropping it."""
    ran = []
    monkeypatch.setattr(update_runner, "_perform_switch", lambda *a: ran.append(a))
    entry = {"id": "s1", "kind": us.KIND_PLUGIN, "pluginId": "crm", "tag": "v1.0.0",
             "at": iso(minutes=-(update_runner.GRACE_MINUTES - 1)), "by": "u1", "startedAt": iso()}
    assert update_runner.fire_entry(entry)[0] == us.DONE
    assert len(ran) == 1


def test_fire_runs_the_switch_and_reports_done(monkeypatch):
    calls = {}
    monkeypatch.setattr(update_runner, "_perform_switch",
                        lambda pid, tag, by: calls.setdefault("args", (pid, tag, by)))
    entry = {"id": "s1", "kind": us.KIND_PLUGIN, "pluginId": "crm", "tag": "v1.1.0",
             "at": iso(minutes=-1), "by": "u1", "startedAt": iso()}
    status, _ = update_runner.fire_entry(entry)
    assert status == us.DONE and calls["args"] == ("crm", "v1.1.0", "u1")


def test_fire_reports_failed_when_the_switch_raises(monkeypatch):
    def boom(pid, tag, by): raise RuntimeError("gate said no: /srv/secret/path")
    monkeypatch.setattr(update_runner, "_perform_switch", boom)
    entry = {"id": "s1", "kind": us.KIND_PLUGIN, "pluginId": "crm", "tag": "v1.0.0",
             "at": iso(minutes=-1), "by": "u1", "startedAt": iso()}
    status, note = update_runner.fire_entry(entry)
    assert status == us.FAILED
    # the note is rendered in the operator's UI — raw exception text stays in the server log (rule 10)
    assert "gate said no" not in note and "/srv/secret/path" not in note


def test_fire_never_raises_even_on_an_unreadable_time():
    """The caller has already flipped the row to RUNNING, so an escaping exception would strand it
    there until a sweep — every path must return a terminal status instead."""
    status, _ = update_runner.fire_entry({"id": "s1", "kind": us.KIND_PLUGIN, "at": "not-a-time"})
    assert status == us.FAILED


def test_core_reminder_fires_done_without_switching(monkeypatch):
    monkeypatch.setattr(update_runner, "_perform_switch",
                        lambda *a: pytest.fail("a reminder must not switch anything"))
    entry = {"id": "s1", "kind": us.KIND_CORE_REMINDER, "at": iso(minutes=-1), "startedAt": iso()}
    assert update_runner.fire_entry(entry)[0] == us.DONE


async def _drain(restarts, *, until, timeout=5.0):
    """Run the loop at a fast tick until `until()` or the timeout — polling instead of sleeping a
    fixed span keeps the test off a wall-clock race on a slow host."""
    stop = asyncio.Event()
    task = asyncio.create_task(update_runner.runner_loop(
        stop, tick_seconds=0.02, restart=lambda: restarts.append(1)))
    deadline = asyncio.get_running_loop().time() + timeout
    while not until() and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(0.02)
    stop.set()
    await task


def test_restart_is_scheduled_after_a_done_plugin_update(monkeypatch):
    monkeypatch.setattr(update_runner, "_perform_switch", lambda *a: None)
    due_entry()
    restarts = []
    asyncio.run(_drain(restarts, until=lambda: us.list_entries()[0]["status"] == us.DONE))
    assert us.list_entries()[0]["status"] == us.DONE
    assert restarts == [1]


def test_no_restart_for_a_missed_or_failed_entry(monkeypatch):
    """Nothing was committed to disk, so a restart would be an outage with no cause behind it."""
    def boom(*a): raise RuntimeError("nope")
    monkeypatch.setattr(update_runner, "_perform_switch", boom)
    due_entry("failing")
    due_entry("overdue", minutes=-90)
    restarts = []
    asyncio.run(_drain(restarts, until=lambda: all(
        e["status"] in (us.FAILED, us.MISSED) for e in us.list_entries())))
    assert {e["status"] for e in us.list_entries()} == {us.FAILED, us.MISSED}
    assert restarts == []


def test_a_failing_tick_does_not_kill_the_loop(monkeypatch):
    """One bad entry must not stop every later schedule from ever firing."""
    monkeypatch.setattr(update_runner, "_perform_switch", lambda *a: None)
    calls = {"n": 0}
    real_claim = us.claim_due

    def flaky(now_iso):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("transient store failure")
        return real_claim(now_iso)

    monkeypatch.setattr(us, "claim_due", flaky)
    due_entry()
    restarts = []
    asyncio.run(_drain(restarts, until=lambda: us.list_entries()[0]["status"] == us.DONE))
    assert us.list_entries()[0]["status"] == us.DONE   # fired on a LATER tick, after the raise
    assert calls["n"] > 1
