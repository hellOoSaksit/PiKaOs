"""Plugin install registry + dependency resolver (the brain behind the install UI).

The registry records each plugin's **desired state** — `installed` / `enabled` / `disabled` — persisted as
kernel local-JSON (`kernel_state` file `"plugins"`: a map `{id: {state, version, installed_at}}`). A plugin
with no entry is **available** (discovered but not installed). It is the source of truth for the
restart-to-apply model (plugin-lifecycle-ui.md §7 🟢): the backend entrypoint resolves it into
`ENABLED_MODULES` at boot (so what mounts follows the registry, but mounting still happens once, at import).
See `scripts/compute_enabled.py`.

Kernel local-JSON (not a DB table): the registry is the boot-time source of truth for which plugins load —
a chicken-and-egg with the plugin tier, and the kernel must resolve it with NO datastore (zero-datastore
kernel). Persistence is synchronous file I/O; the JSON is tiny.

The **resolver** (`resolve_install_plan`) is the dependency-request logic: clicking "Install RAG" must offer
to install `ai` if it isn't there, and **skip it if another plugin already pulled it in** (no duplicate
install). It is a pure function over manifests + the installed set, so it unit-tests without any state.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from . import kernel_state
from .. import plugin_loader as _loader

_KEY = "plugins"

# desired-state values (a missing entry == AVAILABLE)
AVAILABLE = "available"
INSTALLED = "installed"
ENABLED = "enabled"
DISABLED = "disabled"


# --- persistence (kernel local-JSON, over the "plugins" state file) ---------------------------------

def read() -> dict[str, dict]:
    """The raw registry map `{plugin_id: {state, version, installed_at}}` (empty if never written)."""
    reg = kernel_state.read_json(_KEY, {})
    return dict(reg) if isinstance(reg, dict) else {}


def state_of(registry: dict[str, dict], pid: str) -> str:
    """The desired state of `pid` given a registry map — `available` when it has no entry."""
    entry = registry.get(pid)
    return entry.get("state", AVAILABLE) if isinstance(entry, dict) else AVAILABLE


def enabled_ids(registry: dict[str, dict]) -> set[str]:
    """The plugins the registry wants mounted (state == enabled)."""
    return {pid for pid in registry if state_of(registry, pid) == ENABLED}


def set_state(pid: str, state: str, *, version: str | None = None) -> dict[str, dict]:
    """Upsert one plugin's state, preserving `installed_at` across transitions; returns the new map."""
    reg = read()
    entry = dict(reg.get(pid) or {})
    entry["state"] = state
    if version is not None:
        entry["version"] = version
    if state in (INSTALLED, ENABLED) and "installed_at" not in entry:
        entry["installed_at"] = datetime.now(timezone.utc).isoformat()
    reg[pid] = entry
    kernel_state.write_json(_KEY, reg)
    return reg


def remove(pid: str) -> dict[str, dict]:
    """Forget a plugin (uninstall → back to *available*); returns the new map. No table drop (see P4)."""
    reg = read()
    reg.pop(pid, None)
    kernel_state.write_json(_KEY, reg)
    return reg


# --- dependency resolver (PURE — no state, unit-testable) -------------------------------------------

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
    registry already has (skipped — no duplicate install); `to_install` are the rest, in install order.
    `unknown` is true when `target` isn't a discovered plugin.
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
