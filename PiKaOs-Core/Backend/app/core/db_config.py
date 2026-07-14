"""The system-DB connection chosen at install (Step 1). Encrypted DSN in the shared
`app_settings` kernel-state blob — mirrors git_installer.set_credential. Read before any DB
exists (zero-datastore), so the postgres tool can source its engine from the operator's choice."""
from __future__ import annotations
from datetime import datetime, timezone

from . import kernel_state
from .crypto import decrypt, encrypt

_APP = "app_settings"
RESERVED_KEY = "db_config"      # joins RESERVED_SETTINGS_KEYS in git_installer.py


def _value() -> dict | None:
    entry = kernel_state.read_json(_APP, {}).get(RESERVED_KEY)
    return entry.get("value") if isinstance(entry, dict) else None


def save(provider: str, dsn: str) -> None:
    store = kernel_state.read_json(_APP, {})
    store[RESERVED_KEY] = {"value": {
        "provider": provider,
        "dsn": encrypt(dsn),
        "configured_at": datetime.now(timezone.utc).isoformat(),
    }}
    kernel_state.write_json(_APP, store)


def read_dsn() -> str | None:
    value = _value()
    if not value or not value.get("dsn"):
        return None
    return decrypt(value["dsn"]) or None      # decrypt() returns "" on a bad/rotated token → None


def is_configured() -> bool:
    return _value() is not None
