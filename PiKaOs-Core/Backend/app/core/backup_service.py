"""Backups (backup-restore spec §2-§3): tar.gz of the kernel state dir + PLUGINS_DIR (+ a pg_dump
when a DSN is provided), stored in the backups volume with a manifest, retention-pruned. Ids are
server-generated and path-validated — a client can never name a filesystem path.

What goes IN the archive is a security boundary, not a convenience: `Backend/.env` holds the secret
every stored credential is encrypted with (see `crypto._secret_material`), so as long as it stays out,
an archive carries ciphertext only — which is the sole reason the download route can hand one to an
operator at all. Nothing here may ever widen the archive to config files.
"""
from __future__ import annotations

import io
import json
import os
import re
import shutil
import subprocess
import tarfile
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit

from .config import settings
from .crypto import secret_fingerprint

_ID_RE = re.compile(r"^[A-Za-z0-9_.-]+$")


class BackupError(Exception):
    """A backup step failed — routers turn this into a generic 4xx (rule 10)."""


def _running_core_version() -> str:
    return settings.app_version


def _dir() -> Path:
    p = Path(settings.backups_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p


def path_of(backup_id: str) -> Path:
    if not _ID_RE.match(backup_id or ""):
        raise BackupError("invalid backup id")
    return _dir() / f"{backup_id}.tar.gz"


def _manifest_path(backup_id: str) -> Path:
    """The manifest sidecar beside the archive. The listing is built from these files rather than from
    one shared index: the scheduled runner and the API are different processes, so a single index file
    would need the flock dance kernel_state does — and a lost index row makes a real archive invisible
    forever. A sidecar per backup cannot race, and the pair is self-healing (either file missing = not
    a backup)."""
    return _dir() / f"{backup_id}.json"


def _plugins_dir() -> Path:
    from .. import plugin_loader
    return Path(plugin_loader.PLUGINS_DIR)


def pg_command_env(dsn: str) -> tuple[str, dict]:
    """`(dsn, env)` for a pg_dump/pg_restore subprocess.

    Two transformations, both load-bearing: the password moves into PGPASSWORD so it never appears in
    argv (visible to every process on the host), and SQLAlchemy's driver suffix is stripped —
    `postgresql+asyncpg://` is a valid app DSN and a URI libpq flatly rejects.
    """
    parts = urlsplit(dsn)
    env = {**os.environ}
    scheme = parts.scheme.split("+", 1)[0] or "postgresql"
    netloc = parts.netloc
    if parts.password:
        # PGPASSWORD is a raw value, the URI field is percent-encoded — a password holding `@` or `/`
        # MUST be escaped in the DSN and unescaped here, or libpq authenticates with the wrong string.
        # The username stays encoded: it goes back into a URI, which libpq decodes itself.
        env["PGPASSWORD"] = unquote(parts.password)
        netloc = parts.hostname or ""
        if parts.username:
            netloc = f"{parts.username}@{netloc}"
        if parts.port:
            netloc = f"{netloc}:{parts.port}"
    return urlunsplit((scheme, netloc, parts.path, parts.query, "")), env


def _pg_dump(dsn: str, out: Path) -> None:
    """Custom-format dump; password via PGPASSWORD, never argv (spec §3)."""
    dsn, env = pg_command_env(dsn)
    result = subprocess.run(["pg_dump", "--format=custom", f"--file={out}", "--dbname", dsn],
                            capture_output=True, text=True, timeout=600, env=env)
    if result.returncode != 0:
        raise BackupError("database dump failed")      # detail stays in server logs via caller


def create_backup(*, prefix: str = "bk", state_only: bool = False, dsn: str | None = None) -> dict:
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%f")
    backup_id = f"{prefix}_{ts}"
    target = path_of(backup_id)
    manifest = {"id": backup_id, "createdAt": datetime.now(timezone.utc).isoformat(),
                "coreVersion": _running_core_version(), "stateOnly": state_only,
                # which secret the ciphertext inside was written under — the restore gate compares it
                "secretFingerprint": secret_fingerprint(),
                "hasDb": False, "files": []}
    try:
        with tempfile.TemporaryDirectory(prefix="pikaos-backup-") as tmp:
            db_dump = Path(tmp) / "db.dump"
            if dsn and not state_only:
                _pg_dump(dsn, db_dump)
                manifest["hasDb"] = True
            with tarfile.open(target, "w:gz") as tf:
                state_dir = Path(settings.kernel_state_dir)
                if state_dir.is_dir():
                    tf.add(state_dir, arcname="state")
                    manifest["files"].append("state/")
                if not state_only and _plugins_dir().is_dir():
                    tf.add(_plugins_dir(), arcname="plugins")
                    manifest["files"].append("plugins/")
                if manifest["hasDb"]:
                    tf.add(db_dump, arcname="db.dump")
                    manifest["files"].append("db.dump")
                blob = json.dumps(manifest).encode("utf-8")
                info = tarfile.TarInfo("manifest.json")
                info.size = len(blob)
                tf.addfile(info, io.BytesIO(blob))
        manifest["bytes"] = target.stat().st_size
        _manifest_path(backup_id).write_text(json.dumps(manifest), encoding="utf-8")
        return manifest
    except Exception:
        target.unlink(missing_ok=True)                 # never a corrupt archive in the list (spec §4)
        _manifest_path(backup_id).unlink(missing_ok=True)
        raise


def list_backups() -> list[dict]:
    """Manifests, newest first. Built from the sidecars on disk, so an archive deleted by hand on the
    host simply drops out of the list instead of 404-ing later."""
    out: list[dict] = []
    for sidecar in _dir().glob("*.json"):
        try:
            m = json.loads(sidecar.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if isinstance(m, dict) and m.get("id") == sidecar.stem and path_of(m["id"]).exists():
            out.append(m)
    return sorted(out, key=lambda m: (m.get("createdAt", ""), m["id"]), reverse=True)


def delete_backup(backup_id: str) -> bool:
    """Idempotent; False = it wasn't there."""
    p = path_of(backup_id)
    existed = p.exists()
    p.unlink(missing_ok=True)
    _manifest_path(backup_id).unlink(missing_ok=True)
    return existed


def prune(keep: int) -> list[str]:
    """Delete the oldest beyond `keep`, protecting the newest entry and any pre-restore-* younger
    than 24 h (spec §4)."""
    entries = list_backups()                            # newest first
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
    deletable = [e for i, e in enumerate(entries)
                 if i > 0 and not (e["id"].startswith("pre-restore") and e["createdAt"] > cutoff)]
    doomed = deletable[keep:]          # keep the newest `keep` non-protected entries
    for e in doomed:
        delete_backup(e["id"])
    return [e["id"] for e in doomed]


def stage_restore(backup_id: str) -> tuple[Path, dict]:
    """Safe-extract to a temp dir and validate the manifest — the caller swaps the staged dirs in.

    Fail-closed on a backup from a NEWER Core: its state may carry keys/shapes this build has never
    seen, and a downgrade-by-restore is silent."""
    p = path_of(backup_id)
    if not p.exists():
        raise BackupError("unknown backup")
    staging = Path(tempfile.mkdtemp(prefix="pikaos-restore-"))
    try:
        with tarfile.open(p) as tf:
            tf.extractall(staging, filter="data")        # py3.12 safe-extraction (no traversal/links)
        manifest = json.loads((staging / "manifest.json").read_text(encoding="utf-8"))
        from ..plugin_loader import _parse                # the kernel's semver parse — one dialect
        if _parse(manifest.get("coreVersion", "0.0.0")) > _parse(_running_core_version()):
            raise BackupError("backup was made on a newer Core than this server runs")
        if not (staging / "state").is_dir():
            raise BackupError("backup archive is missing its state directory")
        return staging, manifest
    except Exception:
        shutil.rmtree(staging, ignore_errors=True)
        raise
