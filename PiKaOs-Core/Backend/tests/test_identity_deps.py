"""Task A3 — FastAPI deps resolve the IDENTITY provider from app.state.container per request.

Covers: 401 with no token, 200 when the provider authenticates, 403 when has_perm is False, and the
deny-all fallback when no container/provider is bound (BootstrapProvider).

    docker compose exec backend pytest tests/test_identity_deps.py
"""
from __future__ import annotations

import uuid
from types import SimpleNamespace

from fastapi import Depends, FastAPI
from starlette.testclient import TestClient

from app.core import contracts
from app.core.identity import get_current_user, require_perm, require_role


class _Provider:
    async def authenticate(self, token):
        if not token:
            return None
        return SimpleNamespace(id=uuid.uuid4(), role="admin", status="active")

    async def has_perm(self, user, perm):
        return perm == "ok"

    def has_role(self, user, *roles):
        return "admin" in roles


def _app(bind_provider: bool = True) -> FastAPI:
    app = FastAPI()
    resolved = _Provider() if bind_provider else None
    app.state.container = SimpleNamespace(resolve=lambda token: resolved if token == contracts.IDENTITY else None)

    @app.get("/me")
    async def me(user=Depends(get_current_user)):
        return {"role": user.role}

    @app.get("/ok", dependencies=[Depends(require_perm("ok"))])
    async def ok():
        return {"ok": True}

    @app.get("/nope", dependencies=[Depends(require_perm("nope"))])
    async def nope():
        return {"ok": True}

    @app.get("/admin", dependencies=[Depends(require_role("admin"))])
    async def admin_only():
        return {"ok": True}

    return app


def test_requires_token():
    c = TestClient(_app())
    assert c.get("/me").status_code == 401


def test_authenticates_with_token():
    c = TestClient(_app())
    r = c.get("/me", headers={"Authorization": "Bearer t"})
    assert r.status_code == 200 and r.json()["role"] == "admin"


def test_require_perm_enforces():
    c = TestClient(_app())
    h = {"Authorization": "Bearer t"}
    assert c.get("/ok", headers=h).status_code == 200
    assert c.get("/nope", headers=h).status_code == 403


def test_require_role_enforces():
    c = TestClient(_app())
    assert c.get("/admin", headers={"Authorization": "Bearer t"}).status_code == 200


def test_no_provider_falls_back_to_deny():
    # container present but nothing bound under IDENTITY → BootstrapProvider → every data route denied.
    c = TestClient(_app(bind_provider=False))
    assert c.get("/me", headers={"Authorization": "Bearer t"}).status_code == 401


def test_require_perm_dependency_declares_its_permission():
    # Reflection (core/mcp_catalog) reads the permission off the dependency rather than prying it out
    # of the closure cell, so a route can declare what it enforces.
    assert require_perm("plugins.manage").required_perm == "plugins.manage"
