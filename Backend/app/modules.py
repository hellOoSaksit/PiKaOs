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

from dataclasses import dataclass

from fastapi import APIRouter, FastAPI

from . import plugin_loader
from .config import settings
from .routers import auth, health, llm_config, settings_config, ws
from .routers import storage as storage_router


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
        "core",  # identity / access / system config every plugin relies on
        routers=(auth.router, llm_config.router, llm_config.roles_router, storage_router.router,
                 settings_config.router),
        optional=False,
    ),
    Module("engine", routers=(ws.router,), optional=False),  # agent-ops runtime — part of Core
)
BASE_NAMES: frozenset[str] = frozenset(m.name for m in BASE_MODULES)

# --- Plugins (features): discovered + validated from manifests at import (§3) -----------------------
PLUGIN_MANIFESTS: dict[str, plugin_loader.Manifest] = plugin_loader.discover()
OPTIONAL_MODULE_NAMES: tuple[str, ...] = tuple(sorted(PLUGIN_MANIFESTS))


def enabled_optional_modules() -> set[str]:
    """The PLUGINS this build loads on top of the Base, parsed from `settings.enabled_modules`:
    "" / unset = **Base only, no plugins** (the default) · "*" = every plugin · a comma-list = those
    plugins, intersected with the discovered manifest ids (an unknown name is ignored, never fatal)."""
    raw = (settings.enabled_modules or "").strip()
    if raw == "*":
        return set(OPTIONAL_MODULE_NAMES)
    if raw == "":
        return set()
    wanted = {p.strip() for p in raw.split(",") if p.strip()}
    return wanted & set(OPTIONAL_MODULE_NAMES)


def is_module_active(name: str) -> bool:
    """True if module `name` loads in this build — the Base always does; a plugin does only when listed
    in ENABLED_MODULES. Used by worker.py to gate that plugin's jobs."""
    return name in BASE_NAMES or name in enabled_optional_modules()


def active_modules() -> list[Module]:
    """Modules this build loads: the whole Base + the enabled plugins in **topological order** (each
    after its dependencies). Plugin routers are imported here — a disabled plugin is never imported."""
    mods = list(BASE_MODULES)
    for pid in plugin_loader.topo_order(enabled_optional_modules(), PLUGIN_MANIFESTS):
        mods.append(Module(name=pid, routers=(plugin_loader.load_router(pid),)))
    return mods


def register_routers(app: FastAPI) -> list[str]:
    """Include the routers of every active module on `app`. Returns the loaded module names (Base +
    enabled plugins, topological order) so startup can log exactly what this build serves."""
    loaded: list[str] = []
    for module in active_modules():
        for router in module.routers:
            app.include_router(router)
        loaded.append(module.name)
    return loaded
