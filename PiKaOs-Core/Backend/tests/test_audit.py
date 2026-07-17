"""app/core/audit.py — append-only rotating JSONL audit trail (audit-notifications v2 spec §1-§2).

    docker compose exec backend pytest tests/test_audit.py
"""
from __future__ import annotations

from pathlib import Path

import pytest

from app.core import audit, kernel_state
from tests.conftest import AUTH_HEADER, bind_identity


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


def test_a_truncated_multibyte_write_does_not_kill_the_reader():
    """The corruption that actually happens is a half-written UTF-8 sequence, not `{corrupt`.

    An append cut short by a crash or a full disk leaves a partial multi-byte character — and this
    trail writes Thai targets with ensure_ascii=False, so multi-byte is the norm, not an edge case.
    Strict decoding made GET /api/audit 500 forever, recoverable only by hand-editing the file, which
    contradicts the spec's "the trail keeps serving". The test above cannot catch this: `{corrupt` is
    perfectly valid UTF-8, so it only ever exercised the json.loads skip.
    """
    audit.log("u1", "before.truncation", "t")
    with audit._path().open("ab") as f:
        f.write(b'{"at":"2026-01-01","actor":"u","action":"a","target":"\xe0\xb8')   # cut mid-character
        f.write(b"\n")
    audit.log("u1", "after.truncation", "t")

    actions = [r["action"] for r in audit.read()]          # must not raise UnicodeDecodeError
    assert actions[0] == "after.truncation"
    assert "before.truncation" in actions                  # history before the bad byte still serves


def test_rotation_keeps_two_files(monkeypatch):
    monkeypatch.setattr(audit, "MAX_BYTES", 500)
    for i in range(80):
        audit.log("u1", "spam.event", f"t{i}", {"pad": "x" * 40})
    assert audit._path().with_suffix(".jsonl.1").exists()
    assert audit.read(limit=5)                      # still serving after rotation


def test_oversized_target_cannot_push_history_out_of_the_trail():
    """An oversized field must not become a history-wiping tool.

    Rotation keeps exactly one predecessor, so a caller able to write huge entries can erase the whole
    trail in three writes: one to overflow, one to rotate real history into `.jsonl.1`, one to overwrite
    it. That was reachable ANONYMOUSLY — the auth plugin audits failed logins with the submitted
    username. Clipping at the sink is what makes the trail's retention independent of its callers.
    """
    audit.log("admin-42", "plugin.install", "crm")           # real history a wiper would target
    for _ in range(3):
        audit.log("anonymous", "auth.login.failed", "A" * (6 * 1024 * 1024))

    rows = audit.read(limit=999)
    assert any(r["action"] == "plugin.install" for r in rows), "history was wiped by oversized entries"
    assert all(len(r["target"]) <= audit.MAX_FIELD_CHARS + 1 for r in rows)   # +1 for the … marker


def test_oversized_detail_is_replaced_wholesale_and_stays_valid_json():
    audit.log("u1", "big.detail", "t", {"blob": "x" * (audit.MAX_DETAIL_CHARS + 500)})
    row = audit.read(limit=1)[0]
    assert row["detail"]["clipped"] is True          # replaced, not half-serialized into broken JSON
    assert "blob" not in row["detail"]


def test_log_never_raises(monkeypatch):
    monkeypatch.setattr(audit, "_path", lambda: Path("/nonexistent-root/x/audit.jsonl"))
    audit.log("u1", "boom", "t")                    # must swallow, not raise


def test_actor_of_reads_id_or_falls_back():
    class U:
        id = 42
    assert audit.actor_of(U()) == "42"
    assert audit.actor_of(object()) == "unknown"


# --- route: GET /api/audit is authenticated + gated on audit.view --------------------------------

def test_audit_route_requires_authentication(client):
    assert client.get("/api/audit").status_code == 401


def test_audit_route_is_forbidden_without_audit_view(client):
    bind_identity(client, perms=set())
    assert client.get("/api/audit", headers=AUTH_HEADER).status_code == 403


def test_audit_route_returns_rows_with_audit_view_and_respects_filters(client):
    bind_identity(client, perms={"audit.view"})
    audit.log("u1", "plugin.install", "crm")
    audit.log("u2", "plugin.disable", "crm")
    rows = client.get("/api/audit", headers=AUTH_HEADER).json()
    assert [r["action"] for r in rows] == ["plugin.disable", "plugin.install"]
    only = client.get("/api/audit?actor=u2&limit=1", headers=AUTH_HEADER).json()
    assert len(only) == 1 and only[0]["actor"] == "u2"


# --- secrets canary: drive the instrumented routes that take a secret-shaped input, then grep the -----
#     WHOLE trail for it. This is the defense-in-depth the security doc used to *claim* existed. There is
#     no sink-side redaction — the guarantee is "every call site passes safe values by hand" — so this is
#     what actually holds that convention to account. A new emit that leaks its secret fails HERE.
#
#     Extend this table when you instrument a new route that receives a credential / value / URL. Each
#     entry drives the real route with a unique sentinel; the single assertion below proves none reached
#     the trail. Routes needing a live clone (plugin.install_git) are covered by reading the call site —
#     it logs pid + tag, deliberately never body.repoUrl — not by this canary.
def test_secrets_canary_no_instrumented_route_leaks_its_secret(client):
    import json as _json

    # (label, request, sentinel that must NOT reach the trail)
    cases = [
        ("git credential token",
         lambda: client.put("/api/plugins/git-credentials/github.com",
                            json={"token": "CANARY-GITTOKEN-a1"}, headers=AUTH_HEADER),
         "CANARY-GITTOKEN-a1"),
        ("nav settings value",
         lambda: client.put("/api/settings/nav",
                            json={"value": [{"id": "CANARY-NAVVALUE-b2"}]}, headers=AUTH_HEADER),
         "CANARY-NAVVALUE-b2"),
    ]
    for label, drive, _sentinel in cases:
        assert drive().status_code == 200, f"{label}: route did not accept the request"

    trail = _json.dumps(audit.read(limit=999))
    for label, _drive, sentinel in cases:
        assert sentinel not in trail, f"{label}: a secret reached the audit trail"
    # sanity: the routes really did write their (safe) audit lines, so the grep above wasn't vacuous
    actions = {r["action"] for r in audit.read(limit=999)}
    assert {"gitcred.set", "settings.write"} <= actions
