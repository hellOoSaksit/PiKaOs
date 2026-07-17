"""Notification read/mark routes (audit-notifications v2 spec §1). Reads are any-authenticated-user
(the bell is a general UI surface); NOT ai_safe. The store lives in core/notify.py."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from .. import notify
from ..identity import UserLike, get_current_user

router = APIRouter(prefix="/api/notifications", tags=["notifications"])


@router.get("")
async def list_notifications(_: UserLike = Depends(get_current_user)) -> list[dict]:
    return notify.list_all()


class MarkReadIn(BaseModel):
    ids: list[str] | None = None


@router.put("/read")
async def mark_read(body: MarkReadIn, _: UserLike = Depends(get_current_user)) -> dict:
    return {"marked": notify.mark_read(body.ids)}
