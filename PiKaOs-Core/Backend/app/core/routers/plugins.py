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

import json
import logging
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import git_installer, plugin_readiness
from .. import plugin_registry as registry
from ..contracts import POSTGRES_CONNECTION
from ..identity import UserLike, get_current_user, require_perm

log = logging.getLogger("pikaos.plugins.router")

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


class InstallFromGitIn(BaseModel):
    repoUrl: str
    ref: str | None = None          # a tag to pin to; None = the repo's default branch HEAD


class CheckUpdateOut(BaseModel):
    latestVersion: str | None
    hasUpdate: bool


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
            permissions=[p["key"] for p in mf.permissions],
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
    """Install `plugin_id` and any missing dependencies (dependency-first), enabling each — after every
    one of them passes the readiness gate (§2.3: dependency resolution + a `kind:tool` plugin's compose
    fragment merging cleanly). Already-installed deps are left untouched (no duplicate install).
    Idempotent."""
    _require_known(plugin_id)
    reg = registry.read()
    installed = {pid for pid in reg if registry.state_of(reg, pid) != registry.AVAILABLE}
    plan = registry.resolve_install_plan(plugin_id, _manifests(), installed)
    for pid in plan["to_install"]:
        result = plugin_readiness.check(pid, _manifests()[pid], _manifests())
        if not result.passed:
            raise HTTPException(status_code=422,
                                 detail=f"'{pid}' failed readiness: {'; '.join(result.reasons)}")
    for pid in plan["to_install"]:                       # deps first, target last (topo order)
        reg = registry.set_state(pid, registry.ENABLED,
                                       version=_manifests()[pid].version)
    return _action_response(reg)


@router.post("/install-from-git", response_model=ActionOut)
async def install_from_git(
    body: InstallFromGitIn,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Install a plugin straight from a git remote (install-from-git design §2.2). Clones `body.repoUrl`
    (optionally pinned to `body.ref`, a tag) into a staging dir — never straight into PLUGINS_DIR — then
    validates its manifest and runs the same readiness gate as `install()`, moves it into PLUGINS_DIR,
    registers it with the running process (no restart needed to see it), and marks it enabled with its
    git provenance. Any failure past the clone discards the staging/target dir — never a half-installed
    plugin on disk or in the registry (§2.2). Errors are generic: no raw filesystem path, git stderr, or
    stack trace ever reaches the client (rule 10)."""
    from ... import plugin_loader

    try:
        staging = git_installer.clone_to_staging(body.repoUrl, body.ref)
    except git_installer.GitInstallError as e:
        raise HTTPException(status_code=422, detail=str(e)) from e

    manifest_path = staging / "manifest.json"
    if not manifest_path.is_file():
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(status_code=422, detail="repository has no manifest.json at its root")
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(status_code=422, detail="repository's manifest.json is not valid JSON") from e
    pid = raw.get("id") if isinstance(raw, dict) else None
    # Validated against the loader's own id shape BEFORE it ever becomes part of a filesystem path —
    # `pid` is repo-controlled content, and `target_dir`/`shutil.move` below would otherwise let an
    # id like "../../../tmp/evil" escape PLUGINS_DIR entirely (path traversal). `_validate()` checks
    # this same shape too, but only *after* the move, which is too late to matter for this.
    if not isinstance(pid, str) or not plugin_loader._ID_RE.match(pid):
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(status_code=422, detail="manifest.json has no valid 'id'")

    target_dir = plugin_loader.PLUGINS_DIR / pid
    if target_dir.exists():
        shutil.rmtree(staging, ignore_errors=True)
        raise HTTPException(status_code=409, detail=f"plugin '{pid}' is already installed")

    plugin_loader.PLUGINS_DIR.mkdir(parents=True, exist_ok=True)
    shutil.move(str(staging), str(target_dir))
    try:
        manifest = plugin_loader._validate(pid, raw)
        candidate_manifests = {**_manifests(), pid: manifest}
        result = plugin_readiness.check(pid, manifest, candidate_manifests)
        if not result.passed:
            raise plugin_loader.ManifestError("; ".join(result.reasons))
    except plugin_loader.ManifestError as e:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=422, detail=str(e)) from e

    # Everything past this point still has to honour "never a half-installed plugin" (§2.2), even though
    # there's no ManifestError to catch here — `register_discovered` mutates in-process state and
    # `set_git_install` persists to the kernel-state JSON file, and either can raise on a genuinely
    # unexpected failure (e.g. a disk I/O error writing the registry). If that happens after
    # `register_discovered` already succeeded, the process would otherwise believe the plugin is loaded
    # while the registry disagrees — an inconsistent state that outlives the request. Roll back both the
    # in-process registration and the on-disk folder before surfacing a generic 500.
    try:
        plugin_loader.register_discovered(manifest)
        tag = body.ref or git_installer.latest_tag(body.repoUrl) or manifest.version
        reg = registry.set_git_install(pid, repo_url=body.repoUrl, tag=tag, version=manifest.version)
    except Exception as e:
        plugin_loader.deregister_discovered(pid)   # no-op if register_discovered never got that far
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="plugin install failed to finalize") from e
    return _action_response(reg)


def _require_git_installed(reg: dict[str, dict], plugin_id: str) -> None:
    """404 (not 422/generic-error fallthrough) for a plugin that wasn't installed via git — there's no
    remote to check/update against, and a `symlink` install's on-disk folder is a dev's sibling checkout
    that this endpoint must never touch."""
    if registry.installed_via(reg, plugin_id) != "git":
        raise HTTPException(status_code=404, detail="not a git-installed plugin")


def _revert_checkout(plugin_dir: Path, repo_url: str, tag: str | None) -> None:
    """Best-effort revert of `plugin_dir`'s on-disk checkout back to `tag` (the previously-installed,
    known-good version) after a failed update. `fetch_and_checkout` having already succeeded for the
    *new* tag means the working tree now holds code the manifest/readiness gate just rejected — leaving
    it there would mean the registry says one version while disk holds another, and a restart's
    `discover()` would find the bad manifest and refuse to boot at all (§3). `tag` is always set for a
    git-installed plugin (`set_git_install` always writes it); the None guard is defensive only.

    Best-effort: if the revert itself fails, the *original* update error is still what reaches the
    client (rule 10 — generic, no git detail) — this only logs so an operator can find a plugin stuck
    mid-update."""
    if not tag:
        return
    try:
        git_installer.fetch_and_checkout(plugin_dir, repo_url, tag)
    except Exception:
        # Broad on purpose (mirrors `clone_to_staging`'s pattern in git_installer.py): `_run_git` can
        # raise something other than `GitInstallError` (e.g. `subprocess.TimeoutExpired` if the
        # revert-time git call hangs) instead of surfacing as a clean error. This function is
        # explicitly best-effort — the original update error must still reach the client (rule 10) —
        # so any failure here, of any kind, gets logged and swallowed rather than propagated.
        log.error("plugin '%s': failed to revert checkout back to '%s' after a failed update — "
                   "on-disk code may not match the registry", plugin_dir.name, tag)


@router.get("/{plugin_id}/check-update", response_model=CheckUpdateOut)
async def check_update(
    plugin_id: str,
    _: UserLike = Depends(get_current_user),
) -> CheckUpdateOut:
    """On-demand only (no background polling, §2.2) — compares the highest remote semver tag to the
    installed version. 404 if the plugin wasn't installed via git (nothing to check against)."""
    _require_known(plugin_id)
    reg = registry.read()
    _require_git_installed(reg, plugin_id)
    repo_url = registry.repo_url_of(reg, plugin_id)
    latest = git_installer.latest_tag(repo_url) if repo_url else None
    current = _manifests()[plugin_id].version
    has_update = bool(latest and latest.lstrip("v") != current.lstrip("v"))
    return CheckUpdateOut(latestVersion=latest, hasUpdate=has_update)


@router.post("/{plugin_id}/update", response_model=ActionOut)
async def update(
    plugin_id: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Fetch + check out the latest tag, re-validate the manifest + readiness, apply on the existing
    restart-to-apply model. 404 if not git-installed.

    Failure discipline mirrors `install_from_git` (§2.2), extended for the fact that — unlike a fresh
    install — there IS a previously-good on-disk version here: a failure that happens *after* the new
    tag is actually checked out (bad manifest, failed readiness, or a registry-persistence error) reverts
    the working tree back to the tag that was installed before this call, via `_revert_checkout`, rather
    than discarding it (there's nothing to discard back to — this plugin already existed). A failure in
    `fetch_and_checkout` itself needs no revert: git only mutates the working tree on a successful
    checkout, so the old version is still exactly what's on disk."""
    from ... import plugin_loader

    _require_known(plugin_id)
    reg = registry.read()
    _require_git_installed(reg, plugin_id)
    repo_url = registry.repo_url_of(reg, plugin_id)
    old_tag = registry.installed_tag_of(reg, plugin_id)
    old_manifest = _manifests()[plugin_id]

    tag = git_installer.latest_tag(repo_url) if repo_url else None
    if not tag:
        raise HTTPException(status_code=422, detail="no update available")

    plugin_dir = plugin_loader.PLUGINS_DIR / plugin_id
    try:
        git_installer.fetch_and_checkout(plugin_dir, repo_url, tag)
    except git_installer.GitInstallError as e:
        raise HTTPException(status_code=422, detail="could not fetch the update") from e

    manifest_path = plugin_dir / "manifest.json"
    try:
        raw = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeDecodeError) as e:
        _revert_checkout(plugin_dir, repo_url, old_tag)
        raise HTTPException(status_code=422, detail="update's manifest.json is not valid JSON") from e

    try:
        manifest = plugin_loader._validate(plugin_id, raw)
        candidate = {**_manifests(), plugin_id: manifest}
        result = plugin_readiness.check(plugin_id, manifest, candidate)
        if not result.passed:
            raise plugin_loader.ManifestError("; ".join(result.reasons))
    except plugin_loader.ManifestError as e:
        _revert_checkout(plugin_dir, repo_url, old_tag)
        raise HTTPException(status_code=422, detail=str(e)) from e

    # Same rationale as install_from_git's rollback (§2.2): `register_discovered` mutates in-process
    # state and `set_git_install` persists to the kernel-state JSON file; either can raise on a genuinely
    # unexpected failure. Unlike a fresh install there's a known-good prior state to restore to, so the
    # revert here restores BOTH the in-process manifest (back to `old_manifest`) and the on-disk checkout
    # (back to `old_tag`) rather than tearing the plugin down.
    try:
        plugin_loader.register_discovered(manifest)
        reg = registry.set_git_install(plugin_id, repo_url=repo_url, tag=tag, version=manifest.version)
    except Exception as e:
        plugin_loader.register_discovered(old_manifest)
        _revert_checkout(plugin_dir, repo_url, old_tag)
        raise HTTPException(status_code=500, detail="plugin update failed to finalize") from e
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
    """Uninstall: for a git-installed plugin, deletes its on-disk code entirely and moves it to
    PENDING_PURGE (registry keeps `repoUrl` so Purge can still find it) — DB tables are untouched.
    For a dev-symlinked plugin (unchanged, first-cut behavior): forgets the registry row only, code
    stays (it's the dev's own sibling checkout)."""
    from ... import plugin_loader

    _require_known(plugin_id)
    reg = registry.read()
    if registry.installed_via(reg, plugin_id) == "git":
        shutil.rmtree(plugin_loader.PLUGINS_DIR / plugin_id, ignore_errors=True)
        reg = registry.uninstall_git(plugin_id)
        return _action_response(reg)
    reg = registry.remove(plugin_id)
    return _action_response(reg)


@router.post("/{plugin_id}/purge", response_model=ActionOut)
async def purge(
    plugin_id: str,
    request: Request,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Destructive, separate from Uninstall (§8/§9): only for a plugin already PENDING_PURGE (its code
    is already gone — Uninstall must run first). Resolves the DB engine off the postgres Tool's
    `postgres.Connection` binding and calls the plugin's optional `purge(engine)` export to drop its own
    tables, then forgets it for good (manifest + registry). A plugin without a `purge` export can't be
    purged yet — clear 422, not a silent no-op. A `purge_fn` that itself raises (a buggy drop_all) leaves
    the plugin PENDING_PURGE so it can be retried — it is never treated as success."""
    import importlib

    from ... import plugin_loader

    reg = registry.read()
    if registry.state_of(reg, plugin_id) != registry.PENDING_PURGE:
        raise HTTPException(status_code=422, detail=f"'{plugin_id}' is not pending purge")

    conn = request.app.state.container.resolve(POSTGRES_CONNECTION)
    if not conn or not conn.get("engine"):
        raise HTTPException(status_code=503,
                             detail="the postgres tool is not enabled — cannot purge without a DB engine")

    # `uninstall()` already deleted this plugin's on-disk folder before Purge is ever reachable (its
    # design, above) — if this process never imported the package before (install-from-git → uninstall →
    # purge in one session, or a restart happened between uninstall and a retried purge), the code this
    # import would need is simply gone. Guarded on its own, separate from `purge_fn(...)`'s try/except
    # below: an import failure here is "can't even find the hook", not "the hook itself misbehaved".
    try:
        mod = importlib.import_module(f"app.plugins.{plugin_id}")
    except (ModuleNotFoundError, ImportError) as e:
        raise HTTPException(status_code=422,
                             detail=f"'{plugin_id}' has no importable code left — its purge() hook "
                                    f"cannot be resolved") from e
    purge_fn = getattr(mod, "purge", None)
    if purge_fn is None:
        raise HTTPException(status_code=422,
                             detail=f"'{plugin_id}' does not declare a purge() hook — its data cannot be dropped yet")
    try:
        purge_fn(conn["engine"])
    except Exception as e:
        # A buggy plugin's purge() failing partway must never be mistaken for success — leave the
        # registry PENDING_PURGE (retryable) rather than deregistering an only-partially-dropped plugin.
        log.exception("plugin '%s': purge() hook failed", plugin_id)
        raise HTTPException(status_code=500, detail="plugin purge failed") from e

    plugin_loader.deregister_discovered(plugin_id)
    reg = registry.purge_complete(plugin_id)
    return _action_response(reg)
