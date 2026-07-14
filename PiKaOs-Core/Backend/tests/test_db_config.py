"""app/core/db_config.py — the operator's system-DB DSN, encrypted at rest in the shared
`app_settings` kernel-state blob (auth-install Step 1: DB choice). Mirrors git_installer's
`set_credential` pattern: encrypt on save, decrypt on read, never plaintext on disk.

    docker compose exec backend pytest tests/test_db_config.py -v
"""
from __future__ import annotations

from app.core import db_config, kernel_state


def test_save_then_read_roundtrips_the_dsn(tmp_state):
    db_config.save("pg", "postgresql+asyncpg://u:p@h:5432/db")
    assert db_config.read_dsn() == "postgresql+asyncpg://u:p@h:5432/db"
    assert db_config.is_configured() is True


def test_read_dsn_is_none_when_unconfigured(tmp_state):
    assert db_config.read_dsn() is None
    assert db_config.is_configured() is False


def test_stored_dsn_is_ciphertext_not_plaintext(tmp_state):
    db_config.save("pg", "postgresql+asyncpg://u:secretpw@h:5432/db")
    blob = kernel_state.read_json("app_settings", {})
    assert "secretpw" not in str(blob)          # encrypted at rest
