"""app/core/backup_service.py — tarball backups of state+plugins(+pg dump) with retention."""
from __future__ import annotations

import tarfile
from pathlib import Path

import pytest

from app.core import backup_service as bs
from app.core import kernel_state


@pytest.fixture(autouse=True)
def _isolate(monkeypatch, tmp_path):
    state = tmp_path / "state"; state.mkdir()
    (state / "plugin_registry.json").write_text('{"crm": {"state": "enabled"}}', encoding="utf-8")
    plugins = tmp_path / "plugins"; plugins.mkdir()
    (plugins / "crm").mkdir(); (plugins / "crm" / "manifest.json").write_text("{}", encoding="utf-8")
    backups = tmp_path / "backups"
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(state))
    monkeypatch.setattr(kernel_state.settings, "backups_dir", str(backups))
    monkeypatch.setattr("app.plugin_loader.PLUGINS_DIR", plugins)


def test_create_backup_bundles_state_plugins_and_manifest():
    m = bs.create_backup()
    assert m["id"].startswith("bk_") and m["hasDb"] is False and m["bytes"] > 0
    with tarfile.open(bs.path_of(m["id"])) as tf:
        names = tf.getnames()
    assert "manifest.json" in names
    assert any(n.startswith("state/") for n in names)
    assert any(n.startswith("plugins/crm") for n in names)
    assert bs.list_backups()[0]["id"] == m["id"]


def test_state_only_backup_skips_plugins():
    m = bs.create_backup(prefix="pre-switch-crm", state_only=True)
    with tarfile.open(bs.path_of(m["id"])) as tf:
        assert not any(n.startswith("plugins/") for n in tf.getnames())
    assert m["stateOnly"] is True


def test_delete_is_idempotent_and_ids_are_validated():
    m = bs.create_backup()
    assert bs.delete_backup(m["id"]) is True
    assert bs.delete_backup(m["id"]) is False
    with pytest.raises(bs.BackupError):
        bs.path_of("../../etc/passwd")


def test_prune_keeps_newest_and_protects_pre_restore():
    ids = [bs.create_backup()["id"] for _ in range(4)]
    pre = bs.create_backup(prefix="pre-restore")["id"]
    deleted = bs.prune(keep=2)
    remaining = {m["id"] for m in bs.list_backups()}
    assert pre in remaining                      # pre-restore-* < 24h protected
    assert ids[-1] in remaining and ids[-2] in remaining
    assert set(deleted) == set(ids[:2])


def test_stage_restore_validates_and_rejects_newer_core(monkeypatch):
    m = bs.create_backup()
    staging, manifest = bs.stage_restore(m["id"])
    assert (staging / "state" / "plugin_registry.json").exists()
    monkeypatch.setattr(bs, "_running_core_version", lambda: "0.0.1")   # backup was made on a newer core
    with pytest.raises(bs.BackupError):
        bs.stage_restore(m["id"])
    with pytest.raises(bs.BackupError):
        bs.stage_restore("bk_does_not_exist")


def test_archive_holds_only_state_plugins_and_manifest(tmp_path):
    """The download route hands this archive to an operator, and that is only survivable because the
    Fernet key lives in Backend/.env — NOT in the state dir — so every secret inside is ciphertext.
    The day someone "also backs up the config", download starts serving plaintext-equivalent. Pin it:
    a .env sitting beside the backed-up directories must never be swept in, and no member may escape
    the three known roots."""
    (tmp_path / ".env").write_text("SECRET_KEY=super-secret\n", encoding="utf-8")  # sibling of state/
    m = bs.create_backup()
    with tarfile.open(bs.path_of(m["id"])) as tf:
        names = tf.getnames()
    assert not any(Path(n).name == ".env" for n in names)
    assert all(n == "manifest.json" or n.split("/")[0] in ("state", "plugins", "db.dump")
               for n in names), names


def test_pg_command_env_strips_the_driver_and_hides_the_password():
    """The app DSN is SQLAlchemy's (`postgresql+asyncpg://`), which libpq rejects outright — and the
    password must reach the child through the environment, never argv, where every process can read it."""
    dsn, env = bs.pg_command_env("postgresql+asyncpg://u:p%40ss@db:5432/pikaos")
    assert dsn == "postgresql://u@db:5432/pikaos"
    assert env["PGPASSWORD"] == "p@ss"

    plain, env2 = bs.pg_command_env("postgresql://u@db:5432/pikaos")
    assert plain == "postgresql://u@db:5432/pikaos" and "PGPASSWORD" not in env2


def test_manifest_records_a_secret_fingerprint_that_is_not_the_key(monkeypatch):
    """Restoring into a server whose secret_key differs returns secrets nobody can decrypt — silently,
    because the ciphertext restores fine. The manifest carries a fingerprint so the restore gate can
    see it coming. It must not be the Fernet key material itself (that is sha256 of the same secret)."""
    from app.core import crypto
    monkeypatch.setattr(crypto.settings, "secret_key", "k" * 40)
    m = bs.create_backup()
    fp = m["secretFingerprint"]
    assert fp and "k" * 40 not in fp
    import base64, hashlib
    fernet_key = base64.urlsafe_b64encode(hashlib.sha256(("k" * 40).encode()).digest()).decode()
    assert fp not in fernet_key and hashlib.sha256(("k" * 40).encode()).hexdigest()[:len(fp)] != fp

    _, manifest = bs.stage_restore(m["id"])
    assert manifest["secretFingerprint"] == crypto.secret_fingerprint()
    monkeypatch.setattr(crypto.settings, "secret_key", "j" * 40)
    assert manifest["secretFingerprint"] != crypto.secret_fingerprint()   # the gate Task 3 enforces
