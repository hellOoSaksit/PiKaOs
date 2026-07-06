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


def _write_locked(name: str, value: Any) -> None:
    """Atomic overwrite (temp file + `os.replace`). Caller holds `_lock`."""
    tmp = _path(name) + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2, default=str)
    os.replace(tmp, _path(name))


def write_json(name: str, value: Any) -> None:
    """Atomically overwrite `<name>.json` with `value` (write a temp file, then `os.replace` it over the
    target — atomic on the same filesystem). Serialized per process by `_lock`. Use `update()` instead for
    a read-modify-write that must be safe across processes."""
    os.makedirs(settings.kernel_state_dir, exist_ok=True)
    with _lock:
        _write_locked(name, value)


def update(name: str, mutate, default: Any) -> Any:
    """Cross-process-atomic read-modify-write of `<name>.json`. Holds an exclusive `flock` over a sidecar
    lock file for the whole read → `mutate(current)` → write, so two uvicorn workers — or the web + worker
    containers sharing the state volume — can't lose a write (K2/M5). `write_json`'s process-local
    `threading.Lock` only serializes within ONE process; `flock` extends that across processes. `mutate`
    receives the current parsed value (or `default` if absent) and returns the value to persist; returns
    the persisted value.

    `flock` is POSIX-only (imported lazily) — the kernel runs in Linux containers, and only in-container
    code does registry writes; host-side readers (`compute_enabled`, `render_compose`) use `read_json`."""
    import fcntl

    os.makedirs(settings.kernel_state_dir, exist_ok=True)
    lock_path = _path(name) + ".lock"
    with _lock:  # serialize within this process first, then across processes via flock
        with open(lock_path, "w", encoding="utf-8") as lockf:
            fcntl.flock(lockf, fcntl.LOCK_EX)
            try:
                new_value = mutate(read_json(name, default))
                _write_locked(name, new_value)
                return new_value
            finally:
                fcntl.flock(lockf, fcntl.LOCK_UN)
