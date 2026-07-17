"""Append-only audit trail (audit-notifications v2 spec §1-§2): one JSONL line per admin-plane
mutation, size-rotated (keep 2 files). Lives beside the kernel-state files but is NOT a
kernel_state blob — an audit stream must never be a whole-file rewrite. log() never raises into
a request path; secrets never enter `detail` (call sites are tested for this).

**Entries are clipped here, not trusted from the caller.** Rotation keeps only one predecessor, so
an unbounded field lets a caller push real history out of both files: three 6MB entries are enough
to erase everything. That was reachable anonymously once the auth plugin began auditing failed
logins with the submitted username — the first attacker-controlled write path into the trail. The
edge validates too (the login schema bounds its field), but a compliance trail must not depend on
every present and future call site getting that right, so the clip lives at the sink."""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from pathlib import Path

from .config import settings

_log = logging.getLogger("pikaos.audit")
MAX_BYTES = 5 * 1024 * 1024
# Audit fields are ids / names / keys / hosts — never prose. The longest real target is a plugin id
# or a git host; 256 is far above any of them and far below what could distort rotation.
MAX_FIELD_CHARS = 256
MAX_DETAIL_CHARS = 1024


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


def _clip(value: str, limit: int) -> str:
    """Bound one field. `…` marks a clip so a reader can tell truncation from a genuinely short value."""
    return value if len(value) <= limit else value[:limit] + "…"


def log(actor: str, action: str, target: str = "", detail: dict | None = None) -> None:
    detail_json = json.dumps(detail or {}, ensure_ascii=False)
    if len(detail_json) > MAX_DETAIL_CHARS:
        # Don't half-serialize a dict into invalid JSON — replace it wholesale and say why.
        detail = {"clipped": True, "chars": len(detail_json)}
    entry = {"at": datetime.now(timezone.utc).isoformat(),
             "actor": _clip(actor, MAX_FIELD_CHARS),
             "action": action,
             "target": _clip(target, MAX_FIELD_CHARS),
             "detail": detail or {}}
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
            # errors="replace", not strict: an append cut short by a crash or a full disk leaves a
            # partial multi-byte sequence, and this trail writes Thai targets with ensure_ascii=False,
            # so that is the expected corruption — not an exotic one. Strict decoding turns it into a
            # permanent 500 on GET /api/audit, fixable only by hand-editing the file. The replacement
            # char then fails json.loads below and the line is skipped like any other corrupt one.
            text = p.read_text(encoding="utf-8", errors="replace")
        except OSError:
            continue
        for line in text.splitlines():
            try:
                e = json.loads(line)
            except json.JSONDecodeError:
                continue                                       # a corrupt line never blocks the trail
            if isinstance(e, dict):
                rows.append(e)
    if action:
        rows = [r for r in rows if r.get("action") == action]
    if actor:
        rows = [r for r in rows if r.get("actor") == actor]
    return list(reversed(rows))[:limit]
