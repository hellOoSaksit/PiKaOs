"""Append-only audit trail (audit-notifications v2 spec §1-§2): one JSONL line per admin-plane
mutation, size-rotated (keep 2 files). Lives beside the kernel-state files but is NOT a
kernel_state blob — an audit stream must never be a whole-file rewrite. log() never raises into
a request path; secrets never enter `detail` (call sites are tested for this)."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from .config import settings

_log = logging.getLogger("pikaos.audit")
MAX_BYTES = 5 * 1024 * 1024


def actor_of(user) -> str:
    """The audit `actor` string for a route's current user — shared by every call site."""
    return str(getattr(user, "id", "") or "unknown")


def _path() -> Path:
    p = Path(settings.kernel_state_dir)
    p.mkdir(parents=True, exist_ok=True)
    return p / "audit.log.jsonl"


def _rotate_if_needed(p: Path) -> None:
    try:
        if p.exists() and p.stat().st_size >= MAX_BYTES:
            p.replace(p.with_suffix(".jsonl.1"))     # keep exactly one predecessor
    except OSError:
        _log.warning("audit rotation failed — continuing on the current file")


def log(actor: str, action: str, target: str = "", detail: dict | None = None) -> None:
    entry = {"at": datetime.now(timezone.utc).isoformat(), "actor": actor,
             "action": action, "target": target, "detail": detail or {}}
    try:
        p = _path()
        _rotate_if_needed(p)
        with p.open("a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        _log.exception("audit append failed for %s", action)   # never raise into the request


def read(*, limit: int = 100, action: str | None = None, actor: str | None = None) -> list[dict]:
    rows: list[dict] = []
    for p in (_path().with_suffix(".jsonl.1"), _path()):
        try:
            for line in p.read_text(encoding="utf-8").splitlines():
                try:
                    e = json.loads(line)
                except json.JSONDecodeError:
                    continue                                   # a corrupt line never blocks the trail
                if isinstance(e, dict):
                    rows.append(e)
        except OSError:
            continue
    if action:
        rows = [r for r in rows if r.get("action") == action]
    if actor:
        rows = [r for r in rows if r.get("actor") == actor]
    return list(reversed(rows))[:limit]
