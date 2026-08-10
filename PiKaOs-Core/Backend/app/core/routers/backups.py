"""Backup routes (backup-restore spec §3). `plugins.manage` everywhere — the archive IS the server's
state, so reading one is the read half of a privileged operation, exactly like the update surface it
sits beside. Nothing here is `ai_safe`: an external AI must not be able to take, download, or roll
back the server's state.

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

from .. import audit, backup_service as bs, crypto
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
                 user: UserLike = Depends(require_perm("plugins.manage"))) -> dict:
    try:
        manifest = bs.create_backup(dsn=dsn_of(request))
    except bs.BackupError as e:
        log.exception("backup failed")
        raise HTTPException(status_code=422, detail="backup failed") from e
    bs.prune(keep=settings.backup_keep)
    audit.log(audit.actor_of(user), "backup.create", manifest["id"], {"bytes": manifest["bytes"]})
    return manifest


@router.get("")
async def list_all(_: UserLike = Depends(require_perm("plugins.manage"))) -> list[dict]:
    return bs.list_backups()


@router.get("/{backup_id}/download")
async def download(backup_id: str,
                   user: UserLike = Depends(require_perm("plugins.manage"))) -> FileResponse:
    try:
        p = bs.path_of(backup_id)
    except bs.BackupError as e:
        raise HTTPException(status_code=422, detail="invalid backup id") from e
    if not p.exists():
        raise HTTPException(status_code=404, detail="unknown backup")
    audit.log(audit.actor_of(user), "backup.download", backup_id, {})
    return FileResponse(p, media_type="application/gzip", filename=p.name)


@router.delete("/{backup_id}")
async def delete(backup_id: str, user: UserLike = Depends(require_perm("plugins.manage"))) -> dict:
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


def _swap_dir(src: Path, dest: Path) -> None:
    if dest.exists():
        shutil.rmtree(dest)
    shutil.copytree(src, dest)


@router.post("/{backup_id}/restore")
async def restore(backup_id: str, body: RestoreIn, request: Request,
                  user: UserLike = Depends(require_perm("plugins.manage"))) -> dict:
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
        dsn = dsn_of(request)
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
