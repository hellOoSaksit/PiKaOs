"""/api/backups — create / list / download / restore / delete.

Every test patches `schedule_self_restart`: the real one SIGTERMs PID 1, which inside the test
container is pytest itself.
"""
from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from app.core import kernel_state, setup_state
from app.core.routers import backups as backups_router
from tests.conftest import AUTH_HEADER, bind_identity


@pytest.fixture
def api(tmp_path, monkeypatch):
    """A TestClient whose kernel state AND backups dir are temp — the app is imported only after both
    are redirected, so nothing touches the real volumes."""
    state = tmp_path / "state"; state.mkdir()
    (state / "marker.json").write_text('"old"', encoding="utf-8")
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(state))
    monkeypatch.setattr(kernel_state.settings, "backups_dir", str(tmp_path / "backups"))
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", tmp_path / "plugins")
    (tmp_path / "plugins").mkdir()
    restarted: list[int] = []
    monkeypatch.setattr(backups_router, "schedule_self_restart", lambda: restarted.append(1))
    setup_state.write("PIKA-ABCD-2345", "a-session-token")
    import app.main as main
    with TestClient(main.app) as c:
        c.restarted = restarted
        c.state_dir = state
        yield c


def test_every_route_is_gated(api):
    assert api.get("/api/backups").status_code == 401
    assert api.post("/api/backups").status_code == 401
    # plugins.manage is NO LONGER enough: "may install a plugin" must not mean
    # "may download this server's state and roll it back".
    bind_identity(api, {"plugins.manage"})
    assert api.get("/api/backups", headers=AUTH_HEADER).status_code == 403
    assert api.post("/api/backups", headers=AUTH_HEADER).status_code == 403
    assert api.post("/api/backups/bk_x/restore", json={"confirm": "RESTORE"},
                    headers=AUTH_HEADER).status_code == 403
    bind_identity(api, {"backups.manage"})
    assert api.get("/api/backups", headers=AUTH_HEADER).status_code == 200


def test_create_list_and_download_roundtrip(api):
    made = api.post("/api/backups", headers=AUTH_HEADER)
    assert made.status_code == 200
    bid = made.json()["id"]
    assert [m["id"] for m in api.get("/api/backups", headers=AUTH_HEADER).json()] == [bid]

    got = api.get(f"/api/backups/{bid}/download", headers=AUTH_HEADER)
    assert got.status_code == 200
    assert got.headers["content-type"] == "application/gzip"
    assert got.content[:2] == b"\x1f\x8b"          # a real gzip stream, not a JSON error body


def test_download_and_delete_never_accept_a_path(api):
    """The id is the only thing a client controls, so it is the whole attack surface."""
    for bad in ("..%2f..%2fetc%2fpasswd", "%2e%2e", "bk_x%2Fmanifest.json"):
        assert api.get(f"/api/backups/{bad}/download", headers=AUTH_HEADER).status_code in (404, 422)
        assert api.delete(f"/api/backups/{bad}", headers=AUTH_HEADER).status_code in (404, 422)


def test_delete_is_idempotent(api):
    bid = api.post("/api/backups", headers=AUTH_HEADER).json()["id"]
    assert api.delete(f"/api/backups/{bid}", headers=AUTH_HEADER).status_code == 200
    assert api.delete(f"/api/backups/{bid}", headers=AUTH_HEADER).status_code == 200
    assert api.get("/api/backups", headers=AUTH_HEADER).json() == []


def test_restore_requires_typed_confirm_and_replaces_state(api):
    from app.core import backup_service as bs
    made = api.post("/api/backups", headers=AUTH_HEADER).json()
    api.state_dir.joinpath("marker.json").write_text('"changed-after-backup"', encoding="utf-8")

    bad = api.post(f"/api/backups/{made['id']}/restore", json={"confirm": "nope"}, headers=AUTH_HEADER)
    assert bad.status_code == 422 and api.restarted == []
    assert api.state_dir.joinpath("marker.json").read_text() == '"changed-after-backup"'

    ok = api.post(f"/api/backups/{made['id']}/restore", json={"confirm": "RESTORE"}, headers=AUTH_HEADER)
    assert ok.status_code == 200 and ok.json()["restarting"] is True and api.restarted == [1]
    assert api.state_dir.joinpath("marker.json").read_text() == '"old"'
    # the recovery point (spec §4) — and it is NOT state-only: restore replaces plugins too
    pre = [m for m in bs.list_backups() if m["id"].startswith("pre-restore")]
    assert len(pre) == 1 and pre[0]["stateOnly"] is False


def test_swap_dir_replaces_contents_without_removing_the_destination(tmp_path, monkeypatch):
    """Both destinations are MOUNT POINTS on a real server (`/app/state` = the kernelstate volume),
    and rmdir on a mount is EBUSY — so the swap must empty the directory, never remove and recreate
    it. A tmp dir cannot be a mount, so the mount is simulated where it bites: rmtree ON THE
    DESTINATION ITSELF raises EBUSY, exactly as the kernel does. UAT 2026-08-10 found this the hard
    way, after the old state had already been deleted.
    """
    import shutil as shutil_mod
    src = tmp_path / "src"; src.mkdir()
    (src / "kept.json").write_text("new", encoding="utf-8")
    (src / "sub").mkdir(); (src / "sub" / "deep.json").write_text("new", encoding="utf-8")
    dest = tmp_path / "dest"; dest.mkdir()
    (dest / "stale.json").write_text("old", encoding="utf-8")
    (dest / "staledir").mkdir(); (dest / "staledir" / "x").write_text("old", encoding="utf-8")

    real_rmtree = shutil_mod.rmtree

    def rmtree_guard(path, *a, **kw):
        if Path(path) == dest:
            raise OSError(16, "Device or resource busy")
        return real_rmtree(path, *a, **kw)

    monkeypatch.setattr(backups_router.shutil, "rmtree", rmtree_guard)
    backups_router._swap_dir(src, dest)

    assert sorted(p.name for p in dest.iterdir()) == ["kept.json", "sub"]
    assert (dest / "sub" / "deep.json").read_text() == "new"


def test_swap_dir_finishes_the_restore_even_if_a_leftover_cannot_be_removed(tmp_path, monkeypatch):
    """The order is copy-then-prune for this reason. A root-owned `__pycache__` the server cannot
    unlink (UAT 2026-08-10) must cost a stale directory, not the whole restore — the delete-first
    version aborted with the destination already emptied."""
    src = tmp_path / "src"; src.mkdir()
    (src / "restored.json").write_text("new", encoding="utf-8")
    dest = tmp_path / "dest"; dest.mkdir()
    (dest / "stubborn").mkdir(); (dest / "stubborn" / "x").write_text("root-owned", encoding="utf-8")

    monkeypatch.setattr(backups_router.shutil, "rmtree",
                        lambda *a, **kw: (_ for _ in ()).throw(PermissionError(13, "denied")))
    backups_router._swap_dir(src, dest)

    assert (dest / "restored.json").read_text() == "new"    # the restore still happened
    assert (dest / "stubborn").is_dir()                     # the leftover simply stayed


def test_swap_dir_does_not_need_to_copy_permission_bits(tmp_path, monkeypatch):
    """The dev bind mount is a Windows filesystem and refuses chown/chmod with EPERM even when every
    byte copied. copytree reports that as a failed copy, so the whole restore aborted over permission
    bits nothing reads (UAT 2026-08-10). The restored files belong to the server process regardless."""
    monkeypatch.setattr(backups_router.shutil, "copystat",
                        lambda *a, **kw: (_ for _ in ()).throw(PermissionError(1, "not permitted")))
    monkeypatch.setattr(backups_router.shutil, "chown",
                        lambda *a, **kw: (_ for _ in ()).throw(PermissionError(1, "not permitted")))
    src = tmp_path / "src"; src.mkdir()
    (src / "a").mkdir(); (src / "a" / "deep.json").write_text("new", encoding="utf-8")
    dest = tmp_path / "dest"; dest.mkdir()

    backups_router._swap_dir(src, dest)

    assert (dest / "a" / "deep.json").read_text() == "new"


def test_restore_of_an_unknown_backup_leaves_no_snapshot_behind(api):
    from app.core import backup_service as bs
    r = api.post("/api/backups/bk_nope/restore", json={"confirm": "RESTORE"}, headers=AUTH_HEADER)
    assert r.status_code == 422 and api.restarted == []
    assert bs.list_backups() == []          # validate BEFORE snapshotting, or every typo litters one


def test_restore_refuses_a_backup_written_under_a_different_secret(api, monkeypatch):
    """Ciphertext restores fine and then decrypts to nothing — the operator's git credentials and
    plugin secrets come back as blobs. Fail closed, with an explicit escape hatch."""
    from app.core import crypto
    made = api.post("/api/backups", headers=AUTH_HEADER).json()
    monkeypatch.setattr(crypto.settings, "secret_key", "rotated-" + "x" * 32)

    blocked = api.post(f"/api/backups/{made['id']}/restore", json={"confirm": "RESTORE"},
                       headers=AUTH_HEADER)
    assert blocked.status_code == 409 and api.restarted == []

    forced = api.post(f"/api/backups/{made['id']}/restore",
                      json={"confirm": "RESTORE", "acceptKeyChange": True}, headers=AUTH_HEADER)
    assert forced.status_code == 200 and api.restarted == [1]


def test_schedule_backup_kept_its_url_and_takes_the_new_gate(api):
    """The route moved from updates.py into backups.py (one file, one authz rule) — moving the
    FILE must not move the URL the panel already calls."""
    from datetime import datetime, timedelta, timezone
    at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    bind_identity(api, {"plugins.manage"})
    assert api.post("/api/updates/schedule-backup", json={"at": at},
                    headers=AUTH_HEADER).status_code == 403
    bind_identity(api, {"backups.manage"})
    r = api.post("/api/updates/schedule-backup", json={"at": at}, headers=AUTH_HEADER)
    assert r.status_code == 200
    body = r.json()
    assert body["kind"] == "backup" and body["status"] == "pending"


# --- the schedule QUEUE routes: backups.manage gets its own, plugins.manage loses the backup half ------
#
# `schedule-backup` (above) queues into the SAME store `updates.py`'s queue routes read — the split
# gave Backups its own permission but the queue's list/cancel stayed on plugins.manage, so a
# backups.manage-only role could queue a backup and never see it (403 swallowed client-side), while a
# plugins.manage holder could still list AND CANCEL a queued backup. Both halves are covered here.

def _seed_two_kinds(api):
    """One backup row, one plugin-update row, both PENDING — the minimum fixture to prove each route
    reaches its own kind and refuses the other's."""
    from datetime import datetime, timedelta, timezone

    from app.core import update_schedule as us
    at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    backup_entry = us.add_entry(kind=us.KIND_BACKUP, at_iso=at, by="u1")
    plugin_entry = us.add_entry(kind=us.KIND_PLUGIN, at_iso=at, by="u1", plugin_id="crm", tag="v1.0.0")
    return backup_entry, plugin_entry


def test_backups_schedules_list_returns_only_backup_rows_and_gates_on_backups_manage(api):
    backup_entry, plugin_entry = _seed_two_kinds(api)

    bind_identity(api, {"plugins.manage"})
    assert api.get("/api/backups/schedules", headers=AUTH_HEADER).status_code == 403

    bind_identity(api, {"backups.manage"})
    listed = api.get("/api/backups/schedules", headers=AUTH_HEADER).json()
    assert [e["id"] for e in listed] == [backup_entry["id"]]


def test_backups_schedules_cancel_only_touches_a_backup_row(api):
    from app.core import update_schedule as us
    backup_entry, plugin_entry = _seed_two_kinds(api)

    bind_identity(api, {"plugins.manage"})
    assert api.delete(f"/api/backups/schedules/{backup_entry['id']}",
                      headers=AUTH_HEADER).status_code == 403

    bind_identity(api, {"backups.manage"})
    # a plugin-update row's id must not be reachable through the backups cancel route — 404, not 403,
    # so the route never confirms someone else's row exists
    not_found = api.delete(f"/api/backups/schedules/{plugin_entry['id']}", headers=AUTH_HEADER)
    assert not_found.status_code == 404
    still_pending = [e for e in us.list_entries() if e["id"] == plugin_entry["id"]][0]
    assert still_pending["status"] == us.PENDING

    ok = api.delete(f"/api/backups/schedules/{backup_entry['id']}", headers=AUTH_HEADER)
    assert ok.status_code == 200 and ok.json()["status"] == "cancelled"


def test_updates_schedules_cancel_refuses_a_backup_row(api):
    """The other half of the fix: plugins.manage loses the ability to cancel a backup it never
    queued and cannot see through /api/backups."""
    from app.core import update_schedule as us
    backup_entry, _plugin_entry = _seed_two_kinds(api)

    bind_identity(api, {"plugins.manage"})
    r = api.delete(f"/api/updates/schedules/{backup_entry['id']}", headers=AUTH_HEADER)
    assert r.status_code == 404
    still_pending = [e for e in us.list_entries() if e["id"] == backup_entry["id"]][0]
    assert still_pending["status"] == us.PENDING
