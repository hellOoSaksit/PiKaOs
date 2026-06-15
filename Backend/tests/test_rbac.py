"""Tests for server-side RBAC (A1) — permission resolution + require_perm.

Pure/network-free: the resolution math is tested directly, and require_perm is driven
with a stubbed get_effective_perms (no DB/Redis). The end-to-end 403 on a real endpoint
is covered once the first write endpoint lands; the dependency behaviour is asserted here.

    docker compose exec backend pytest tests/test_rbac.py
"""
from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import deps
from app.services.rbac_service import resolve_perms

CATALOG = {"agent.create", "quest.run", "audit.view", "user.manage", "room.build"}


# --- resolve_perms (pure) --------------------------------------------------

def test_admin_gets_entire_catalog():
    # admin ignores role_perms/overrides and holds every permission
    assert resolve_perms("admin", set(), {}, CATALOG) == CATALOG


def test_role_perms_passthrough():
    assert resolve_perms("member", {"agent.create", "quest.run"}, {}, set()) == {"agent.create", "quest.run"}


def test_grant_adds_beyond_role():
    out = resolve_perms("member", {"quest.run"}, {"audit.view": True}, set())
    assert out == {"quest.run", "audit.view"}


def test_deny_wins_over_role():
    out = resolve_perms("member", {"quest.run", "agent.create"}, {"quest.run": False}, set())
    assert out == {"agent.create"}


def test_deny_absent_perm_is_noop():
    assert resolve_perms("viewer", set(), {"user.manage": False}, set()) == set()


# --- require_perm dependency ------------------------------------------------

def _run_checker(perm: str, effective: set[str], monkeypatch):
    async def _fake_effective(db, user):
        return set(effective)

    monkeypatch.setattr(deps.rbac_service, "get_effective_perms", _fake_effective)
    checker = deps.require_perm(perm)
    user = SimpleNamespace(id=uuid.uuid4(), role="member")
    return asyncio.run(checker(user=user, db=None))


def test_require_perm_allows_when_held(monkeypatch):
    user = _run_checker("agent.create", {"agent.create", "quest.run"}, monkeypatch)
    assert user.role == "member"


def test_require_perm_403_with_named_perm(monkeypatch):
    with pytest.raises(HTTPException) as ei:
        _run_checker("user.manage", {"agent.create"}, monkeypatch)
    assert ei.value.status_code == 403
    assert ei.value.detail == "missing permission: user.manage"


# --- seed data integrity ---------------------------------------------------

def test_seed_role_perms_are_within_catalog():
    from scripts.seed import SEED_ROLE_PERMS, _PERM_KEYS

    catalog = set(_PERM_KEYS)
    assert len(catalog) == len(_PERM_KEYS)  # no duplicate permission keys
    for role, perms in SEED_ROLE_PERMS.items():
        assert set(perms) <= catalog, f"{role} references unknown permission"
    assert set(SEED_ROLE_PERMS["admin"]) == catalog  # admin = full catalog
