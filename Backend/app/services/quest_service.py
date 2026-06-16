"""Quest stream service — authorization + snapshot/backfill for the live worklog (B5).

The WS router (routers/ws.py) calls these to decide whether a socket may subscribe to a
quest, and to replay state so a mid-run page open / reconnect loses nothing
(system-design §6). Pure orchestration over repositories; no FastAPI/WS types in/out.
"""
from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from ..repositories import quests as quests_repo
from ..repositories import runs as runs_repo
from ..repositories import users as users_repo
from .events import serialize_step
from .rbac_service import ADMIN_ROLE


async def can_view(db: AsyncSession, user_id: str, quest_id: str) -> bool:
    """May this user view this quest's stream? admin · the quest's creator · or a member of
    the quest's department. (A dept-less quest is owner/admin-only — depts are seeded in D.)"""
    try:
        uid, qid = uuid.UUID(user_id), uuid.UUID(quest_id)
    except (ValueError, TypeError):
        return False
    user = await users_repo.get_by_id(db, uid)
    quest = await quests_repo.get_quest(db, qid)
    if user is None or quest is None:
        return False
    if user.role == ADMIN_ROLE or quest.created_by == user.id:
        return True
    if quest.department_id is not None and await quests_repo.user_in_department(db, user.id, quest.department_id):
        return True
    return False


async def snapshot(db: AsyncSession, quest_id: str, *, limit: int = 200) -> dict:
    """Recent runs + worklog steps for a quest — sent right after a successful subscribe."""
    qid = uuid.UUID(quest_id)
    runs = await quests_repo.run_states_for_quest(db, qid)
    steps = await quests_repo.recent_steps_for_quest(db, qid, limit=limit)
    return {
        "type": "snapshot",
        "quest_id": quest_id,
        "runs": [{"run_id": str(rid), "status": status} for rid, status in runs],
        "steps": [serialize_step(s) for s in steps],
    }


async def backfill(db: AsyncSession, quest_id: str, run_id: str, after_seq: int) -> dict:
    """Steps of one run with seq > after_seq — fills a gap the client detected via (run_id, seq).

    The caller has already passed `can_view` for `quest_id`; here we additionally confirm the
    requested run actually belongs to that quest, so a crafted run_id can't read another quest.
    """
    empty = {"type": "backfill", "run_id": run_id, "after_seq": after_seq, "steps": []}
    try:
        rid, qid = uuid.UUID(run_id), uuid.UUID(quest_id)
    except (ValueError, TypeError):
        return empty
    run = await runs_repo.get_run(db, rid)
    if run is None or run.quest_id != qid:
        return empty
    steps = await quests_repo.steps_after(db, rid, after_seq)
    return {**empty, "steps": [serialize_step(s) for s in steps]}
