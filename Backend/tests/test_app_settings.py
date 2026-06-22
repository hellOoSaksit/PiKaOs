"""Tests for app_settings — server-scoped key/value config (migration 0007).

    docker compose exec backend pytest tests/test_app_settings.py
"""
from __future__ import annotations

import asyncio

from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings
from app.models import AppSetting
from app.repositories import app_settings as repo


def test_app_setting_upsert_then_get_then_overwrite():
    async def main():
        eng = create_async_engine(settings.database_url)
        Session = async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as db:
                await repo.upsert(db, "test_nav", [{"group": "g", "items": []}], updated_by=None)
            async with Session() as db:
                first = (await repo.get(db, "test_nav")).value
            async with Session() as db:
                await repo.upsert(db, "test_nav", [{"group": "g2", "items": [{"id": "x"}]}], updated_by=None)
                second = (await repo.get(db, "test_nav")).value
                missing = await repo.get(db, "test_nav_absent")
            return first, second, missing
        finally:
            async with Session() as c:
                await c.execute(sql_delete(AppSetting).where(AppSetting.key == "test_nav"))
                await c.commit()
            await eng.dispose()

    first, second, missing = asyncio.run(main())
    assert first == [{"group": "g", "items": []}]              # stored as given
    assert second[0]["group"] == "g2" and second[0]["items"][0]["id"] == "x"  # upsert overwrote
    assert missing is None                                      # unknown key -> None
