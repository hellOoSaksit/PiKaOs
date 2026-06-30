"""SQL for `user_settings` — per-user config that follows the user across devices (migration 0008).

Keyed by (user_id, key) with a JSONB value (a theme string, a lexicon id, etc.). The router scopes
every call to the current user; this layer just reads all of a user's settings and upserts one.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import UserSetting


async def get_all(db: AsyncSession, user_id: uuid.UUID) -> dict[str, Any]:
    """Every setting the user has saved, as {key: value}."""
    rows = (await db.execute(select(UserSetting).where(UserSetting.user_id == user_id))).scalars().all()
    return {r.key: r.value for r in rows}


async def upsert(db: AsyncSession, user_id: uuid.UUID, key: str, value: Any) -> None:
    """Create or overwrite one of the user's settings."""
    row = await db.get(UserSetting, (user_id, key))
    if row is None:
        db.add(UserSetting(user_id=user_id, key=key, value=value))
    else:
        row.value = value
    await db.commit()
