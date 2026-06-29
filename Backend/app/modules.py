"""Module registry — the seam that makes PiKaOs a pluggable Modular Monolith (modularity.md §2.5).

A deployment loads only the modules in `ENABLED_MODULES`, so one department can run a lightweight
build (e.g. just core + knowledge) without dragging the rest along. The **foundation** (infra + core:
health/identity/config/storage) always loads — every deployment needs it. The **optional** bounded
contexts (engine, knowledge) are switchable. (compare now lives only as the PiKaOs-Compare own-app
plugin — removed from main, extraction-plan.md §4.)

The code is still flat (`app/routers`, not `app/modules/<name>/` yet — modularity.md §5 moves folders
later, one module at a time). This registry is the single place that maps each module to the routers
(and, via worker.py, the jobs) it owns, so plug-and-play works **today** without that move. When a
module's folder does move, only the imports here change — the seam stays put.
"""
from __future__ import annotations

from dataclasses import dataclass

from fastapi import APIRouter, FastAPI

from .config import settings
from .routers import auth, health, llm_config, settings_config, ws
from .routers import storage as storage_router
from .plugins import knowledge  # plugin folders app/plugins/<name>/ (extraction-plan.md)


@dataclass(frozen=True)
class Module:
    """One bounded context. `optional=False` = part of the foundation that always loads (ignores
    ENABLED_MODULES); `optional=True` = a context a deployment may switch off."""

    name: str
    routers: tuple[APIRouter, ...] = ()
    optional: bool = True


# The single source of truth for module → router wiring. The **Base** (foundation, always on —
# infra + core + engine = the agent runtime) first, then the **plugins** (opt-in via ENABLED_MODULES).
# Keep this list in sync with worker.py's job map (the other half of §2.5).
MODULES: tuple[Module, ...] = (
    # --- Base: the agent runtime plugins attach to (always loads, ignores ENABLED_MODULES) ---
    Module("infra", routers=(health.router,), optional=False),
    Module(
        "core",  # identity / access / system config every module relies on
        routers=(auth.router, llm_config.router, llm_config.roles_router, storage_router.router,
                 settings_config.router),
        optional=False,
    ),
    Module("engine", routers=(ws.router,), optional=False),  # agent-ops runtime — part of the Base
    # --- Plugins: off unless listed in ENABLED_MODULES ("" = Base only, "*" = all) ---
    Module("knowledge", routers=(knowledge.router,)),  # codex / documents / RAG
)

# Plugin names a deployment may switch on via ENABLED_MODULES (everything not in the Base).
OPTIONAL_MODULE_NAMES: tuple[str, ...] = tuple(m.name for m in MODULES if m.optional)


def enabled_optional_modules() -> set[str]:
    """The PLUGINS this build loads on top of the Base, parsed from `settings.enabled_modules`:
    "" / unset = **Base only, no plugins** (the default) · "*" = every plugin (full build) ·
    a comma-list = those plugins, intersected with the known names (an unknown name is ignored,
    never an error that takes the app down)."""
    raw = (settings.enabled_modules or "").strip()
    if raw == "*":
        return set(OPTIONAL_MODULE_NAMES)
    if raw == "":
        return set()
    wanted = {p.strip() for p in raw.split(",") if p.strip()}
    return wanted & set(OPTIONAL_MODULE_NAMES)


def is_module_active(name: str) -> bool:
    """True if module `name` loads in this build — the foundation always does; an optional module
    does only when listed in ENABLED_MODULES. Used by worker.py to gate that module's jobs."""
    foundation = {m.name for m in MODULES if not m.optional}
    return name in foundation or name in enabled_optional_modules()


def active_modules() -> list[Module]:
    """Modules this build loads: the whole foundation + the enabled optional ones, in registry order."""
    enabled = enabled_optional_modules()
    return [m for m in MODULES if not m.optional or m.name in enabled]


def register_routers(app: FastAPI) -> list[str]:
    """Include the routers of every active module on `app`. Returns the loaded module names so
    startup can log exactly what this build serves."""
    loaded: list[str] = []
    for module in active_modules():
        for router in module.routers:
            app.include_router(router)
        loaded.append(module.name)
    return loaded
