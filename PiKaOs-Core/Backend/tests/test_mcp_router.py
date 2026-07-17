"""The MCP routes (`/api/mcp`).

Authorization is asserted through the REAL dependency chain: a caller lacking a tool's permission must
be refused by the route the tool mirrors, not by a check inside the catalog. That is the property that
keeps `/api/mcp/call` from becoming a way around `require_perm`.

    docker compose exec backend pytest tests/test_mcp_router.py
"""
from __future__ import annotations

import logging

import pytest
from fastapi import APIRouter, Depends, FastAPI
from httpx import ASGITransport, AsyncClient

from app.core import identity, mcp_catalog
from app.core.identity import require_perm
from app.core.routers import mcp as mcp_router


@pytest.fixture
def state_dir(tmp_path, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "kernel_state_dir", str(tmp_path))
    return tmp_path


@pytest.fixture
def app() -> FastAPI:
    """A throwaway app carrying the mcp router plus one guarded fake-plugin route."""
    application = FastAPI()
    kb = APIRouter(prefix="/api/knowledge")

    @kb.get("/search", summary="Search documents")
    async def search(q: str = "", user=Depends(require_perm("knowledge.read", ai_safe=True))):
        return {"hits": [q]}

    application.include_router(kb)
    application.include_router(mcp_router.router)
    return application


def _grant(monkeypatch, perms: set[str]) -> None:
    """Stand in for the auth plugin: authenticate any bearer token, grant exactly `perms`.

    Patch `provider_for` (which takes the app), not the private `_provider` — the latter delegates to
    it, so patching the public one covers both the route dependencies and `list_tools`.
    """

    class _Provider:
        async def authenticate(self, token):
            return None if not token else type("U", (), {"id": 1, "username": "t"})()

        async def has_perm(self, user, perm):
            return perm in perms

    monkeypatch.setattr(identity, "provider_for", lambda app: _Provider())


def _client(app: FastAPI) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://t")


async def test_tools_requires_authentication(app, state_dir, monkeypatch):
    _grant(monkeypatch, {"knowledge.read"})
    async with _client(app) as c:
        assert (await c.get("/api/mcp/tools")).status_code == 401


async def test_tools_lists_only_allowlisted_tools_the_caller_may_use(app, state_dir, monkeypatch):
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {}})

    _grant(monkeypatch, set())                       # authenticated, but holds no permissions
    async with _client(app) as c:
        r = await c.get("/api/mcp/tools", headers={"Authorization": "Bearer t"})
    assert r.status_code == 200 and r.json()["tools"] == []

    _grant(monkeypatch, {"knowledge.read"})
    async with _client(app) as c:
        r = await c.get("/api/mcp/tools", headers={"Authorization": "Bearer t"})
    assert [t["name"] for t in r.json()["tools"]] == ["pikaos.knowledge.search"]


async def test_tools_publishes_the_effect_that_drives_the_consent_gate(app, state_dir, monkeypatch):
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {}})
    _grant(monkeypatch, {"knowledge.read"})
    async with _client(app) as c:
        r = await c.get("/api/mcp/tools", headers={"Authorization": "Bearer t"})
    assert r.json()["tools"][0]["effect"] == mcp_catalog.EFFECT_READ


async def test_call_reaches_the_real_route(app, state_dir, monkeypatch):
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {}})
    _grant(monkeypatch, {"knowledge.read"})
    async with _client(app) as c:
        r = await c.post("/api/mcp/call", headers={"Authorization": "Bearer t"},
                         json={"name": "pikaos.knowledge.search", "arguments": {"q": "hi"}})
    assert r.status_code == 200
    assert r.json()["result"] == {"hits": ["hi"]}


async def test_the_audit_line_emits_and_redacts_secretish_arguments(app, state_dir, monkeypatch):
    """An `extra` key colliding with a LogRecord attribute (`args`, `module`, `name`, …) makes logging
    raise the moment the logger is enabled — so exercise it enabled, and assert no value leaks.

    Capture with a handler on the logger itself, not pytest's `caplog`: `logging_ctx` sets
    `propagate = False` across the `pikaos` namespace, so a root-level capture sees nothing and this
    test would pass or fail depending on which other test ran first.
    """
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {}})
    _grant(monkeypatch, {"knowledge.read"})

    records: list[logging.LogRecord] = []

    class _Capture(logging.Handler):
        def emit(self, record):
            records.append(record)

    logger = logging.getLogger("pikaos.mcp")
    handler = _Capture(level=logging.INFO)
    logger.addHandler(handler)
    previous_level = logger.level
    # setLevel, never `logger.level = …`: only the setter clears the `isEnabledFor` memo, and an
    # earlier test in this file already cached "INFO is off" for this logger.
    logger.setLevel(logging.INFO)
    try:
        async with _client(app) as c:
            r = await c.post("/api/mcp/call", headers={"Authorization": "Bearer t"},
                             json={"name": "pikaos.knowledge.search",
                                   "arguments": {"q": "hi", "api_key": "sk-do-not-log"}})
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)

    assert r.status_code == 200
    record = next(rec for rec in records if rec.getMessage() == "mcp call")
    assert record.tool_args == {"q": "str", "api_key": "****"}   # shapes, never values
    assert "sk-do-not-log" not in record.tool_args["api_key"]


async def test_call_is_refused_by_the_routes_own_authz_not_by_the_catalog(app, state_dir, monkeypatch):
    """The tool is allowlisted and would be listed for a permitted caller — so the refusal here can
    only come from require_perm on the inner route. That proves the catalog never re-implements (and
    so can never drift from) authorization."""
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {}})
    _grant(monkeypatch, set())
    async with _client(app) as c:
        r = await c.post("/api/mcp/call", headers={"Authorization": "Bearer t"},
                         json={"name": "pikaos.knowledge.search", "arguments": {"q": "hi"}})
    assert r.status_code == 403


async def test_a_disallowed_tool_is_indistinguishable_from_an_unknown_one(app, state_dir, monkeypatch):
    """Both 404, same body — the catalog must never disclose what exists but is disallowed."""
    _grant(monkeypatch, {"knowledge.read"})            # allowlist left empty: the tool exists, is not granted
    async with _client(app) as c:
        disallowed = await c.post("/api/mcp/call", headers={"Authorization": "Bearer t"},
                                  json={"name": "pikaos.knowledge.search", "arguments": {}})
        unknown = await c.post("/api/mcp/call", headers={"Authorization": "Bearer t"},
                               json={"name": "pikaos.ghost.vanished", "arguments": {}})
    assert disallowed.status_code == unknown.status_code == 404
    assert disallowed.json() == unknown.json()


async def test_call_requires_authentication(app, state_dir, monkeypatch):
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {}})
    _grant(monkeypatch, {"knowledge.read"})
    async with _client(app) as c:
        r = await c.post("/api/mcp/call", json={"name": "pikaos.knowledge.search", "arguments": {}})
    assert r.status_code == 401


async def test_writing_the_allowlist_needs_plugins_manage(app, state_dir, monkeypatch):
    _grant(monkeypatch, {"options.manage"})            # the weaker permission must not suffice
    async with _client(app) as c:
        r = await c.put("/api/mcp/allowlist", headers={"Authorization": "Bearer t"},
                        json={"entries": {"pikaos.knowledge.search": {}}})
    assert r.status_code == 403

    _grant(monkeypatch, {"plugins.manage"})
    async with _client(app) as c:
        r = await c.put("/api/mcp/allowlist", headers={"Authorization": "Bearer t"},
                        json={"entries": {"pikaos.knowledge.search": {}}})
    assert r.status_code == 200
    assert mcp_catalog.read_allowlist() == {"pikaos.knowledge.search": {}}


async def test_allowlist_write_lands_in_audit_trail(app, state_dir, monkeypatch):
    from app.core import audit
    _grant(monkeypatch, {"plugins.manage"})
    async with _client(app) as c:
        r = await c.put("/api/mcp/allowlist", headers={"Authorization": "Bearer t"},
                        json={"entries": {"pikaos.knowledge.search": {}}})
    assert r.status_code == 200
    rows = audit.read(action="mcp.allowlist")
    assert rows and rows[0]["detail"] == {"count": 1}


async def test_reading_the_allowlist_needs_plugins_manage(app, state_dir, monkeypatch):
    """The allowlist names the whole reachable surface — it is not general-audience config."""
    _grant(monkeypatch, {"options.manage"})
    async with _client(app) as c:
        assert (await c.get("/api/mcp/allowlist", headers={"Authorization": "Bearer t"})).status_code == 403


def test_the_real_core_app_reflects_a_non_empty_catalog_and_exposes_nothing_by_default(state_dir):
    """Reflection must survive contact with the app Core actually builds — a FastAPI upgrade that
    changes route internals must fail loudly here, not silently empty the tool list. And with no
    allowlist, the real app exposes nothing at all."""
    from app.main import app as real_app

    catalog = mcp_catalog.build_catalog(real_app)
    assert catalog, "reflection found no guarded routes on the real Core app"
    assert all(t.permission for t in catalog)               # never an unguarded tool
    assert all(t.name.startswith("pikaos.") for t in catalog)
    assert mcp_catalog.allowed_tools(real_app) == []        # deny by default, on the real app


def test_the_real_kernel_catalog_is_exactly_the_one_route_that_opted_in():
    """The whole prohibition in one assertion. A kernel-only Core reflects 11 guarded routes; only ONE
    ever reaches an AI — a non-secret read. Settings writes are no longer ai_safe (G1). This list grows
    ONLY by a deliberate `ai_safe=True`, so a new mutating route cannot join it by accident — which is
    the property a deny-list of forbidden permissions could not give (it missed `llm.manage`).

    The _SELF_PREFIX lesson: only reflecting the REAL app catches this class of regression."""
    from app.main import app as real_app

    tools = mcp_catalog.build_catalog(real_app)
    assert tools, "catalog came back empty — reflection is broken, not merely filtered"

    assert {(t.method, t.path) for t in tools} == {
        ("GET", "/api/storage/status"),          # read: non-secret config + reachability
    }
    # `POST /api/storage/test` shares `infra.manage` with the status read and is NOT marked — proof
    # the gate is the marker on the route, never the permission it happens to enforce.
    assert not any(t.path == "/api/storage/test" for t in tools)


def test_no_ai_safe_route_can_reach_code_execution_or_the_filesystem():
    """The canary. `ai_safe=True` is a human judgement, and humans drift: someone will one day mark a
    route whose module has meanwhile grown a `subprocess` call. Rather than trust the review, fail the
    build when a module hosting a tool-eligible route imports the machinery of program mutation."""
    import inspect
    import re

    from app.main import app as real_app

    forbidden = re.compile(r"^\s*(?:import|from)\s+(subprocess|shutil|pty|ctypes)\b", re.M)
    offenders, checked = [], 0
    for op in mcp_catalog._iter_routes(real_app):
        permission, ai_safe = mcp_catalog._permission_and_safety_of(op)
        if not (permission and ai_safe):
            continue
        checked += 1
        module = inspect.getmodule(op.endpoint)
        if hit := forbidden.search(inspect.getsource(module)):
            offenders.append(f"{module.__name__} imports {hit.group(1)} (route {op.path})")

    # A canary that inspects nothing always passes. Pin the count to the routes that opted in.
    assert checked == 1, f"expected 1 ai_safe route to inspect, found {checked}"
    assert offenders == [], "ai_safe routes must not live beside code-execution machinery: " + "; ".join(offenders)
