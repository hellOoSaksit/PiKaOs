"""Module registry — the seam that makes PiKaOs a pluggable Core + Plugins app (plugin-architecture.md).

The **Base** (infra + core + engine = base infra + the agent-runtime platform) is hardcoded here — it is
**Core**, always loaded, never a manifest plugin. Every **feature** is a manifest plugin discovered from
`app/plugins/<id>/manifest.json` by [`plugin_loader`](plugin_loader.py): the loader validates each manifest
and computes the **topological boot order** (a plugin loads after its `dependencies`). A deployment chooses
which plugins to serve via `ENABLED_MODULES` ("" = Base only · "*" = all · a comma-list). This file keeps
the stable public API (`enabled_optional_modules` · `is_module_active` · `active_modules` ·
`register_routers`) that `main.py` + `worker.py` rely on; the plugin tier is now manifest-driven.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass

from fastapi import APIRouter, FastAPI

from . import plugin_loader
from .core.config import settings
from .core.routers import health, llm_config, plugins, settings_config, ws
from .core.routers import storage as storage_router

log = logging.getLogger("pikaos.plugins")

# Plugins that were enabled but whose router failed to import/mount in THIS process (§8 fault boundary):
# Core + the other plugins still serve; /health reports these as "degraded" (§14). Refreshed on every
# active_modules() call so it always reflects the routers this build actually mounted.
_DEGRADED: dict[str, str] = {}


@dataclass(frozen=True)
class Module:
    """One bounded context. `optional=False` = Base (always loads, ignores ENABLED_MODULES);
    `optional=True` = a feature plugin a deployment may switch off."""

    name: str
    routers: tuple[APIRouter, ...] = ()
    optional: bool = True


# --- Base (Core): always on — infra + core + the agent-runtime platform (engine) --------------------
BASE_MODULES: tuple[Module, ...] = (
    Module("infra", routers=(health.router,), optional=False),
    Module(
        "core",  # access / system config the kernel serves; auth (login/RBAC) is now the `auth` plugin
        routers=(llm_config.router, llm_config.roles_router, storage_router.router,
                 settings_config.router, plugins.router),
        optional=False,
    ),
    Module("engine", routers=(ws.router,), optional=False),  # agent-ops runtime — part of Core
)
BASE_NAMES: frozenset[str] = frozenset(m.name for m in BASE_MODULES)

# --- Plugins (features): discovered + validated from manifests at import (§3) -----------------------
# The catalog + enable-selection now live in the kernel (`plugin_loader`) so Core-side consumers read them
# without importing this composition seam; re-exported here to keep `modules`' public API stable.
PLUGIN_MANIFESTS: dict[str, plugin_loader.Manifest] = plugin_loader.PLUGIN_MANIFESTS
OPTIONAL_MODULE_NAMES: tuple[str, ...] = plugin_loader.OPTIONAL_MODULE_NAMES
enabled_optional_modules = plugin_loader.enabled_optional_modules


def is_module_active(name: str) -> bool:
    """True if module `name` loads in this build — the Base always does; a plugin does only when listed
    in ENABLED_MODULES. Used by worker.py to gate that plugin's jobs."""
    return name in BASE_NAMES or name in enabled_optional_modules()


def active_modules() -> list[Module]:
    """Modules this build loads: the whole Base + the enabled plugins in **topological order** (each
    after its dependencies). Plugin routers are imported here — a disabled plugin is never imported.

    **Fault-isolated (§8):** if an enabled plugin's router fails to import/mount, it is caught, logged,
    and marked **degraded** — Core and every other plugin still load, with that plugin's routes absent.
    A broken feature must never take the whole API down."""
    _DEGRADED.clear()
    mods = list(BASE_MODULES)
    for pid in plugin_loader.topo_order(enabled_optional_modules(), PLUGIN_MANIFESTS):
        try:
            mods.append(Module(name=pid, routers=(plugin_loader.load_router(pid),)))
        except Exception as exc:  # §8 boundary — a bad plugin is degraded, not fatal
            _DEGRADED[pid] = str(exc)
            log.exception("plugin '%s' router failed to load — marking degraded, Core continues", pid)
    return mods


def _state_of(pid: str, enabled: set[str]) -> str:
    """A plugin's /health state (§14): **degraded** if it was enabled but failed to mount (§8),
    **active** if enabled and healthy, else **disabled**."""
    if pid in _DEGRADED:
        return "degraded"
    return "active" if pid in enabled else "disabled"


def plugin_states() -> list[dict]:
    """Each discovered plugin's state for /health (§14): `active` (enabled + healthy) · `degraded`
    (enabled but its router failed to load, §8) · `disabled` (not enabled this build), with its
    **version read from the manifest** (never hardcoded → ties to versions.md). Lists every discovered
    plugin — a disabled one still appears, so an operator sees the full installable surface."""
    enabled = enabled_optional_modules()
    return [
        {"id": pid, "version": mf.version, "state": _state_of(pid, enabled)}
        for pid, mf in sorted(PLUGIN_MANIFESTS.items())
    ]


def register_routers(app: FastAPI) -> list[str]:
    """Include the routers of every active module on `app`. Returns the loaded module names (Base +
    enabled plugins, topological order) so startup can log exactly what this build serves."""
    loaded: list[str] = []
    for module in active_modules():
        for router in module.routers:
            app.include_router(router)
        loaded.append(module.name)
    return loaded
