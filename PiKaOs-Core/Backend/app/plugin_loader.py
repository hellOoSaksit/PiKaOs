"""Plugin loader — the manifest-driven seam (plugin-architecture.md §3–§4).

Discovers every `app/plugins/<id>/manifest.json`, validates it (structural shape + the cross-field rules
a JSON Schema can't express: id == folder, namespacing, `coreVersion` compatibility), and exposes the
**topological boot order** so a plugin always loads after its `dependencies`. The full JSON Schema lives
beside the plugins (`app/plugins/manifest.schema.json`) and is the Phase-2 CI gate (ajv); this module is
the **runtime** Loader that refuses boot on a bad manifest.

Scope (Phase 1): discover → validate → topological order → import the plugin's `router`. The richer
lifecycle (`register()/boot()` + DI + Event Bus) lands in Phase 3; only the Base (infra/core/engine) is
hardcoded in `modules.py` — every *feature* is a manifest plugin here.
"""
from __future__ import annotations

import importlib
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

from fastapi import APIRouter

from .config import settings

PLUGINS_DIR = Path(__file__).parent / "plugins"
_ID_RE = re.compile(r"^[a-z][a-z0-9-]*$")
_REQUIRED = ("id", "name", "version", "coreVersion")


class ManifestError(Exception):
    """A manifest is invalid or the dependency graph is broken — the Loader refuses boot (§3/§4)."""


@dataclass(frozen=True)
class Manifest:
    id: str
    name: str
    version: str
    coreVersion: str
    dependencies: tuple[str, ...] = ()
    provides: tuple[str, ...] = ()
    consumes: tuple[str, ...] = ()
    permissions: tuple[str, ...] = ()
    routes: tuple[str, ...] = ()
    raw: dict = field(default_factory=dict)


# --- semver (minimal: exact · "*" · caret "^X.Y.Z", incl. 0.x rules) --------------------------------

def _parse(v: str) -> tuple[int, int, int]:
    core = v.split("-", 1)[0].split("+", 1)[0]
    parts = (core.split(".") + ["0", "0", "0"])[:3]
    return tuple(int(p) for p in parts)  # type: ignore[return-value]


def _satisfies(version: str, spec: str) -> bool:
    """Does `version` satisfy the range `spec`? Supports `*`, an exact `X.Y.Z`, and caret `^X.Y.Z`
    (with semver's 0.x rule: ^0.1.z = >=0.1.z <0.2.0; ^0.0.z = exactly 0.0.z)."""
    spec = spec.strip()
    if spec in ("", "*"):
        return True
    v = _parse(version)
    if spec.startswith("^"):
        lo = _parse(spec[1:])
        if v < lo:
            return False
        maj, mnr, _ = lo
        if maj > 0:
            return v[0] == maj
        if mnr > 0:
            return v[0] == 0 and v[1] == mnr
        return v == lo  # ^0.0.z = pinned
    return v == _parse(spec)  # bare version = exact


# --- discovery + validation -------------------------------------------------------------------------

def _validate(folder: str, raw: dict) -> Manifest:
    for key in _REQUIRED:
        if not raw.get(key):
            raise ManifestError(f"plugin '{folder}': manifest missing required field '{key}'")
    pid = raw["id"]
    if not _ID_RE.match(pid):
        raise ManifestError(f"plugin '{folder}': id '{pid}' must match {_ID_RE.pattern}")
    if pid != folder:
        raise ManifestError(f"plugin '{folder}': id '{pid}' must equal its folder name")
    if not _satisfies(settings.app_version, raw["coreVersion"]):
        raise ManifestError(
            f"plugin '{pid}': coreVersion '{raw['coreVersion']}' excludes the running Core "
            f"{settings.app_version} — refusing to load")
    # §6 namespacing: every registered key is prefixed with the id
    prefix = f"{pid}."
    for kind in ("permissions", "provides"):
        for k in raw.get(kind, []):
            if not k.startswith(prefix):
                raise ManifestError(f"plugin '{pid}': {kind} key '{k}' is not prefixed with '{prefix}'")
    for ev in raw.get("events", {}).get("emits", []):
        if not ev.startswith(prefix):
            raise ManifestError(f"plugin '{pid}': emitted event '{ev}' is not prefixed with '{prefix}'")
    # §6 namespacing for routes: every declared path must carry the id as a segment (e.g. /api/knowledge),
    # so two plugins can never collide on a URL prefix.
    for route in raw.get("routes", []):
        if f"/{pid}" not in route:
            raise ManifestError(
                f"plugin '{pid}': route '{route}' is not namespaced with '/{pid}' (§6)")
    return Manifest(
        id=pid, name=raw["name"], version=raw["version"], coreVersion=raw["coreVersion"],
        dependencies=tuple(raw.get("dependencies", [])),
        provides=tuple(raw.get("provides", [])), consumes=tuple(raw.get("consumes", [])),
        permissions=tuple(raw.get("permissions", [])), routes=tuple(raw.get("routes", [])),
        raw=raw,
    )


def discover() -> dict[str, Manifest]:
    """Read + validate every `app/plugins/<id>/manifest.json`. Returns {id: Manifest}. A malformed
    manifest is a hard failure (§3) — better to refuse boot than serve a half-wired build."""
    found: dict[str, Manifest] = {}
    if not PLUGINS_DIR.is_dir():
        return found
    for child in sorted(PLUGINS_DIR.iterdir()):
        mf = child / "manifest.json"
        if not mf.is_file():
            continue
        try:
            raw = json.loads(mf.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            raise ManifestError(f"plugin '{child.name}': manifest.json is not valid JSON — {e}") from e
        found[child.name] = _validate(child.name, raw)
    # every hard dependency must resolve to a known plugin (§4)
    for m in found.values():
        for dep in m.dependencies:
            if dep not in found:
                raise ManifestError(f"plugin '{m.id}': dependency '{dep}' is not an installed plugin")
    return found


def topo_order(ids: set[str], manifests: dict[str, Manifest]) -> list[str]:
    """Topologically sort `ids` so each plugin comes after its `dependencies` (§4). A cycle is a hard
    failure. Ties broken alphabetically for a deterministic, reproducible boot order."""
    order: list[str] = []
    visiting: set[str] = set()
    done: set[str] = set()

    def visit(pid: str, trail: tuple[str, ...]) -> None:
        if pid in done:
            return
        if pid in visiting:
            cycle = " → ".join(trail + (pid,))
            raise ManifestError(f"plugin dependency cycle: {cycle}")
        visiting.add(pid)
        for dep in sorted(manifests[pid].dependencies):
            if dep in ids:  # only order among the enabled set
                visit(dep, trail + (pid,))
        visiting.discard(pid)
        done.add(pid)
        order.append(pid)

    for pid in sorted(ids):
        visit(pid, ())
    return order


def load_router(plugin_id: str) -> APIRouter:
    """Import an enabled plugin's package and return its `router` (Phase 1 entrypoint). A disabled
    plugin is never imported — the litmus of removability (§2.2)."""
    mod = importlib.import_module(f"app.plugins.{plugin_id}")
    router = getattr(mod, "router", None)
    if router is None:
        raise ManifestError(f"plugin '{plugin_id}': package exports no `router`")
    return router


# --- lifecycle: register() → boot() + job contribution (Phase 3, §5/§10) ----------------------------
#
# A plugin package MAY export, in addition to `router`:
#   register(ctx)  — bind its provided contracts into ctx.container (NO cross-plugin calls yet, §10)
#   boot(ctx)      — subscribe to events / wire listeners, in dependency order (§10)
#   jobs           — a list of arq job callables the worker should run when this plugin is enabled
# All optional: a pure-router plugin (like knowledge today for routes) needs none of them.


@dataclass
class PluginContext:
    """What a plugin's register()/boot() receives — the Core seams it may use, never each other (§5).
    `container` for DI, `events` for the bus, `session_factory` for DB sessions, `settings` for config."""

    container: object
    events: object
    session_factory: object = None
    settings: object = None


def _import_enabled(enabled: set[str], manifests: dict[str, Manifest]):
    """Yield (plugin_id, module) for the enabled plugins in topological order — the one place a plugin
    package is imported. Dynamic (importlib) on purpose: Core never *statically* imports a plugin, so the
    import-linter `Core ↛ plugins` gate stays clean (§15)."""
    for pid in topo_order(enabled, manifests):
        yield pid, importlib.import_module(f"app.plugins.{pid}")


def collect_jobs(enabled: set[str], manifests: dict[str, Manifest]) -> list:
    """The arq job callables contributed by the enabled plugins (their `jobs` attribute). Pure discovery
    — imports the packages but runs no register()/boot(), so it is safe at worker import time."""
    jobs: list = []
    for _pid, mod in _import_enabled(enabled, manifests):
        jobs.extend(getattr(mod, "jobs", ()))
    return jobs


def register_plugins(enabled: set[str], manifests: dict[str, Manifest], ctx: PluginContext) -> list[str]:
    """Run the lifecycle for the enabled plugins (topological): `register()` ALL first (bind contracts),
    then `boot()` ALL (wire listeners) — the kit's two-pass order so a plugin can resolve a sibling's
    contract in boot() that was bound in any register() (§10). Returns the boot order for logging."""
    loaded = list(_import_enabled(enabled, manifests))
    for _pid, mod in loaded:
        register = getattr(mod, "register", None)
        if register is not None:
            register(ctx)
    for _pid, mod in loaded:
        boot = getattr(mod, "boot", None)
        if boot is not None:
            boot(ctx)
    return [pid for pid, _ in loaded]
