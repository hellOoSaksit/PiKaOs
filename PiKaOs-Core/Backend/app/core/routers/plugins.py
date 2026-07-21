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
import re
import shutil
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from .. import audit, git_installer, notify, plugin_readiness
from .. import plugin_registry as registry
from ..contracts import POSTGRES_CONNECTION
from ..identity import UserLike, get_current_user, require_perm

log = logging.getLogger("pikaos.plugins.router")

# A git host: labels of alnum/hyphen joined by dots, optional :port. Rejects an embedded credential
# (`user:tok@host`), a path, or whitespace — none of which is a host, and all of which would otherwise
# be stored as one and written to the audit trail.
_HOST_RE = re.compile(r"^[A-Za-z0-9]([A-Za-z0-9-]{0,62})(\.[A-Za-z0-9]([A-Za-z0-9-]{0,62}))*(:[0-9]{1,5})?$")

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
    permissions: list[str]          # flat key list (unchanged — kept for existing callers)
    permissionInfo: list[dict] = [] # per-permission {key, name, rationale} for the install-confirm UI
    description: str = ""
    icon: str | None = None
    repoUrl: str | None = None      # None for a dev-symlinked plugin — no remote to show/check-update against
    installedVia: str = "symlink"   # "symlink" (dev sibling checkout) | "git" (install-from-git / update)
    installedSha: str | None = None # W2: the immutable commit pin for a git-installed plugin


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
    ref: str | None = None          # a tag/ref to pin to; None = resolve the latest release tag (W1)
    allowHead: bool = False         # opt-in escape hatch: install a tagless repo's default-branch HEAD


class CheckUpdateOut(BaseModel):
    latestVersion: str | None
    hasUpdate: bool
    tagMoved: bool = False           # W2: the INSTALLED tag's remote commit no longer matches our pin


class GitCredentialIn(BaseModel):
    token: str


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
            permissionInfo=[{"key": p["key"],
                             "name": p.get("name_en") or p["key"],
                             "name_th": p.get("name_th") or "",
                             "rationale": p.get("rationale", "")} for p in mf.permissions],
            description=mf.description, icon=mf.icon,
            repoUrl=registry.repo_url_of(reg, pid),
            installedVia=registry.installed_via(reg, pid),
            installedSha=registry.installed_sha_of(reg, pid),
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


def _require_not_pending_purge(reg: dict[str, dict], plugin_id: str) -> None:
    """Reject any mutation on a plugin currently PENDING_PURGE — the two-step destructive lifecycle
    (Uninstall → Purge, §8/§9) only lets `install-from-git` (a fresh install, moot for an id that's
    already pending purge) and `purge()` itself act on it. Everything else — `enable`/`disable`/`update`
    — must refuse: flipping the state away from PENDING_PURGE would make `purge()`'s own
    `state_of(...) == PENDING_PURGE` check permanently unreachable, orphaning that plugin's DB tables
    with no path left to drop them (final-review Finding 1). Mirrors `purge()`'s own check, inverted."""
    if registry.state_of(reg, plugin_id) == registry.PENDING_PURGE:
        raise HTTPException(status_code=422,
                             detail=f"'{plugin_id}' is pending purge — purge it (or nothing else) first")


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
    audit.log(audit.actor_of(user), "plugin.install", plugin_id)
    notify.emit("plugin", "notif.plugin.installed", {"plugin": plugin_id})
    return _action_response(reg)


@router.post("/install-from-git", response_model=ActionOut)
async def install_from_git(
    body: InstallFromGitIn,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Install a plugin straight from a git remote (install-from-git design §2.2). Clones `body.repoUrl`
    (optionally pinned to `body.ref`, a tag) into a staging dir — never straight into PLUGINS_DIR — then
    validates its manifest and runs the same readiness gate as `install()`, moves it into PLUGINS_DIR,
    and marks it enabled with its git provenance. The plugin becomes VISIBLE (list/enable/update) only
    after the next restart's `discover()` — restart-to-apply, same as router mounting (B3-H2: an
    in-process registration would be one worker's private state; under `--workers N` the other workers
    would never see it). Any failure past the clone discards the staging/target dir — never a
    half-installed plugin on disk or in the registry (§2.2). Errors are generic: no raw filesystem path,
    git stderr, or stack trace ever reaches the client (rule 10)."""
    from ... import plugin_loader

    # W1 — resolve the ref to install. An explicit `ref` is honoured as-is. With no ref we pin the
    # latest release TAG rather than the moving default-branch HEAD (installing `main` is the supply-
    # chain risk the policy forbids, marketplace.md W1). A repo with no release tag is refused unless
    # the caller explicitly opts into a HEAD install (`allowHead`) — the dev escape hatch.
    ref = body.ref
    if ref is None:
        ref = git_installer.latest_tag(body.repoUrl)
        if ref is None and not body.allowHead:
            raise HTTPException(
                status_code=422,
                detail="repository has no release tag to pin to — publish a semver tag, or set "
                       "allowHead to install its default branch (unpinned, not recommended)")

    try:
        staging = git_installer.clone_to_staging(body.repoUrl, ref)   # ref None ⇒ default HEAD (allowHead)
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
    # there's no ManifestError to catch here — `set_git_install` persists to the kernel-state JSON file
    # and can raise on a genuinely unexpected failure (e.g. a disk I/O error writing the registry). Roll
    # back the on-disk folder before surfacing a generic 500; there is no in-process registration to
    # undo (B3-H2: visibility is restart-to-apply).
    try:
        sha = git_installer.head_sha(target_dir)             # W2: pin the immutable commit
        tag = ref or manifest.version                         # ref is the resolved tag (or None ⇒ HEAD)
        reg = registry.set_git_install(pid, repo_url=body.repoUrl, tag=tag,
                                       version=manifest.version, sha=sha)
    except Exception as e:
        shutil.rmtree(target_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail="plugin install failed to finalize") from e
    out = _action_response(reg)
    # `_view` renders only discovered manifests — the plugin just installed isn't among them until the
    # restart, so its own pending visibility is what makes a restart required, not any row's flag.
    out.restart_required = True
    audit.log(audit.actor_of(user), "plugin.install_git", pid, {"tag": tag or "HEAD"})
    notify.emit("plugin", "notif.plugin.installed", {"plugin": pid})
    return out


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

    # W2 tamper check: if we recorded a commit SHA at install/update, re-resolve the INSTALLED tag's
    # current remote SHA and flag a mismatch — the tag was force-moved to a different commit after we
    # pinned it. Skipped (never a false alarm) for a legacy row with no recorded SHA.
    tag_moved = False
    pinned_sha = registry.installed_sha_of(reg, plugin_id)
    installed_tag = registry.installed_tag_of(reg, plugin_id)
    if repo_url and pinned_sha and installed_tag:
        current_remote_sha = git_installer.remote_tag_sha(repo_url, installed_tag)
        tag_moved = bool(current_remote_sha and current_remote_sha != pinned_sha)

    return CheckUpdateOut(latestVersion=latest, hasUpdate=has_update, tagMoved=tag_moved)


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
    _require_not_pending_purge(reg, plugin_id)
    _require_git_installed(reg, plugin_id)
    repo_url = registry.repo_url_of(reg, plugin_id)
    old_tag = registry.installed_tag_of(reg, plugin_id)

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

    # Same rationale as install_from_git's rollback (§2.2): `set_git_install` persists to the
    # kernel-state JSON file and can raise on a genuinely unexpected failure. Unlike a fresh install
    # there's a known-good prior state to restore to, so the revert puts the on-disk checkout back on
    # `old_tag` rather than tearing the plugin down. The in-process manifest was never touched (B3-H2:
    # the running code — and every worker's catalog — stays on the old version until the restart).
    try:
        sha = git_installer.head_sha(plugin_dir)             # W2: re-pin to the updated tag's commit
        reg = registry.set_git_install(plugin_id, repo_url=repo_url, tag=tag,
                                       version=manifest.version, sha=sha)
    except Exception as e:
        _revert_checkout(plugin_dir, repo_url, old_tag)
        raise HTTPException(status_code=500, detail="plugin update failed to finalize") from e
    out = _action_response(reg)
    # the updated code isn't running (and `_view` still shows the old manifest) until the restart
    out.restart_required = True
    audit.log(audit.actor_of(user), "plugin.update", plugin_id, {"tag": tag})
    notify.emit("plugin", "notif.plugin.updated", {"plugin": plugin_id, "tag": tag})
    return out


@router.post("/{plugin_id}/enable", response_model=ActionOut)
async def enable(
    plugin_id: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Mark a plugin enabled (mounted on next restart). Data is kept."""
    _require_known(plugin_id)
    reg = registry.read()
    _require_not_pending_purge(reg, plugin_id)
    reg = registry.set_state(plugin_id, registry.ENABLED,
                                   version=_manifests()[plugin_id].version)
    audit.log(audit.actor_of(user), "plugin.enable", plugin_id)
    return _action_response(reg)


@router.post("/{plugin_id}/disable", response_model=ActionOut)
async def disable(
    plugin_id: str,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> ActionOut:
    """Mark a plugin disabled — kept installed, data retained, unmounted on next restart."""
    _require_known(plugin_id)
    reg = registry.read()
    _require_not_pending_purge(reg, plugin_id)
    reg = registry.set_state(plugin_id, registry.DISABLED)
    audit.log(audit.actor_of(user), "plugin.disable", plugin_id)
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
        audit.log(audit.actor_of(user), "plugin.uninstall", plugin_id)
        notify.emit("plugin", "notif.plugin.removed", {"plugin": plugin_id})
        return _action_response(reg)
    reg = registry.remove(plugin_id)
    audit.log(audit.actor_of(user), "plugin.uninstall", plugin_id)
    notify.emit("plugin", "notif.plugin.removed", {"plugin": plugin_id})
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
    audit.log(audit.actor_of(user), "plugin.purge", plugin_id)
    return _action_response(reg)


@router.put("/git-credentials/{host}")
async def set_git_credential(
    host: str,
    body: GitCredentialIn,
    user: UserLike = Depends(require_perm("plugins.manage")),
) -> dict:
    """Store an encrypted git credential (PAT/deploy key) for `host` (§2.4) — used by install-from-git /
    check-update / update to authenticate against a private repo on that host. Write-only: the token is
    never echoed back here, and no read endpoint in this router (e.g. `list_plugins`/`PluginOut`) ever
    surfaces a stored credential, encrypted or not."""
    # Validate the host shape at the edge (rule 10): it is a path param that becomes both a storage key
    # and an audit target, so a value like `user:tok@github.com` must not be accepted as a "host".
    if not _HOST_RE.match(host):
        raise HTTPException(status_code=422, detail="invalid host")
    git_installer.set_credential(host, body.token)
    audit.log(audit.actor_of(user), "gitcred.set", host)   # host only — the token never enters the trail
    return {"ok": True}
