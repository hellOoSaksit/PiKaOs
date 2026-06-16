"""WebSocket first-message auth (A2).

Network-free: drives `ws._authenticate` with a one-shot fake socket and a monkeypatched
deny-list. Proves the token is taken from the first frame (not the URL), bad/expired/denied
tokens are rejected, and quest authz is denied until phase B.

    docker compose exec backend pytest tests/test_ws.py
"""
from __future__ import annotations

import json

import pytest

from app import redis_client, security
from app.routers import ws as wsmod


class _OneShotWS:
    """Fake WebSocket whose first receive_text returns a preset frame."""

    def __init__(self, text: str):
        self._text = text

    async def receive_text(self) -> str:
        return self._text


@pytest.fixture
def allow_denylist(monkeypatch):
    async def _not_denied(_jti):
        return False

    monkeypatch.setattr(redis_client, "is_access_denied", _not_denied)


async def test_first_message_auth_accepts_valid_token(allow_denylist):
    token, _ = security.make_access_token(user_id="u1", role="member")
    ws = _OneShotWS(json.dumps({"type": "auth", "token": token}))
    assert await wsmod._authenticate(ws) == "u1"


async def test_rejects_when_first_frame_is_not_auth(allow_denylist):
    ws = _OneShotWS(json.dumps({"type": "subscribe", "quest_id": "q1"}))
    assert await wsmod._authenticate(ws) is None


async def test_rejects_garbage_token(allow_denylist):
    ws = _OneShotWS(json.dumps({"type": "auth", "token": "not-a-jwt"}))
    assert await wsmod._authenticate(ws) is None


async def test_rejects_non_json_first_frame(allow_denylist):
    ws = _OneShotWS("hello")
    assert await wsmod._authenticate(ws) is None


async def test_rejects_denylisted_token(monkeypatch):
    async def _denied(_jti):
        return True

    monkeypatch.setattr(redis_client, "is_access_denied", _denied)
    token, _ = security.make_access_token(user_id="u1", role="member")
    ws = _OneShotWS(json.dumps({"type": "auth", "token": token}))
    assert await wsmod._authenticate(ws) is None


async def test_quest_authz_denies_malformed_ids():
    # B5: _can_view_quest now runs real authz (quest_service.can_view); non-UUID ids are
    # rejected before any DB hit. Owner/department/admin grants are covered in test_quest_stream.
    assert await wsmod._can_view_quest("u1", "q1") is False
