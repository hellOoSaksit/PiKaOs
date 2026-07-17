"""Capped, i18n-clean notification store (audit-notifications v2 spec §1): the server stores a
message KEY + small string params — never rendered text — and the client localizes with
t(key, params), so the language packs stay the single source of copy. Backed by the
`notifications` kernel-state blob through kernel_state.update (cross-process-safe
read-modify-write); newest first, truncated to CAP on every emit."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from . import kernel_state

CAP = 100
_STORE = "notifications"
_MAX_PARAM_CHARS = 200
_MAX_PARAMS = 8


def _entries() -> list[dict]:
    value = kernel_state.read_json(_STORE, [])
    return value if isinstance(value, list) else []    # corrupt blob self-heals to empty


def _validated(params: dict) -> dict:
    if len(params) > _MAX_PARAMS:
        raise ValueError(f"too many notification params (max {_MAX_PARAMS})")
    for k, v in params.items():
        if not isinstance(v, str) or len(v) > _MAX_PARAM_CHARS:
            raise ValueError(f"notification param {k!r} must be a str of <= {_MAX_PARAM_CHARS} chars")
    return params


def emit(kind: str, key: str, params: dict[str, str] | None = None) -> dict:
    entry = {
        "id": f"ntf_{uuid.uuid4().hex[:12]}",
        "kind": kind,
        "key": key,
        "params": _validated(dict(params or {})),
        "at": datetime.now(timezone.utc).isoformat(),
        "read": False,
    }

    def mutate(current):
        rows = current if isinstance(current, list) else []
        return [entry] + rows[: CAP - 1]

    kernel_state.update(_STORE, mutate, [])
    return entry


def list_all() -> list[dict]:
    return _entries()


def mark_read(ids: list[str] | None = None) -> int:
    flipped = 0

    def mutate(current):
        nonlocal flipped
        rows = current if isinstance(current, list) else []
        wanted = None if ids is None else set(ids)
        for row in rows:
            if not row.get("read") and (wanted is None or row.get("id") in wanted):
                row["read"] = True
                flipped += 1
        return rows

    kernel_state.update(_STORE, mutate, [])
    return flipped


def unread_count() -> int:
    return sum(1 for row in _entries() if not row.get("read"))
