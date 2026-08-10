"""Update routes — the scheduled-update queue (`/api/updates`, spec §6.2) and the server-Core update
check (`/api/core/check-update`, spec §4). Two prefixes, one file: they are one surface with one
authz rule, and splitting them is how the rule ends up written twice. The plugin-switch scheduling
verb itself lives with the other plugin verbs in `routers/plugins.py`, so everything that acts on a
plugin stays in one router.

Authz: `plugins.manage` on ALL of them, reads included. Each read is the read half of a privileged
operation — the schedule says which plugin is about to be switched, to what version and when; the
Core check spends an outbound `ls-remote` and discloses a release history — and the plan's original
"reads = any authenticated user" predates the decision that tightened the whole update surface. See
`architecture/security.md`. Nothing here is `ai_safe`: an external AI must not be able to queue a
version switch, read the queue, or learn that the server is behind.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import audit, core_update, notify, update_schedule
from ..config import settings
from ..identity import UserLike, require_perm

router = APIRouter(prefix="/api/updates", tags=["updates"])

# The Core check is not "an update" the way a schedule row is — it reports on the running server, so
# it sits under `/api/core` beside the other server-identity reads rather than inside the queue.
core_router = APIRouter(prefix="/api/core", tags=["updates"])


class CoreReminderIn(BaseModel):
    at: str          # UTC ISO with a timezone — validated in the store, which owns the rule


class CoreUpdateOut(BaseModel):
    currentVersion: str
    latestTag: str | None
    latestVersion: str | None
    hasUpdate: bool
    reachable: bool
    blocked: bool                 # some installed plugin's coreVersion excludes the target
    pluginCompat: list[dict]
    repoUrl: str | None = None    # browsable release repo, so the UI links it instead of hardcoding it


@core_router.get("/check-update", response_model=CoreUpdateOut)
async def core_check_update(
    _: UserLike = Depends(require_perm("plugins.manage")),
) -> CoreUpdateOut:
    """On-demand server-Core update check (spec §4): the highest `core-v*` tag on the release repo vs
    the running version, plus the installed-plugin compat table (§8.1) so the operator sees what a
    bump would strand BEFORE the host script touches anything. Unreachable is reported as
    `reachable: false`, never an error — an offline host is a normal state, not a broken screen.

    `reachable: true` with `latestTag: null` is a THIRD state, not a variant of the other two: the
    remote answered and has published no Core release yet. It is also the state of every repo before
    its first release, so collapsing it into "unavailable" makes a healthy server report an outage."""
    reachable, tags = core_update.core_tags()
    repo_url = core_update.release_page_url()      # from the setting, so it survives an outage
    latest = tags[0] if tags else None
    if latest is None:
        return CoreUpdateOut(currentVersion=settings.app_version, latestTag=None, latestVersion=None,
                             hasUpdate=False, reachable=reachable, blocked=False, pluginCompat=[],
                             repoUrl=repo_url)
    latest_version = core_update.version_of(latest)
    compat = core_update.plugin_compat(latest_version)
    return CoreUpdateOut(
        currentVersion=settings.app_version, latestTag=latest, latestVersion=latest_version,
        hasUpdate=core_update.is_newer(latest_version, settings.app_version),
        reachable=True, blocked=any(not r["compatible"] for r in compat), pluginCompat=compat,
        repoUrl=repo_url)


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


@router.post("/schedule-backup")
async def schedule_backup(
    body: CoreReminderIn,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> dict:
    """Queue a server backup. Unlike a Core update this IS an action the container can perform on
    itself — it writes an archive to the backups volume and nothing else, so no restart is earned."""
    try:
        entry = update_schedule.add_entry(kind=update_schedule.KIND_BACKUP,
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
