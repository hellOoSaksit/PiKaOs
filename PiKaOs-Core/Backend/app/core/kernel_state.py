"""Kernel local-JSON state — the zero-datastore kernel's own persistence.

The kernel keeps NO database tables of its own (that would make it depend on Postgres just to boot). Its
state — the plugin install registry, the shared nav/global config, per-user prefs — lives as JSON files
under `KERNEL_STATE_DIR`, a persistent volume shared by the backend + worker (both read the registry).

Writes are atomic (temp file + `os.replace`) under a process-local lock, so a crash mid-write never
truncates the live file and concurrent writers in one process serialize. Cross-process writes are
last-write-wins — the functional model accepts it (writes are rare: an install click, a nav edit). Sync on
purpose: `scripts/compute_enabled` reads the registry before any event loop exists, and the JSON blobs are
tiny, so async handlers can call this directly.
"""
from __future__ import annotations

import json
import os
import threading
from typing import Any

from .config import settings

_lock = threading.Lock()


def _path(name: str) -> str:
    return os.path.join(settings.kernel_state_dir, f"{name}.json")


def read_json(name: str, default: Any) -> Any:
    """The parsed JSON for `<KERNEL_STATE_DIR>/<name>.json`, or `default` if absent/unreadable. Never
    raises — a missing or corrupt state file must not block boot (the caller's default stands)."""
    try:
        with open(_path(name), encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError, OSError):
        return default


def write_json(name: str, value: Any) -> None:
    """Atomically overwrite `<name>.json` with `value` (write a temp file, then `os.replace` it over the
    target — atomic on the same filesystem). Serialized per process by `_lock`."""
    os.makedirs(settings.kernel_state_dir, exist_ok=True)
    with _lock:
        tmp = _path(name) + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(value, f, ensure_ascii=False, indent=2, default=str)
        os.replace(tmp, _path(name))
