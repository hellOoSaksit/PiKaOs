"""Task A1 — the identity contract: token, provider Protocol, structural UserLike.

    docker compose exec backend pytest tests/test_identity_contract.py
"""
from __future__ import annotations

import uuid

from app.core import contracts, identity


class _FakeUser:
    id = uuid.uuid4()
    role = "admin"
    status = "active"


class _FakeProvider:
    async def authenticate(self, token):
        return _FakeUser() if token else None

    async def has_perm(self, user, perm):
        return perm == "ok"

    def has_role(self, user, *roles):
        return user.role in roles


def test_identity_token_exists():
    assert contracts.IDENTITY == "identity.Provider"


def test_provider_satisfies_protocol():
    assert isinstance(_FakeProvider(), identity.IdentityProvider)


def test_userlike_is_structural():
    assert isinstance(_FakeUser(), identity.UserLike)
