"""rename the quest domain entity → task (formal terminology)

Pure rename, no data change: the agent-run work unit `quest` becomes `task` to match the
project's formal-terminology rule (pikaos-dev-rules). Renames the table, the two FK columns
that reference it, and its indexes. FK constraint names keep their old labels (cosmetic, still
valid) — they re-point to the renamed table automatically in Postgres.

Revision ID: 0011_quest_to_task
Revises: 0010_telegram
Create Date: 2026-06-30
"""
from alembic import op

revision = "0011_quest_to_task"
down_revision = "0010_telegram"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.rename_table("quests", "tasks")
    op.alter_column("runs", "quest_id", new_column_name="task_id")
    op.alter_column("telegram_links", "quest_id", new_column_name="task_id")
    op.execute("ALTER INDEX ix_quests_room_id RENAME TO ix_tasks_room_id")
    op.execute("ALTER INDEX ix_quests_department_id RENAME TO ix_tasks_department_id")
    op.execute("ALTER INDEX ix_runs_quest_status RENAME TO ix_runs_task_status")


def downgrade() -> None:
    op.execute("ALTER INDEX ix_runs_task_status RENAME TO ix_runs_quest_status")
    op.execute("ALTER INDEX ix_tasks_department_id RENAME TO ix_quests_department_id")
    op.execute("ALTER INDEX ix_tasks_room_id RENAME TO ix_quests_room_id")
    op.alter_column("telegram_links", "task_id", new_column_name="quest_id")
    op.alter_column("runs", "task_id", new_column_name="quest_id")
    op.rename_table("tasks", "quests")
