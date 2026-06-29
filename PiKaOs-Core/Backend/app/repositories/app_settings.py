"""SQL for `app_settings` — server-scoped key/value config (migration 0007).

A tiny key/value store (JSONB value) for settings shared across every user/device — first used
for the sidebar nav arrangement. The router decides who may read/write each key; this layer just
reads and upserts.
"""
from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from ..models import AppSetting


async def get(db: AsyncSession, key: str) -> AppSetting | None:
    """The setting row for `key`, or None if it was never written."""
    return await db.get(AppSetting, key)


async def upsert(db: AsyncSession, key: str, value: Any, updated_by: uuid.UUID | None) -> AppSetting:
    """Create or overwrite the value for `key` (records who last wrote it)."""
    row = await db.get(AppSetting, key)
    if row is None:
        row = AppSetting(key=key, value=value, updated_by=updated_by)
        db.add(row)
    else:
        row.value = value
        row.updated_by = updated_by
    await db.commit()
    await db.refresh(row)
    return row
