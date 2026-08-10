"""Backup routes (backup-restore spec §3). `backups.manage` everywhere — its own authority, split off
`plugins.manage` because "may install a plugin" must not silently mean "may download this server's
entire state and roll it back". Reading a backup is still the read half of a privileged operation.
Nothing here is `ai_safe`: an external AI must not be able to take, download, or roll back the
server's state.

Restore order matters and is not the obvious one: stage-and-validate FIRST, then snapshot, then swap.
Snapshotting before validation litters a recovery point on every typo, and staging touches nothing.
"""
from __future__ import annotations

import logging
import shutil
import subprocess
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel

from .. import audit, backup_service as bs, crypto, notify, update_schedule
from ..config import settings
from ..db import dsn_of
from ..identity import UserLike, require_perm
from ..update_runner import schedule_self_restart

log = logging.getLogger("pikaos.backups")
router = APIRouter(prefix="/api/backups", tags=["backups"])


class RestoreIn(BaseModel):
    confirm: str
    # An archive written under a different secret_key restores ciphertext nobody can decrypt. That is
    # refused by default; an operator who knows the secrets are gone (and will re-enter them) says so.
    acceptKeyChange: bool = False


@router.post("")
async def create(request: Request,
                 user: UserLike = Depends(require_perm("backups.manage"))) -> dict:
    try:
        manifest = bs.create_backup(dsn=dsn_of(request.app.state.container))
    except bs.BackupError as e:
        log.exception("backup failed")
        raise HTTPException(status_code=422, detail="backup failed") from e
    bs.prune(keep=settings.backup_keep)
    audit.log(audit.actor_of(user), "backup.create", manifest["id"], {"bytes": manifest["bytes"]})
    return manifest


@router.get("")
async def list_all(_: UserLike = Depends(require_perm("backups.manage"))) -> list[dict]:
    return bs.list_backups()


@router.get("/{backup_id}/download")
async def download(backup_id: str,
                   user: UserLike = Depends(require_perm("backups.manage"))) -> FileResponse:
    try:
        p = bs.path_of(backup_id)
    except bs.BackupError as e:
        raise HTTPException(status_code=422, detail="invalid backup id") from e
    if not p.exists():
        raise HTTPException(status_code=404, detail="unknown backup")
    audit.log(audit.actor_of(user), "backup.download", backup_id, {})
    return FileResponse(p, media_type="application/gzip", filename=p.name)


@router.delete("/{backup_id}")
async def delete(backup_id: str, user: UserLike = Depends(require_perm("backups.manage"))) -> dict:
    try:
        bs.delete_backup(backup_id)
    except bs.BackupError as e:
        raise HTTPException(status_code=422, detail="invalid backup id") from e
    audit.log(audit.actor_of(user), "backup.delete", backup_id, {})
    return {"ok": True}


def _pg_restore(dsn: str, dump: Path) -> None:
    dsn, env = bs.pg_command_env(dsn)
    result = subprocess.run(["pg_restore", "--clean", "--if-exists", "--dbname", dsn, str(dump)],
                            capture_output=True, text=True, timeout=1200, env=env)
    if result.returncode != 0:
        log.error("pg_restore failed: %s", (result.stderr or "")[:2000])
        raise bs.BackupError("database restore failed")


def _copy_contents(src: Path, dest: Path) -> None:
    """Copy src's tree into dest — CONTENTS ONLY, no metadata.

    `shutil.copytree` copies contents *and* then chowns/chmods each entry, which the dev bind mount
    (a Windows filesystem) refuses with EPERM even though every byte landed. It reports that as a
    failed copy, so the whole restore aborted over permission bits nothing reads: the restored files
    belong to the server process either way. UAT 2026-08-10.
    """
    for path in sorted(src.rglob("*")):
        rel = path.relative_to(src)
        if "__pycache__" in rel.parts or path.suffix == ".pyc":
            continue          # derived, and unwritable often enough to lose a restore over (see above)
        target = dest / rel
        if path.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(path, target)


def _swap_dir(src: Path, dest: Path) -> None:
    """Replace dest's CONTENTS — never dest itself.

    Both destinations are container MOUNT POINTS (`/app/state` = the kernelstate volume,
    `/app/app/plugins` = pluginsdir), and `rmdir` on a mount point is EBUSY, so removing the
    directory and copying a new one in fails on a real server while passing against any tmp dir a
    test can build. UAT 2026-08-10 hit exactly that, after the old state was already gone.
    """
    dest.mkdir(parents=True, exist_ok=True)
    # Copy FIRST, prune second. Deleting first and copying after means a delete that fails halfway
    # leaves the destination destroyed and the restore aborted — UAT hit that too, on a root-owned
    # __pycache__ the server could not unlink. This order degrades to "a stale file survived", which
    # is a nuisance, instead of "the state is gone", which is an outage.
    _copy_contents(src, dest)
    restored = {p.name for p in src.iterdir()} | {"__pycache__"}
    for child in dest.iterdir():
        if child.name in restored:
            continue
        try:
            if child.is_dir() and not child.is_symlink():
                shutil.rmtree(child)
            else:
                child.unlink()
        except OSError:
            log.warning("[backups] could not remove %s during restore — leaving it in place", child)


@router.post("/{backup_id}/restore")
async def restore(backup_id: str, body: RestoreIn, request: Request,
                  user: UserLike = Depends(require_perm("backups.manage"))) -> dict:
    if body.confirm != "RESTORE":
        raise HTTPException(status_code=422, detail="confirmation text does not match")
    try:
        staging, manifest = bs.stage_restore(backup_id)
    except bs.BackupError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    fingerprint = manifest.get("secretFingerprint")     # absent in archives predating the field
    if fingerprint and fingerprint != crypto.secret_fingerprint() and not body.acceptKeyChange:
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(
            status_code=409,
            detail="this backup was written under a different secret_key — its stored credentials "
                   "would restore as undecryptable blobs")
    try:
        from ... import plugin_loader
        # The recovery point, taken AFTER validation and BEFORE the first write. It mirrors what the
        # restore is about to replace — plugins included, and the database too when the incoming
        # archive carries one, because pg_restore --clean destroys the current data outright.
        dsn = dsn_of(request.app.state.container)
        bs.create_backup(prefix="pre-restore", dsn=dsn if manifest.get("hasDb") else None)
        _swap_dir(staging / "state", Path(settings.kernel_state_dir))
        if (staging / "plugins").is_dir():
            _swap_dir(staging / "plugins", Path(plugin_loader.PLUGINS_DIR))
        if manifest.get("hasDb") and dsn:
            _pg_restore(dsn, staging / "db.dump")
    except Exception as e:
        log.exception("restore failed after replacement began — recover from the pre-restore snapshot")
        raise HTTPException(status_code=500,
                            detail="restore failed — a pre-restore snapshot exists in the backups list") from e
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    audit.log(audit.actor_of(user), "backup.restore", backup_id,
              {"coreVersion": manifest.get("coreVersion"), "hasDb": manifest.get("hasDb")})
    log.info("[backups] restored %s — restarting", backup_id)
    schedule_self_restart()
    return {"ok": True, "restarting": True}


class ScheduleBackupIn(BaseModel):
    at: str          # UTC ISO with a timezone — validated in the store, which owns the rule


# Keeps its historical URL under /api/updates (the queue lives there), but lives in THIS file:
# updates.py's rule is "one surface, one authz rule", and this is the one update-adjacent verb
# that answers to backups.manage, not plugins.manage.
schedule_router = APIRouter(prefix="/api/updates", tags=["backups"])


@schedule_router.post("/schedule-backup")
async def schedule_backup(body: ScheduleBackupIn,
                          user: UserLike = Depends(require_perm("backups.manage"))) -> dict:
    """Queue a server backup. Unlike a Core update this IS an action the container can perform on
    itself — it writes an archive to the backups volume and nothing else, so no restart is earned."""
    try:
        entry = update_schedule.add_entry(kind=update_schedule.KIND_BACKUP,
                                          at_iso=body.at, by=audit.actor_of(user))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    audit.log(audit.actor_of(user), "update.schedule", entry["id"], {"kind": entry["kind"]})
    return entry


# --- the backup half of the schedule QUEUE (list/cancel) -------------------------------------------
#
# The queue is one store (`update_schedule`) shared with plugin-update and core-reminder rows, but
# `updates.py`'s own rule is "one surface, one authz rule" — so rather than teach that surface a
# second permission, the backup rows get their OWN read/cancel here, filtered to their own kind.
# `plugins.manage` keeps the full list (Modules screen still needs the non-backup rows) but loses the
# ability to act on a backup row; `backups.manage` gets a full loop over what it itself queued.

@router.get("/schedules")
async def list_backup_schedules(
    _: UserLike = Depends(require_perm("backups.manage")),
) -> list[dict]:
    """Only the backup rows of the shared queue — the Backups schedule tab has no business seeing
    (or leaking) what plugin switch is pending."""
    return [e for e in update_schedule.list_entries() if e.get("kind") == update_schedule.KIND_BACKUP]


@router.delete("/schedules/{sid}")
async def cancel_backup_schedule(
    sid: str,
    user: UserLike = Depends(require_perm("backups.manage")),
) -> dict:
    """Cancel a PENDING backup row — and ONLY a backup row. 404 covers "no such id", "already running
    or finished", AND "that id belongs to some other kind of row": a 403 here would confirm to a
    backups.manage caller that a plugin-update row with that id exists, which is not theirs to know."""
    entry = next((e for e in update_schedule.list_entries() if e["id"] == sid), None)
    if entry is None or entry.get("kind") != update_schedule.KIND_BACKUP:
        raise HTTPException(status_code=404, detail="no pending backup schedule with that id")
    cancelled = update_schedule.cancel(sid)
    if cancelled is None:
        raise HTTPException(status_code=404, detail="no pending backup schedule with that id")
    audit.log(audit.actor_of(user), "update.schedule.cancel", sid, {})
    # No {plugin}/{tag} params: a backup row carries neither, and the shared notif.schedule.cancelled
    # key would render "Scheduled update cancelled: → " for a row that was never an update.
    notify.emit("plugin", "notif.schedule.backupcancelled")
    return cancelled
