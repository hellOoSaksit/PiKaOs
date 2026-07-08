"""Catalog reflection — pure, so it takes a throwaway app rather than the real one.

Two fake plugin routers stand in for real plugins: reflection must not know about any specific
plugin, only about the shape every plugin already has (a namespaced path + require_perm).

    docker compose exec backend pytest tests/test_mcp_catalog.py
"""
from __future__ import annotations

import pytest
from fastapi import APIRouter, Depends, FastAPI

from app.core import kernel_state, mcp_catalog
from app.core.git_installer import RESERVED_SETTINGS_KEYS
from app.core.identity import require_perm
from app.core.mcp_catalog import (
    EFFECT_IDEMPOTENT_WRITE,
    EFFECT_READ,
    EFFECT_SIDE_EFFECT,
    build_catalog,
)


@pytest.fixture
def state_dir(tmp_path, monkeypatch):
    """Point kernel local-JSON at a temp dir — the allowlist is the kernel's own state."""
    from app.core.config import settings
    monkeypatch.setattr(settings, "kernel_state_dir", str(tmp_path))
    return tmp_path


def _app() -> FastAPI:
    app = FastAPI()
    kb = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

    @kb.get("/search", summary="Search documents")
    async def search(q: str, user=Depends(require_perm("knowledge.read"))):
        return {"hits": []}

    @kb.post("/documents", summary="Create a document")
    async def create_doc(user=Depends(require_perm("knowledge.write"))):
        return {"id": 1}

    @kb.put("/documents/{doc_id}", summary="Replace a document")
    async def replace_doc(doc_id: int, user=Depends(require_perm("knowledge.write"))):
        return {"id": doc_id}

    unguarded = APIRouter(prefix="/api/open")

    @unguarded.get("/ping")
    async def ping():
        return {"ok": True}

    app.include_router(kb)
    app.include_router(unguarded)
    return app


def _by_name(app: FastAPI) -> dict:
    return {d.name: d for d in build_catalog(app)}


def test_names_are_stable_and_namespaced_by_owner():
    names = set(_by_name(_app()))
    assert "pikaos.knowledge.search" in names
    assert "pikaos.knowledge.documents" in names             # POST /documents — sole method on that path
    assert "pikaos.knowledge.documents_doc_id" in names      # PUT /documents/{doc_id}


def test_permission_is_discovered_from_the_route():
    cat = _by_name(_app())
    assert cat["pikaos.knowledge.search"].permission == "knowledge.read"
    assert cat["pikaos.knowledge.documents"].permission == "knowledge.write"


def test_effect_is_classified_pessimistically_from_the_http_method():
    cat = _by_name(_app())
    assert cat["pikaos.knowledge.search"].effect == EFFECT_READ
    assert cat["pikaos.knowledge.documents"].effect == EFFECT_SIDE_EFFECT          # POST
    assert cat["pikaos.knowledge.documents_doc_id"].effect == EFFECT_IDEMPOTENT_WRITE


def test_an_unguarded_route_is_never_exposed():
    """A surface an LLM can reach without authorization is a bug, not a feature."""
    assert not [n for n in _by_name(_app()) if "open" in n]


def test_input_schema_comes_from_fastapis_own_openapi():
    d = _by_name(_app())["pikaos.knowledge.search"]
    assert d.input_schema["type"] == "object"
    assert "q" in d.input_schema["properties"]
    assert d.description == "Search documents"


def test_a_path_serving_several_methods_disambiguates_by_method():
    """One path, two verbs, two tools — the names must not collide."""
    app = FastAPI()
    r = APIRouter(prefix="/api/thing")

    @r.get("/item", summary="Read it")
    async def read_item(user=Depends(require_perm("thing.read"))):
        return {}

    @r.delete("/item", summary="Destroy it")
    async def delete_item(user=Depends(require_perm("thing.write"))):
        return {}

    app.include_router(r)
    names = set(_by_name(app))
    assert names == {"pikaos.thing.get_item", "pikaos.thing.delete_item"}


def test_a_prefix_supplied_at_include_time_still_yields_the_mounted_path():
    """FastAPI >= 0.137 leaves `route.path` unprefixed and puts the mounted path on the route
    context. Reading `route.path` here would emit `pikaos.search.index` and, worse, make /mcp/call
    request an unroutable `/search`."""
    app = FastAPI()
    inner = APIRouter()

    @inner.get("/search", summary="Search documents")
    async def search(user=Depends(require_perm("knowledge.read"))):
        return {}

    app.include_router(inner, prefix="/api/knowledge")
    tool = build_catalog(app)[0]
    assert tool.name == "pikaos.knowledge.search"
    assert tool.path == "/api/knowledge/search"


def test_a_router_level_guard_is_discovered_for_every_route_it_covers():
    """A plugin may guard once at router level rather than repeating require_perm per route."""
    app = FastAPI()
    guarded = APIRouter(prefix="/api/g", dependencies=[Depends(require_perm("g.admin"))])

    @guarded.post("/act", summary="Act")
    async def act():
        return {}

    app.include_router(guarded)
    assert build_catalog(app)[0].permission == "g.admin"


def test_a_directly_decorated_app_route_is_reflected_too():
    """Not every route arrives through include_router; app.get() yields a plain APIRoute with no context."""
    app = FastAPI()

    @app.get("/api/direct", summary="Direct")
    async def direct(user=Depends(require_perm("core.read"))):
        return {}

    assert [t.name for t in build_catalog(app)] == ["pikaos.direct.index"]


# --- the operator allowlist: layer 1 of the two-layer filter ----------------------------------------


def test_the_allowlist_is_a_reserved_settings_key():
    """Widening what an external AI may invoke is plugins.manage authority. If the generic settings
    KV could write it, options.manage would escalate to it (git_installer.py K4)."""
    assert mcp_catalog.ALLOWLIST_KEY in RESERVED_SETTINGS_KEYS


def test_missing_allowlist_exposes_nothing(state_dir):
    """Absence must never mean 'allow all' — the catalog is the attack surface."""
    assert mcp_catalog.read_allowlist() == {}
    assert mcp_catalog.allowed_tools(_app()) == []


def test_only_allowlisted_tools_are_exposed(state_dir):
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {}})
    assert [d.name for d in mcp_catalog.allowed_tools(_app())] == ["pikaos.knowledge.search"]


def test_an_allowlist_entry_may_override_the_effect(state_dir):
    """An operator who knows a POST is idempotent may say so; the default stays pessimistic."""
    mcp_catalog.write_allowlist({"pikaos.knowledge.documents": {"effect": EFFECT_IDEMPOTENT_WRITE}})
    assert mcp_catalog.allowed_tools(_app())[0].effect == EFFECT_IDEMPOTENT_WRITE


def test_an_unknown_effect_override_falls_back_to_side_effect(state_dir):
    """A typo must never quietly relax a tool below the class its method implies."""
    mcp_catalog.write_allowlist({"pikaos.knowledge.search": {"effect": "harmless"}})
    assert mcp_catalog.allowed_tools(_app())[0].effect == EFFECT_SIDE_EFFECT


def test_allowlisting_a_tool_that_does_not_exist_is_inert(state_dir):
    mcp_catalog.write_allowlist({"pikaos.ghost.vanished": {}})
    assert mcp_catalog.allowed_tools(_app()) == []


def test_a_corrupt_allowlist_file_exposes_nothing(state_dir):
    """kernel_state.read_json never raises; a non-dict payload must fail closed, not crash open."""
    kernel_state.write_json(mcp_catalog.ALLOWLIST_KEY, ["pikaos.knowledge.search"])
    assert mcp_catalog.read_allowlist() == {}
    assert mcp_catalog.allowed_tools(_app()) == []
