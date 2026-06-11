"""WebSocket scaffold — authenticated echo over a Redis pub/sub channel.

Real-time features (live agent status, notifications) build on this later. The
endpoint authenticates with the access token (?token=...) and relays messages
through Redis so multiple backend workers stay in sync.
"""
from __future__ import annotations

import asyncio

import jwt
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from .. import security
from ..redis_client import redis

router = APIRouter()

CHANNEL = "pikaos:ws"


@router.websocket("/ws")
async def ws_endpoint(websocket: WebSocket) -> None:
    token = websocket.query_params.get("token", "")
    try:
        payload = security.decode_access_token(token)
        user_id = payload.get("sub")
        if payload.get("type") != "access" or not user_id:
            raise jwt.InvalidTokenError()
    except jwt.PyJWTError:
        await websocket.close(code=4401)  # unauthorized
        return

    await websocket.accept()
    pubsub = redis.pubsub()
    await pubsub.subscribe(CHANNEL)

    async def relay() -> None:
        async for message in pubsub.listen():
            if message.get("type") == "message":
                await websocket.send_text(message["data"])

    relay_task = asyncio.create_task(relay())
    try:
        await websocket.send_json({"type": "hello", "user": user_id})
        while True:
            text = await websocket.receive_text()
            # broadcast to everyone on the channel (incl. self) via Redis
            await redis.publish(CHANNEL, text)
    except WebSocketDisconnect:
        pass
    finally:
        relay_task.cancel()
        await pubsub.unsubscribe(CHANNEL)
        await pubsub.aclose()
