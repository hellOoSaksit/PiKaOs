"""Task + task-scoped run/step queries (read side of the live worklog stream, B5).

All SQL for the WS task stream lives here (layering §2.1); the WS router calls the task
service, which calls these.
"""
from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models import Task, Run, RunStep, UserDepartment


async def get_task(db: AsyncSession, task_id: uuid.UUID) -> Task | None:
    return await db.get(Task, task_id)


async def user_in_department(db: AsyncSession, user_id: uuid.UUID, department_id: uuid.UUID) -> bool:
    stmt = select(UserDepartment.user_id).where(
        UserDepartment.user_id == user_id, UserDepartment.department_id == department_id
    )
    return (await db.execute(stmt)).first() is not None


async def run_states_for_task(db: AsyncSession, task_id: uuid.UUID) -> list[tuple[uuid.UUID, str]]:
    """(run_id, status) for every run under a task — the snapshot's run list."""
    stmt = select(Run.id, Run.status).where(Run.task_id == task_id).order_by(Run.created_at)
    return [(r[0], r[1]) for r in (await db.execute(stmt)).all()]


async def recent_steps_for_task(db: AsyncSession, task_id: uuid.UUID, limit: int = 200) -> list[RunStep]:
    """Worklog steps across the task's runs, oldest→newest (capped). Snapshot on subscribe."""
    stmt = (
        select(RunStep)
        .join(Run, RunStep.run_id == Run.id)
        .where(Run.task_id == task_id)
        .order_by(Run.created_at, RunStep.seq)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def steps_after(db: AsyncSession, run_id: uuid.UUID, after_seq: int) -> list[RunStep]:
    """Steps of one run with seq > after_seq — backfills a gap the client detected."""
    stmt = (
        select(RunStep)
        .where(RunStep.run_id == run_id, RunStep.seq > after_seq)
        .order_by(RunStep.seq)
    )
    return list((await db.execute(stmt)).scalars().all())
