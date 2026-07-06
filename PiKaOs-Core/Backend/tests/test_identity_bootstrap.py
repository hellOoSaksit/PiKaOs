"""Task A2 — BootstrapProvider: no auth plugin bound → deny all data access.

    docker compose exec backend pytest tests/test_identity_bootstrap.py
"""
from __future__ import annotations

import asyncio

from app.core.identity import BOOTSTRAP, BootstrapProvider, IdentityProvider


def test_bootstrap_satisfies_provider_protocol():
    assert isinstance(BOOTSTRAP, IdentityProvider)
    assert isinstance(BootstrapProvider(), IdentityProvider)


def test_bootstrap_denies_everything():
    assert asyncio.run(BOOTSTRAP.authenticate("anything")) is None
    assert asyncio.run(BOOTSTRAP.has_perm(object(), "x")) is False
    assert BOOTSTRAP.has_role(object(), "admin") is False
