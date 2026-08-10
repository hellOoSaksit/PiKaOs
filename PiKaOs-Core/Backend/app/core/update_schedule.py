"""Scheduled-update store (server-core-update spec §6.1-§6.2): one kernel-state JSON file, every
mutation through the flock'd `kernel_state.update` so a multi-worker uvicorn — or the web and worker
containers sharing the state volume — can never double-claim the same entry. Terminal entries stay
(they are the audit trail and the notifications feed); cancel MARKS, it never deletes.

Times are compared by PARSING, not by comparing the ISO strings. Every stored `at` is normalized to
UTC here, so string comparison would *usually* work — but "usually" is how a scheduler fires an update
at the wrong hour: a caller passing `…Z`, a different offset, or differing fractional-second precision
all compare wrong lexicographically while parsing them is exact.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from . import kernel_state

_KEY = "update_schedule"
KIND_PLUGIN = "plugin-update"
KIND_CORE_REMINDER = "core-reminder"
_KINDS = (KIND_PLUGIN, KIND_CORE_REMINDER)
PENDING, RUNNING, DONE, FAILED, MISSED, CANCELLED = (
    "pending", "running", "done", "failed", "missed", "cancelled")


def _entries(store: object) -> list[dict]:
    if isinstance(store, dict) and isinstance(store.get("entries"), list):
        return [e for e in store["entries"] if isinstance(e, dict)]
    return []


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse(value: str) -> datetime | None:
    """A stored/received timestamp as an aware UTC datetime, or None if it is unusable. Returning None
    rather than raising keeps one malformed row from breaking a claim sweep over all the others."""
    try:
        parsed = datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else None


def add_entry(*, kind: str, at_iso: str, by: str, plugin_id: str | None = None,
              tag: str | None = None) -> dict:
    """Queue one future action. Rejects an unknown kind, a naive timestamp, and a past time — the
    store is the last place these can be caught before a runner acts on them."""
    if kind not in _KINDS:
        raise ValueError(f"unknown schedule kind: {kind}")
    at = _parse(at_iso)
    if at is None:
        raise ValueError("schedule time must be an ISO timestamp carrying a timezone")
    if at <= _now():
        raise ValueError("schedule time must be in the future")
    entry = {"id": f"sched_{uuid.uuid4().hex[:12]}", "kind": kind, "pluginId": plugin_id,
             "tag": tag, "at": at.isoformat(), "by": by,
             "createdAt": _now().isoformat(), "status": PENDING, "note": ""}

    def mutate(store):
        entries = _entries(store)
        entries.append(entry)
        return {"entries": entries}

    kernel_state.update(_KEY, mutate, {"entries": []})
    return entry


def list_entries() -> list[dict]:
    """Newest first — the order the UI and the notifications feed read."""
    return sorted(_entries(kernel_state.read_json(_KEY, {"entries": []})),
                  key=lambda e: e.get("createdAt", ""), reverse=True)


def cancel(sid: str) -> dict | None:
    """PENDING -> CANCELLED. None when the id is unknown or the entry has already left PENDING —
    a running or finished action cannot be called back."""
    out: dict | None = None

    def mutate(store):
        nonlocal out
        entries = _entries(store)
        for e in entries:
            if e["id"] == sid and e["status"] == PENDING:
                e["status"] = CANCELLED
                out = dict(e)
        return {"entries": entries}

    kernel_state.update(_KEY, mutate, {"entries": []})
    return out


def claim_due(now_iso: str) -> dict | None:
    """Atomically flip the first due pending entry to RUNNING and return it — the flock makes this the
    single-flight gate across workers (spec §6.3). One per call: the caller loops, so a slow action
    never blocks the claim of the next."""
    now = _parse(now_iso) or _now()
    claimed: dict | None = None

    def mutate(store):
        nonlocal claimed
        entries = _entries(store)
        for e in entries:
            due = _parse(e.get("at", ""))
            if e["status"] == PENDING and due is not None and due <= now:
                e["status"] = RUNNING
                e["startedAt"] = now.isoformat()
                claimed = dict(e)
                break
        return {"entries": entries}

    kernel_state.update(_KEY, mutate, {"entries": []})
    return claimed


def finish(sid: str, status: str, note: str = "") -> None:
    def mutate(store):
        entries = _entries(store)
        for e in entries:
            if e["id"] == sid:
                e["status"] = status
                e["note"] = note
                e["finishedAt"] = _now().isoformat()
        return {"entries": entries}

    kernel_state.update(_KEY, mutate, {"entries": []})


def sweep_stuck(now_iso: str, max_running_minutes: int = 10) -> list[dict]:
    """RUNNING entries older than the cap -> FAILED (crash-safety, spec §9). A process that dies
    mid-update leaves its claim RUNNING forever; without this the entry is never retried and never
    reported, so the operator sees a schedule that simply stopped."""
    now = _parse(now_iso) or _now()
    cutoff = now - timedelta(minutes=max_running_minutes)
    swept: list[dict] = []

    def mutate(store):
        entries = _entries(store)
        for e in entries:
            started = _parse(e.get("startedAt", ""))
            if e["status"] == RUNNING and started is not None and started <= cutoff:
                e["status"] = FAILED
                e["note"] = "runner crashed or restarted mid-update"
                swept.append(dict(e))
        return {"entries": entries}

    kernel_state.update(_KEY, mutate, {"entries": []})
    return swept
