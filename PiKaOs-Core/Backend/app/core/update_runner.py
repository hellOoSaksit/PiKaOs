"""Scheduled-update runner (spec §6.3): a lifespan asyncio task that claims due entries through the
flock'd store (single-flight across workers), fires them through the SAME switch pipeline as the
manual route, and — only after a committed plugin switch — SIGTERMs PID 1 so Docker's
`restart: unless-stopped` revives the container on the new code.

Two policies worth stating outright, because both are about surprise rather than correctness:
- **Overdue past the grace window = MISSED, never applied late.** A server that was down over the
  scheduled hour must not wake up and start switching plugin versions nobody is watching.
- **A sweep marks entries stuck RUNNING as FAILED.** A process that dies mid-switch leaves its claim
  held forever; without the sweep the entry is neither retried nor reported and the schedule just
  silently stops.
"""
from __future__ import annotations

import asyncio
import logging
import os
import signal
from datetime import datetime, timedelta, timezone

from . import notify
from . import update_schedule as us

log = logging.getLogger("pikaos.updates.runner")
GRACE_MINUTES = 15


def _perform_switch(plugin_id: str, tag: str, by: str) -> None:
    """Indirection with two jobs: the lazy import avoids a router import cycle at module load, and it
    is the seam the runner tests replace — so the loop is testable without a git tree."""
    from . import plugin_registry as registry
    from .routers.plugins import perform_switch
    reg = registry.read()
    perform_switch(plugin_id, tag, by,
                   repo_url=registry.repo_url_of(reg, plugin_id),
                   old_tag=registry.installed_tag_of(reg, plugin_id))


def fire_entry(entry: dict) -> tuple[str, str]:
    """Execute one claimed entry → (terminal status, generic note). Never raises: the caller has
    already flipped the row to RUNNING, so an escaping exception would strand it there until a sweep."""
    due = us.parse_utc(entry.get("at", ""))
    if due is None:
        return us.FAILED, "schedule entry has an unreadable time"
    if datetime.now(timezone.utc) - due > timedelta(minutes=GRACE_MINUTES):
        return us.MISSED, "server was down at the scheduled time"
    if entry.get("kind") == us.KIND_CORE_REMINDER:
        # Deliberately does nothing but come due: a server-Core update replaces the running image via
        # a host script, which nothing inside the container may trigger. The reminder IS the feature.
        return us.DONE, "core update reminder due"
    try:
        _perform_switch(entry["pluginId"], entry["tag"], entry.get("by") or "schedule")
        return us.DONE, f"switched to {entry['tag']} — restarting to apply"
    except Exception:
        # Generic note, full detail to the log (rule 10) — the note is rendered in the operator's UI.
        log.exception("scheduled update %s failed", entry.get("id"))
        return us.FAILED, "update failed and was reverted — see server logs"


def schedule_self_restart(delay_seconds: float = 3.0) -> None:
    """SIGTERM PID 1 (the uvicorn master) shortly — a graceful shutdown that the compose restart
    policy turns into a restart on the freshly-switched code. Delayed so the HTTP response and the
    state write that preceded it are safely out the door first.

    Failing to signal is logged, not raised: outside a container PID 1 is the host's init and the
    kill is refused, which must not take the runner down with it."""
    def _term() -> None:
        try:
            log.info("scheduled update applied — restarting the server to load it")
            os.kill(1, signal.SIGTERM)
        except OSError:
            # Not containerised (or not permitted): the switch is committed on disk regardless, it
            # just applies at the next restart instead of this one.
            log.warning("could not signal PID 1 — the update applies on the next restart")

    asyncio.get_running_loop().call_later(delay_seconds, _term)


def announce(entry: dict, status: str) -> None:
    """Put a fired entry's outcome in the notification feed (key + params; the client localizes).

    This is the feature's only output: a scheduled switch runs unattended, so "it worked" / "it
    failed and was reverted" / "the server was off and it never ran" have nowhere else to surface.
    The store is the same one every other kernel mutation emits into — it owns read/unread, so the
    operator sees each outcome once, which a list re-derived in the renderer could not do.
    """
    if status == us.CANCELLED:
        return                                          # the canceller already got told, by the route
    try:
        if entry.get("kind") == us.KIND_CORE_REMINDER:
            notify.emit("plugin", "notif.schedule.core")
        else:
            notify.emit("plugin", f"notif.schedule.{status}",
                        {"plugin": entry.get("pluginId") or "", "tag": entry.get("tag") or ""})
    except Exception:
        # emit() already swallows a failed WRITE; this covers the store being broken outright. The
        # switch is committed on disk by now, so losing the loop over an announcement would strand
        # every later entry to save a message.
        log.exception("could not announce schedule outcome for %s", entry.get("id"))


async def runner_loop(stop: asyncio.Event, *, tick_seconds: float = 60.0,
                      fire=fire_entry, restart=schedule_self_restart) -> None:
    """Tick until `stop`. One claim per tick: a slow switch must not hold up the next claim, and the
    loop is the only thing that may outlive a single entry."""
    while not stop.is_set():
        try:
            now_iso = datetime.now(timezone.utc).isoformat()
            us.sweep_stuck(now_iso)
            entry = us.claim_due(now_iso)
            if entry is not None:
                status, note = fire(entry)
                us.finish(entry["id"], status, note)
                announce(entry, status)
                # Only a committed plugin switch earns a restart. A MISSED, FAILED or reminder entry
                # changed nothing on disk, and restarting for one would be an outage with no cause.
                if status == us.DONE and entry.get("kind") == us.KIND_PLUGIN:
                    restart()
        except Exception:
            log.exception("update runner tick failed")     # a bad tick must never kill the loop
        try:
            await asyncio.wait_for(stop.wait(), timeout=tick_seconds)
        except asyncio.TimeoutError:
            pass
