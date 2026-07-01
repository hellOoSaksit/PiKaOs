"""Plugin management HTTP routes (`/api/plugins`) — the API behind the install / Modules UI.

Lets an operator see every discovered plugin and its state, resolve what an install entails (the
dependency-request: "Install RAG ⇒ also install AI", skipping anything already installed), and
install / enable / disable / uninstall. State lives in the plugin registry (kernel local-JSON); the
**effect is restart-to-apply** (the team's choice — FastAPI mounts routers once at import, so a mutation
records desired state and the response flags `restart_required` when it differs from what is mounted now).

Read endpoints = any authenticated user (the UI loads them); mutations = the `plugins.manage` permission.
First cut: install == register + enable; per-plugin migrations on install/uninstall are P4, so uninstall
forgets the registry row without dropping tables (see plugin_registry.py).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from .. import plugin_registry as registry
from ..identity import UserLike, get_current_user, require_perm

router = APIRouter(prefix="/api/plugins", tags=["plugins"])


def _manifests() -> dict:
    """Discovered plugin manifests, read from the kernel catalog (`plugin_loader.PLUGIN_MANIFESTS`,
    computed once at import). Read here rather than from `modules` so this Core router never reaches UP
    into the composition seam (§2.1). Lazy import keeps it out of module-load order."""
    from ... import plugin_loader
    return plugin_loader.PLUGIN_MANIFESTS


def _active_now() -> set[str]:
    """The plugins actually mounted in THIS process (driven by ENABLED_MODULES at boot) — used to tell the
    UI when a registry change still needs a restart to take effect."""
    from ... import plugin_loader
    return plugin_loader.enabled_optional_modules()


# --- schemas ----------------------------------------------------------------------------------------

class PluginOut(BaseModel):
    id: str
    name: str
    version: str
    state: str                      # available | installed | enabled | disabled
    active_now: bool                # mounted in this running process?
    restart_required: bool          # desired state (enabled) ≠ active_now
    dependencies: list[str]
    permissions: list[str]


class InstallPlanOut(BaseModel):
    target: str
    unknown: bool
    order: list[str]                # target + transitive deps, dependency-first
    already_installed: list[str]    # satisfied — skipped (no duplicate install)
    to_install: list[str]           # what installing the target will add, in order


class ActionOut(BaseModel):
    plugins: list[PluginOut]
    restart_required: bool          # any plugin now differs from what's mounted → restart to apply


def _view(reg: dict[str, dict], active: set[str]) -> list[PluginOut]:
    out: list[PluginOut] = []
    for pid, mf in sorted(_manifests().items()):
        state = registry.state_of(reg, pid)
        is_active = pid in active
        out.append(PluginOut(
            id=pid, name=mf.name, version=mf.version, state=state,
            active_now=is_active,
            restart_required=(state == registry.ENABLED) != is_active,
            dependencies=list(mf.dependencies),
            permissions=list(mf.permissions),
        ))
    return out


def _action_response(reg: dict[str, dict]) -> ActionOut:
    view = _view(reg, _active_now())
    return ActionOut(plugins=view, restart_required=any(p.restart_required for p in view))


# --- read -------------------------------------------------------------------------------------------

@router.get("", response_model=list[PluginOut])
async def list_plugins(
    _: UserLike = Depends(get_current_user),
) -> list[PluginOut]:
    """Every discovered plugin + its registry state + whether it is mounted in this process."""
    return _view(registry.read(), _active_now())


@router.get("/{plugin_id}/install-plan", response_model=InstallPlanOut)
async def install_plan(
    plugin_id: str,
    _: UserLike = Depends(get_current_user),
) -> InstallPlanOut:
    """Resolve the dependency-request: what installing `plugin_id` adds (deps first), what is already
    satisfied (skipped). Lets the UI prompt "RAG also needs AI — install both?" and dedupe."""
    reg = registry.read()
    installed = {pid for pid in reg if registry.state_of(reg, pid) != registry.AVAILABLE}
    return InstallPlanOut(**registry.resolve_install_plan(plugin_id, _manifests(), installed))


# --- mutations (plugins.manage) ---------------------------------------------------------------------

def _require_known(plugin_id: str) -> None:
    if plugin_id not in _manifests():
        raise HTTPException(status_code=404, detail=f"unknown plugin '{plugin_id}'")


@router.post("/{plugin_id}/install", response_model=ActionOut)
async def install(
    plugin_id: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Install `plugin_id` and any missing dependencies (dependency-first), enabling each. Already-
    installed deps are left untouched (no duplicate install). Idempotent."""
    _require_known(plugin_id)
    reg = registry.read()
    installed = {pid for pid in reg if registry.state_of(reg, pid) != registry.AVAILABLE}
    plan = registry.resolve_install_plan(plugin_id, _manifests(), installed)
    for pid in plan["to_install"]:                       # deps first, target last (topo order)
        reg = registry.set_state(pid, registry.ENABLED,
                                       version=_manifests()[pid].version)
    return _action_response(reg)


@router.post("/{plugin_id}/enable", response_model=ActionOut)
async def enable(
    plugin_id: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Mark a plugin enabled (mounted on next restart). Data is kept."""
    _require_known(plugin_id)
    reg = registry.set_state(plugin_id, registry.ENABLED,
                                   version=_manifests()[plugin_id].version)
    return _action_response(reg)


@router.post("/{plugin_id}/disable", response_model=ActionOut)
async def disable(
    plugin_id: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Mark a plugin disabled — kept installed, data retained, unmounted on next restart."""
    _require_known(plugin_id)
    reg = registry.set_state(plugin_id, registry.DISABLED)
    return _action_response(reg)


@router.delete("/{plugin_id}", response_model=ActionOut)
async def uninstall(
    plugin_id: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Uninstall — forget the registry row (back to *available*). First cut keeps the plugin's tables
    (per-plugin down migration is P4); destructive table drop will gate on a typed-name confirm then."""
    _require_known(plugin_id)
    reg = registry.remove(plugin_id)
    return _action_response(reg)
