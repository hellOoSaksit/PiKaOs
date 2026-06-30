"""Plugin install registry + dependency resolver (the brain behind the install UI).

The registry records each plugin's **desired state** — `installed` / `enabled` / `disabled` — persisted in
the generic `app_settings` table under key `"plugins"` (a JSON map `{id: {state, version, installed_at}}`).
A plugin with no row is **available** (discovered but not installed). This is the lighter of the two stores
in plugin-lifecycle-ui.md §3 (a dedicated table is the heavier alternative); it is enough for the
restart-to-apply model the team chose (§7 🟢): the registry is the source of truth, and the backend
entrypoint resolves it into `ENABLED_MODULES` at boot (so what actually mounts follows the registry, but
mounting still happens once, at import — no fragile runtime unmount). See `scripts/compute_enabled.py`.

The **resolver** (`resolve_install_plan`) is the dependency-request logic: clicking "Install RAG" must offer
to install `ai` if it isn't there, and **skip it if another plugin already pulled it in** (no duplicate
install). It is a pure function over manifests + the installed set, so it unit-tests without a DB.

NOTE (first cut): install == register + enable. Running a plugin's *own* forward/down migration on
install/uninstall is P4 ("ก้อน B") — until then a plugin's tables come from the Core baseline, so uninstall
only forgets the row (it does not drop tables). The router says so in its docstring.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from .. import plugin_loader as _loader
from .repositories import app_settings as _repo

_KEY = "plugins"

# desired-state values (a missing row == AVAILABLE)
AVAILABLE = "available"
INSTALLED = "installed"
ENABLED = "enabled"
DISABLED = "disabled"


# --- persistence (async, over app_settings["plugins"]) ----------------------------------------------

async def read(db: AsyncSession) -> dict[str, dict]:
    """The raw registry map `{plugin_id: {state, version, installed_at}}` (empty if never written)."""
    row = await _repo.get(db, _KEY)
    return dict(row.value) if row and isinstance(row.value, dict) else {}


def state_of(registry: dict[str, dict], pid: str) -> str:
    """The desired state of `pid` given a registry map — `available` when it has no row."""
    entry = registry.get(pid)
    return entry.get("state", AVAILABLE) if isinstance(entry, dict) else AVAILABLE


def enabled_ids(registry: dict[str, dict]) -> set[str]:
    """The plugins the registry wants mounted (state == enabled)."""
    return {pid for pid in registry if state_of(registry, pid) == ENABLED}


async def set_state(
    db: AsyncSession, pid: str, state: str, *, version: str | None = None,
    by: uuid.UUID | None = None,
) -> dict[str, dict]:
    """Upsert one plugin's state, preserving `installed_at` across transitions; returns the new map."""
    reg = await read(db)
    entry = dict(reg.get(pid) or {})
    entry["state"] = state
    if version is not None:
        entry["version"] = version
    if state in (INSTALLED, ENABLED) and "installed_at" not in entry:
        entry["installed_at"] = datetime.now(timezone.utc).isoformat()
    reg[pid] = entry
    await _repo.upsert(db, _KEY, reg, updated_by=by)
    return reg


async def remove(db: AsyncSession, pid: str, *, by: uuid.UUID | None = None) -> dict[str, dict]:
    """Forget a plugin (uninstall → back to *available*); returns the new map. No table drop (see P4)."""
    reg = await read(db)
    reg.pop(pid, None)
    await _repo.upsert(db, _KEY, reg, updated_by=by)
    return reg


# --- dependency resolver (PURE — no DB, unit-testable) ----------------------------------------------

def _closure(target: str, manifests: dict[str, Any]) -> set[str]:
    """`target` plus all of its transitive hard `dependencies` (ignores deps absent from `manifests`)."""
    seen: set[str] = set()
    stack = [target]
    while stack:
        pid = stack.pop()
        if pid in seen or pid not in manifests:
            continue
        seen.add(pid)
        stack.extend(manifests[pid].dependencies)
    return seen


def resolve_install_plan(
    target: str, manifests: dict[str, Any], installed: set[str],
) -> dict[str, Any]:
    """What installing `target` entails, dependency-first.

    Returns `{target, unknown, order, already_installed, to_install}` where `order` is the target plus its
    transitive deps in topological order (deps before dependents). `already_installed` are the ones the
    registry already has (skipped — no duplicate install, the dedupe the user asked for); `to_install` are
    the rest, in the order they must be installed. `unknown` is true when `target` isn't a discovered plugin.
    """
    if target not in manifests:
        return {"target": target, "unknown": True, "order": [], "already_installed": [], "to_install": []}
    needed = _closure(target, manifests)
    order = _loader.topo_order(needed, manifests)
    already = [pid for pid in order if pid in installed]
    to_install = [pid for pid in order if pid not in installed]
    return {
        "target": target,
        "unknown": False,
        "order": order,
        "already_installed": already,
        "to_install": to_install,
    }
