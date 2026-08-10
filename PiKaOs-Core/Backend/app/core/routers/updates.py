"""Scheduled-update routes (`/api/updates`) — list, cancel, and queue a Core-update reminder
(server-core-update spec §6.2). The plugin-switch scheduling verb itself lives with the other plugin
verbs in `routers/plugins.py`, so everything that acts on a plugin stays in one router.

Authz: `plugins.manage` on ALL of them, reads included. The schedule is the read half of a privileged
operation — it says which plugin is about to be switched, to what version, and when — and the plan's
original "reads = any authenticated user" predates the decision that tightened the whole update
surface. See `architecture/security.md`. Nothing here is `ai_safe`: an external AI must not be able to
queue a version switch, nor read the queue.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import audit, notify, update_schedule
from ..identity import UserLike, require_perm

router = APIRouter(prefix="/api/updates", tags=["updates"])


class CoreReminderIn(BaseModel):
    at: str          # UTC ISO with a timezone — validated in the store, which owns the rule


@router.get("/schedules")
async def list_schedules(
    _: UserLike = Depends(require_perm("plugins.manage")),
) -> list[dict]:
    """Every schedule entry, newest first — pending, running and terminal alike. Terminal rows are
    kept deliberately: they are the audit trail and what the notifications feed reads."""
    return update_schedule.list_entries()


@router.post("/core-reminder")
async def core_reminder(
    body: CoreReminderIn,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> dict:
    """Queue a REMINDER to check for a server-Core update. Deliberately not an action: a Core update
    replaces the running image via a host script, which nothing inside the container may trigger."""
    try:
        entry = update_schedule.add_entry(kind=update_schedule.KIND_CORE_REMINDER,
                                          at_iso=body.at, by=audit.actor_of(user))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e
    audit.log(audit.actor_of(user), "update.schedule", entry["id"], {"kind": entry["kind"]})
    return entry


@router.delete("/schedules/{sid}")
async def cancel_schedule(
    sid: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> dict:
    """Cancel a PENDING entry. 404 covers both "no such id" and "already running or finished" — the
    store refuses to call back work that has started, and the distinction is not the caller's to act
    on. Cancel MARKS the row; it never deletes it, so the trail stays complete."""
    entry = update_schedule.cancel(sid)
    if entry is None:
        raise HTTPException(status_code=404, detail="no pending schedule with that id")
    audit.log(audit.actor_of(user), "update.schedule.cancel", sid, {})
    notify.emit("plugin", "notif.schedule.cancelled",
                {"plugin": entry.get("pluginId") or "", "tag": entry.get("tag") or ""})
    return entry
