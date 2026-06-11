"""Seed the users table to mirror Frontend/src/data/data-users.jsx.

Idempotent: skips users that already exist (by username). All seeded users share
the dev password from settings.seed_password (default "pikaos123").
"""
from __future__ import annotations

import asyncio

from sqlalchemy import select

from app.config import settings
from app.db import SessionLocal
from app.models import User
from app.security import hash_password

SEED_USERS = [
    dict(username="somchai", display="สมชาย วีรกุล", email="somchai@guildos.io", role="admin",   status="active",    quota=500000, period="weekly",  used=318400, avatar="🧙"),
    dict(username="nicha",   display="ณิชา ทองดี",   email="nicha@guildos.io",   role="manager", status="active",    quota=300000, period="weekly",  used=184200, avatar="🦉"),
    dict(username="kitt",    display="กิตติ ศรีสุข",  email="kitt@guildos.io",    role="member",  status="active",    quota=100000, period="weekly",  used=91800,  avatar="🛠️"),
    dict(username="ploy",    display="พลอย จันทร์",   email="ploy@guildos.io",    role="member",  status="active",    quota=100000, period="weekly",  used=42600,  avatar="📜"),
    dict(username="anan",    display="อนันต์ พรหม",   email="anan@guildos.io",    role="viewer",  status="active",    quota=20000,  period="monthly", used=5400,   avatar="👁️"),
    dict(username="dao",     display="ดาว ประเสริฐ",  email="dao@guildos.io",     role="member",  status="suspended", quota=100000, period="weekly",  used=99200,  avatar="🌙"),
]


async def seed() -> None:
    password_hash = hash_password(settings.seed_password)
    async with SessionLocal() as db:
        existing = set((await db.execute(select(User.username))).scalars().all())
        added = 0
        for u in SEED_USERS:
            if u["username"] in existing:
                continue
            db.add(User(password_hash=password_hash, **u))
            added += 1
        await db.commit()
        print(f"[seed] users added: {added}, already present: {len(existing)}")


if __name__ == "__main__":
    asyncio.run(seed())
