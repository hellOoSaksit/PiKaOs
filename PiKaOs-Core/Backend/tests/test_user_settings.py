"""Tests for user_settings — per-user config (migration 0008).

    docker compose exec backend pytest tests/test_user_settings.py
"""
from __future__ import annotations

import asyncio
import uuid

from sqlalchemy import delete as sql_delete
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings
from app.core.models import UserSetting
from app.plugins.auth.models import User
from app.core.repositories import user_settings as repo


def test_user_settings_scoped_per_user_and_upsert():
    ua, ub = uuid.uuid4(), uuid.uuid4()

    async def main():
        eng = create_async_engine(settings.database_url)
        Session = async_sessionmaker(eng, expire_on_commit=False, class_=AsyncSession)
        try:
            async with Session() as s:
                s.add_all([
                    User(id=ua, username=f"sa_{ua.hex[:8]}", email=f"{ua.hex[:8]}@t", password_hash="x"),
                    User(id=ub, username=f"sb_{ub.hex[:8]}", email=f"{ub.hex[:8]}@t", password_hash="x"),
                ])
                await s.commit()
            async with Session() as db:
                await repo.upsert(db, ua, "theme", "pro-dark")
                await repo.upsert(db, ua, "lex", "english_pro")
                await repo.upsert(db, ub, "theme", "pro")
            async with Session() as db:
                a = await repo.get_all(db, ua)
                b = await repo.get_all(db, ub)
            async with Session() as db:
                await repo.upsert(db, ua, "theme", "pro")     # overwrite
                a2 = await repo.get_all(db, ua)
            return a, b, a2
        finally:
            async with Session() as c:
                await c.execute(sql_delete(UserSetting).where(UserSetting.user_id.in_([ua, ub])))
                await c.execute(sql_delete(User).where(User.id.in_([ua, ub])))
                await c.commit()
            await eng.dispose()

    a, b, a2 = asyncio.run(main())
    assert a == {"theme": "pro-dark", "lex": "english_pro"}   # only A's settings
    assert b == {"theme": "pro"}                               # scoped per user
    assert a2["theme"] == "pro"                                # upsert overwrote
