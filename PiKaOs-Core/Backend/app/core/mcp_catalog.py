"""Reflect the FastAPI route table into MCP tool descriptors.

Core already mounts every plugin's router into one app (`modules.register_routers`), so one reflection
here exposes Core's and every plugin's surface — a plugin ships no MCP code, and an installed plugin's
tools simply appear.

Pure: takes an app, returns descriptors. No I/O, no HTTP — those live in `routers/mcp.py`, so this
stays unit-testable against a throwaway app.

**Enumerating routes.** Since FastAPI 0.137 (PR #15745) `include_router` no longer copies child routes
into `app.routes`; it appends one lazy `_IncludedRouter` wrapper, so `app.routes` is a tree and its
entries may carry no `.path` at all. Upstream calls `router.routes` an internal implementation detail
— naively walking it is what broke OpenTelemetry, Elastic APM and prometheus-fastapi-instrumentator on
that release. We therefore flatten with `_iter_routes_with_context`, the *same* helper
`fastapi.openapi.utils.get_openapi` uses, so this catalog and the OpenAPI document it reads schemas
from can never disagree about which routes exist. It is private, so `_iter_routes` degrades to a plain
scan if a future version drops it — and `test_mcp_router.py`'s real-app canary fails loudly if the
catalog ever comes back empty.
"""
from __future__ import annotations

import re
from collections.abc import Iterator
from dataclasses import dataclass, replace

from fastapi import FastAPI
from fastapi.routing import APIRoute

from . import kernel_state

try:  # FastAPI >= 0.137 — the tree walk that OpenAPI generation itself uses
    from fastapi.routing import _iter_routes_with_context
except ImportError:  # pragma: no cover — pre-0.137, or a version that renamed it
    _iter_routes_with_context = None

EFFECT_READ = "read"
EFFECT_IDEMPOTENT_WRITE = "idempotent_write"
EFFECT_SIDE_EFFECT = "side_effect"

# Pessimistic on purpose. POST is often idempotent in practice, but guessing wrong this way costs one
# extra consent prompt, while guessing wrong the other way silently replays a destructive call on
# resume. Mirrors agent_runner.classify_effect, whose default for the unknown is also side_effect.
EFFECT_BY_METHOD: dict[str, str] = {
    "GET": EFFECT_READ,
    "HEAD": EFFECT_READ,
    "PUT": EFFECT_IDEMPOTENT_WRITE,
    "PATCH": EFFECT_IDEMPOTENT_WRITE,
    "POST": EFFECT_SIDE_EFFECT,
    "DELETE": EFFECT_SIDE_EFFECT,
}

_TOOL_PREFIX = "pikaos"
_CORE_OWNER = "core"
_NON_METHODS = frozenset({"HEAD", "OPTIONS"})
_UNSAFE = re.compile(r"[^a-z0-9]+")

_EFFECTS = frozenset(EFFECT_BY_METHOD.values())

# The operator's explicit opt-in list, in kernel local-JSON (the kernel keeps no tables of its own).
# `{tool_name: {"effect": <override>}}` — presence is the grant; the value only tunes it.
# RESERVED in git_installer.RESERVED_SETTINGS_KEYS: widening what an external AI may invoke is
# `plugins.manage` authority, so the generic settings KV must never reach it (K4).
ALLOWLIST_KEY = "mcp_allowlist"


@dataclass(frozen=True)
class ToolDescriptor:
    name: str
    description: str
    input_schema: dict
    method: str
    path: str
    permission: str
    effect: str


def _iter_routes(app: FastAPI) -> Iterator[object]:
    """Every routable operation, flattened, each already carrying its *effective* path.

    A route reached through `include_router(prefix=...)` keeps the unprefixed `route.path`; only the
    context knows the mounted path (and the router-level dependencies). Yield the context when there
    is one — it exposes the same `path` / `methods` / `dependant` surface as the route itself.
    """
    if _iter_routes_with_context is None:  # pragma: no cover — fallback for a version without it
        yield from (r for r in app.routes if isinstance(r, APIRoute))
        return
    for route, context in _iter_routes_with_context(app.routes):
        if isinstance(route, APIRoute):
            yield context if context is not None else route


def _permission_of(operation) -> str | None:
    """The permission this operation enforces, or None if it enforces none. Walks the dependency tree:
    a plugin may guard at router level rather than per-route."""

    def walk(dependant) -> str | None:
        perm = getattr(dependant.call, "required_perm", None)
        if perm:
            return perm
        for sub in dependant.dependencies:
            found = walk(sub)
            if found:
                return found
        return None

    return walk(operation.dependant)


def _owner_and_rest(path: str) -> tuple[str, list[str]]:
    """`/api/knowledge/documents/{doc_id}` -> ("knowledge", ["documents", "doc_id"]).

    Every plugin route is namespaced with its id (plugin_loader enforces §6), so the segment after
    `/api` names the owner. Core's own routes have no plugin id there — they answer to `core`."""
    segments = [s for s in path.strip("/").split("/") if s]
    if segments and segments[0] == "api":
        segments = segments[1:]
    if not segments:
        return _CORE_OWNER, []
    return segments[0], segments[1:]


def _slug(parts: list[str]) -> str:
    cleaned = [_UNSAFE.sub("_", p.strip("{}").lower()).strip("_") for p in parts]
    return "_".join(p for p in cleaned if p)


def _tool_name(method: str, path: str, method_is_ambiguous: bool) -> str:
    """Derived from the path, never from the Python function name — a rename must not silently break
    a saved client config. The method is prefixed only where one path serves several, so the common
    case stays readable."""
    owner, rest = _owner_and_rest(path)
    slug = _slug(rest) or "index"
    if method_is_ambiguous:
        slug = f"{method.lower()}_{slug}"
    return f"{_TOOL_PREFIX}.{owner}.{slug}"


def _deref(schema: dict, spec: dict) -> dict:
    """Inline a top-level `$ref` — an MCP client receives the tool schema alone, with no document to
    resolve `#/components/...` against."""
    ref = schema.get("$ref")
    if not ref or not ref.startswith("#/"):
        return schema
    node: object = spec
    for part in ref[2:].split("/"):
        if not isinstance(node, dict):
            return schema
        node = node.get(part, {})
    return node if isinstance(node, dict) else schema


def _input_schema(spec: dict, path: str, method: str) -> tuple[dict, str]:
    """(JSON Schema of the operation's inputs, description) — both read out of the OpenAPI document
    FastAPI already generates, so a plugin gets correct schemas without writing any."""
    operation = spec.get("paths", {}).get(path, {}).get(method.lower(), {})
    properties: dict = {}
    required: list[str] = []
    for param in operation.get("parameters", []):
        properties[param["name"]] = param.get("schema", {})
        if param.get("required"):
            required.append(param["name"])
    body = (operation.get("requestBody", {})
            .get("content", {})
            .get("application/json", {})
            .get("schema"))
    if body:
        properties["body"] = _deref(body, spec)
        required.append("body")
    schema: dict = {"type": "object", "properties": properties}
    if required:
        schema["required"] = required
    description = operation.get("summary") or operation.get("description") or path
    return schema, description


def build_catalog(app: FastAPI) -> list[ToolDescriptor]:
    """Every exposable route as a tool descriptor. A route enforcing no permission is omitted: a
    surface an LLM can reach without authorization is a bug, not a feature.

    WebSocket routes and static mounts are not `APIRoute`s and are skipped by construction."""
    operations = list(_iter_routes(app))
    methods_per_path: dict[str, set[str]] = {}
    for op in operations:
        methods_per_path.setdefault(op.path, set()).update(op.methods - _NON_METHODS)

    spec = app.openapi()   # generated once; FastAPI caches it on the app anyway
    out: list[ToolDescriptor] = []
    for op in operations:
        permission = _permission_of(op)
        if not permission:
            continue
        for method in sorted(op.methods - _NON_METHODS):
            schema, description = _input_schema(spec, op.path, method)
            out.append(ToolDescriptor(
                name=_tool_name(method, op.path, len(methods_per_path[op.path]) > 1),
                description=description,
                input_schema=schema,
                method=method,
                path=op.path,
                permission=permission,
                effect=EFFECT_BY_METHOD.get(method, EFFECT_SIDE_EFFECT),
            ))
    return out


def read_allowlist() -> dict[str, dict]:
    """The operator's allowlist, or `{}` — which exposes nothing. A corrupt or hand-edited file that
    is not an object fails closed rather than crashing open."""
    value = kernel_state.read_json(ALLOWLIST_KEY, {})
    if not isinstance(value, dict):
        return {}
    return {name: entry for name, entry in value.items() if isinstance(entry, dict)}


def write_allowlist(entries: dict[str, dict]) -> dict[str, dict]:
    """Replace the allowlist wholesale. Callers are guarded by `plugins.manage` (routers/mcp.py)."""
    normalized = {name: (entry if isinstance(entry, dict) else {}) for name, entry in entries.items()}
    kernel_state.write_json(ALLOWLIST_KEY, normalized)
    return normalized


def _with_override(tool: ToolDescriptor, entry: dict) -> ToolDescriptor:
    """Apply the operator's effect override, if any. An unrecognized value is not a reason to relax:
    it falls to the safe class rather than to the method default the operator was trying to change."""
    override = entry.get("effect")
    if override is None:
        return tool
    return replace(tool, effect=override if override in _EFFECTS else EFFECT_SIDE_EFFECT)


def allowed_tools(app: FastAPI) -> list[ToolDescriptor]:
    """Catalog ∩ allowlist, effect overrides applied. Deny by default: an empty allowlist yields []."""
    allowlist = read_allowlist()
    return [_with_override(t, allowlist[t.name]) for t in build_catalog(app) if t.name in allowlist]
