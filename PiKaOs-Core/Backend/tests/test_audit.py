"""app/core/audit.py — append-only rotating JSONL audit trail (audit-notifications v2 spec §1-§2).

    docker compose exec backend pytest tests/test_audit.py
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.core import audit, kernel_state


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))


def test_log_appends_and_read_returns_newest_first():
    audit.log("u1", "plugin.install", "crm")
    audit.log("u2", "plugin.disable", "crm", {"why": "test"})
    rows = audit.read()
    assert rows[0]["action"] == "plugin.disable" and rows[0]["actor"] == "u2"
    assert rows[1]["target"] == "crm" and rows[0]["detail"] == {"why": "test"}
    assert all(r["at"] for r in rows)


def test_read_filters_by_action_and_actor_and_limit():
    for i in range(5):
        audit.log("u1", "a.one", str(i))
    audit.log("u2", "a.two", "x")
    assert len(audit.read(limit=3)) == 3
    assert all(r["action"] == "a.one" for r in audit.read(action="a.one"))
    assert [r["actor"] for r in audit.read(actor="u2")] == ["u2"]


def test_corrupt_lines_are_skipped_not_fatal():
    audit.log("u1", "ok.line", "t")
    audit._path().write_text(audit._path().read_text(encoding="utf-8") + "{corrupt\n", encoding="utf-8")
    audit.log("u1", "after.corrupt", "t")
    actions = [r["action"] for r in audit.read()]
    assert actions[0] == "after.corrupt" and "ok.line" in actions


def test_rotation_keeps_two_files(monkeypatch):
    monkeypatch.setattr(audit, "MAX_BYTES", 500)
    for i in range(80):
        audit.log("u1", "spam.event", f"t{i}", {"pad": "x" * 40})
    assert audit._path().with_suffix(".jsonl.1").exists()
    assert audit.read(limit=5)                      # still serving after rotation


def test_log_never_raises(monkeypatch):
    monkeypatch.setattr(audit, "_path", lambda: Path("/nonexistent-root/x/audit.jsonl"))
    audit.log("u1", "boom", "t")                    # must swallow, not raise


def test_actor_of_reads_id_or_falls_back():
    class U:
        id = 42
    assert audit.actor_of(U()) == "42"
    assert audit.actor_of(object()) == "unknown"
