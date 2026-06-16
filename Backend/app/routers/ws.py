"""WebSocket endpoint — first-message auth + per-channel relay over Redis pub/sub.

Security (A2 / risk-mitigation §3): the access token is NEVER in the URL — that leaks into
proxy/access logs. The client connects to /ws, then its FIRST frame must be
``{"type":"auth","token":"<access JWT>"}`` within AUTH_TIMEOUT seconds, else the socket is
closed 4401. After auth the socket subscribes to its own user channel (``pikaos:user:<id>``);
the old scaffold relayed one global channel to every logged-in user (cross-user leak).

Quest streaming (``{"type":"subscribe","quest_id":...}``) is stubbed: the per-quest authz
check needs the quests table from phase B (engine), so ``_can_view_quest`` denies for now.
The handshake + subscribe/unsubscribe protocol shape is in place so phase B only fills in the
authz and the run_steps snapshot/backfill (risk-mitigation §3 ค–ง).
"""
from __future__ import annotations

import asyncio
import json

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import redis_client, security

router = APIRouter()

AUTH_TIMEOUT = 5.0                       # seconds to send the first {"type":"auth"} frame
_USER_CHANNEL = "pikaos:user:{}"
_QUEST_CHANNEL = "quest:{}"


async def _authenticate(websocket: WebSocket) -> str | None:
    """Wait for the first-message auth frame; return the user_id, or None to reject."""
    try:
        raw = await asyncio.wait_for(websocket.receive_text(), timeout=AUTH_TIMEOUT)
    except (asyncio.TimeoutError, WebSocketDisconnect):
        return None
    try:
        msg = json.loads(raw)
    except (ValueError, TypeError):
        return None
    if msg.get("type") != "auth":
        return None
    try:
        payload = security.decode_access_token(msg.get("token", ""))
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    jti, user_id = payload.get("jti"), payload.get("sub")
    if not jti or not user_id or await redis_client.is_access_denied(jti):
        return None
    return user_id


async def _can_view_quest(user_id: str, quest_id: str) -> bool:
    # TODO(phase B): authorize against the quests/subtasks tables + department scope.
    # No quests exist yet, so deny — keeps the protocol shape without leaking anything.
    return False


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    user_id = await _authenticate(websocket)
    if user_id is None:
        await websocket.close(code=4401)  # unauthorized
        return

    pubsub = redis_client.redis.pubsub()
    channels = {_USER_CHANNEL.format(user_id)}
    await pubsub.subscribe(*channels)

    async def relay() -> None:
        async for message in pubsub.listen():
            if message.get("type") == "message":
                await websocket.send_text(message["data"])

    relay_task = asyncio.create_task(relay())
    try:
        await websocket.send_json({"type": "ready", "user": user_id})
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except (ValueError, TypeError):
                continue
            kind = msg.get("type")
            if kind == "subscribe":
                quest_id = str(msg.get("quest_id", ""))
                if quest_id and await _can_view_quest(user_id, quest_id):
                    ch = _QUEST_CHANNEL.format(quest_id)
                    channels.add(ch)
                    await pubsub.subscribe(ch)
                    await websocket.send_json({"type": "subscribed", "quest_id": quest_id})
                else:
                    await websocket.send_json({"type": "error", "reason": "forbidden", "quest_id": quest_id})
            elif kind == "unsubscribe":
                quest_id = str(msg.get("quest_id", ""))
                ch = _QUEST_CHANNEL.format(quest_id)
                if ch in channels:
                    channels.discard(ch)
                    await pubsub.unsubscribe(ch)
                    await websocket.send_json({"type": "unsubscribed", "quest_id": quest_id})
            # any other frame is ignored — no global echo (that was the cross-user leak)
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        if channels:
            await pubsub.unsubscribe(*channels)
        await pubsub.aclose()
