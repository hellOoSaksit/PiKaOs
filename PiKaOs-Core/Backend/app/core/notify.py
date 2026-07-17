"""Capped, i18n-clean notification store (audit-notifications v2 spec §1): the server stores a
message KEY + small string params — never rendered text — and the client localizes with
t(key, params), so the language packs stay the single source of copy. Backed by the
`notifications` kernel-state blob through kernel_state.update (cross-process-safe
read-modify-write); newest first, truncated to CAP on every emit. emit() is called at the success
point of a mutation that has already persisted, so — like audit.log() — it never raises into a
request path: bad params are coerced, not rejected."""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone

from . import kernel_state

_log = logging.getLogger("pikaos.notify")
CAP = 100
_STORE = "notifications"
_MAX_PARAM_CHARS = 200
_MAX_PARAMS = 8


def _entries() -> list[dict]:
    value = kernel_state.read_json(_STORE, [])
    return value if isinstance(value, list) else []    # corrupt blob self-heals to empty


def _sanitized(params: dict) -> dict:
    """Force `params` into the shape the store guarantees. Rejecting here would turn an already-
    persisted mutation into a 500 — the caller's plugin really did install — so an emitter's bug is
    logged and survivable instead. Reachable with admin-supplied or remote-derived values (an
    install ref, a git tag), neither of which is length-capped upstream."""
    kept = dict(list(params.items())[:_MAX_PARAMS])
    if len(params) > len(kept):
        _log.warning("notification params over %d — dropped %s", _MAX_PARAMS,
                     sorted(set(params) - set(kept)))
    out = {}
    for k, v in kept.items():
        if not isinstance(v, str):
            _log.warning("notification param %r is %s, not str — coerced", k, type(v).__name__)
            v = str(v)
        if len(v) > _MAX_PARAM_CHARS:
            _log.warning("notification param %r is %d chars — truncated to %d", k, len(v),
                         _MAX_PARAM_CHARS)
            v = v[:_MAX_PARAM_CHARS]
        out[k] = v
    return out


def emit(kind: str, key: str, params: dict[str, str] | None = None) -> dict:
    entry = {
        "id": f"ntf_{uuid.uuid4().hex[:12]}",
        "kind": kind,
        "key": key,
        "params": _sanitized(dict(params or {})),
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
