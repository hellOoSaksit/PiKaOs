"""Task A4 — CoreIdentityProvider wires today's auth (decode/redis/users_repo/rbac_service) behind the
IdentityProvider contract. Pure: the auth internals are monkeypatched, so no DB is needed.

    docker compose exec backend pytest tests/test_core_identity_provider.py
"""
from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

from app.core import contracts, identity
from app.core.services import core_identity_provider as mod
from app.core.services.core_identity_provider import CoreIdentityProvider


class _FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


def _sf():
    return _FakeSession()


def _provider():
    return CoreIdentityProvider(_sf)


def test_satisfies_identity_protocol():
    assert isinstance(_provider(), identity.IdentityProvider)


def test_authenticate_valid(monkeypatch):
    uid = uuid.uuid4()
    user = SimpleNamespace(id=uid, role="admin", status="active")
    monkeypatch.setattr(mod.security, "decode_access_token",
                        lambda t: {"type": "access", "jti": "j", "sub": str(uid)})

    async def _not_denied(jti):
        return False

    monkeypatch.setattr(mod.redis_client, "is_access_denied", _not_denied)

    async def _get(db, _id):
        return user

    monkeypatch.setattr(mod.users_repo, "get_by_id", _get)

    p = _provider()
    assert asyncio.run(p.authenticate("tok")) is user
    assert asyncio.run(p.authenticate(None)) is None


def test_authenticate_rejects_denied_jti(monkeypatch):
    monkeypatch.setattr(mod.security, "decode_access_token",
                        lambda t: {"type": "access", "jti": "j", "sub": str(uuid.uuid4())})

    async def _denied(jti):
        return True

    monkeypatch.setattr(mod.redis_client, "is_access_denied", _denied)
    assert asyncio.run(_provider().authenticate("tok")) is None


def test_has_perm(monkeypatch):
    user = SimpleNamespace(id=uuid.uuid4(), role="admin", status="active")

    async def _perms(db, u):
        return {"a.b"}

    monkeypatch.setattr(mod.rbac_service, "get_effective_perms", _perms)
    p = _provider()
    assert asyncio.run(p.has_perm(user, "a.b")) is True
    assert asyncio.run(p.has_perm(user, "x")) is False


def test_has_role():
    user = SimpleNamespace(id=uuid.uuid4(), role="admin", status="active")
    assert _provider().has_role(user, "admin") is True
    assert _provider().has_role(user, "member") is False


def test_identity_token_constant():
    assert contracts.IDENTITY == "identity.Provider"
