"""Task A2 — BootstrapProvider: no auth plugin bound → deny all data access.

    docker compose exec backend pytest tests/test_identity_bootstrap.py
"""
from __future__ import annotations

import asyncio

import pytest

from app.core import kernel_state, setup_state
from app.core.identity import ADMIN_ROLE, BOOTSTRAP, BootstrapProvider, IdentityProvider


def test_bootstrap_satisfies_provider_protocol():
    assert isinstance(BOOTSTRAP, IdentityProvider)
    assert isinstance(BootstrapProvider(), IdentityProvider)


def test_bootstrap_denies_everything():
    assert asyncio.run(BOOTSTRAP.authenticate("anything")) is None
    assert asyncio.run(BOOTSTRAP.has_perm(object(), "x")) is False
    assert BOOTSTRAP.has_role(object(), "admin") is False


@pytest.fixture
def tmp_state(tmp_path, monkeypatch):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    return tmp_path


def test_open_mode_authenticates_anonymous_as_admin(tmp_state):
    setup_state.write_auth_mode("open")
    user = asyncio.run(BOOTSTRAP.authenticate(None))
    assert user is not None and user.role == ADMIN_ROLE


def test_login_mode_still_denies_anonymous(tmp_state):
    setup_state.write_auth_mode("login")
    assert asyncio.run(BOOTSTRAP.authenticate(None)) is None


def test_setup_mode_still_denies_anonymous_but_accepts_token(tmp_state):
    setup_state.write_auth_mode("setup")
    setup_state.write("PIKA-ABCD-2345", "tok-1")
    assert asyncio.run(BOOTSTRAP.authenticate(None)) is None
    assert asyncio.run(BOOTSTRAP.authenticate("tok-1")) is not None
