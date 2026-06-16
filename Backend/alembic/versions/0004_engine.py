"""engine core schema (B1)

Adds the agent-ops engine tables + department scoping, designed correct from the first
migration (no retrofit later):
- departments + user_departments (m:n, 1 user → many depts) — system-design §7.1
- rooms, agents, quests, runs, subtasks, run_steps, tools_config, notifications
- documents.department_id (scopable resource)
- FK / cascade / UNIQUE / index per risk-mitigation §4.4:
  runs.parent_run_id self-CASCADE · runs.agent_id/quest_id/room_id SET NULL ·
  run_steps.run_id CASCADE + UNIQUE(run_id, seq) · subtasks.orch_run_id CASCADE /
  child_run_id SET NULL · notifications.run_id SET NULL.
run_steps carries status(pending|done|failed)+idempotency_key for 2-phase replay (§1).

Revision ID: 0004_engine
Revises: 0003_documents_owner_fk
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_engine"
down_revision = "0003_documents_owner_fk"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB
ARR = postgresql.ARRAY
_EMPTY_ARR = sa.text("'{}'")
_EMPTY_JSON_ARR = sa.text("'[]'::jsonb")


def _ts():
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    # --- departments (single org, many departments — system-design §7.1) ---
    op.create_table(
        "departments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name_th", sa.String(120), nullable=False, server_default=""),
        sa.Column("name_en", sa.String(120), nullable=False, server_default=""),
        _ts(),
    )

    # user ↔ department, many-to-many (1 user can belong to several departments)
    op.create_table(
        "user_departments",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_user_departments_department_id", "user_departments", ["department_id"])

    # --- rooms ---
    op.create_table(
        "rooms",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("template", sa.String(64), nullable=False, server_default=""),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        _ts(),
    )
    op.create_index("ix_rooms_department_id", "rooms", ["department_id"])

    # --- agents ---
    op.create_table(
        "agents",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("owner_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("role", sa.String(64), nullable=False, server_default=""),
        sa.Column("status", sa.String(32), nullable=False, server_default="idle"),  # AI-set only
        sa.Column("model", sa.String(64), nullable=False, server_default=""),
        sa.Column("skills", ARR(sa.String()), nullable=False, server_default=_EMPTY_ARR),
        sa.Column("granted_tools", ARR(sa.String()), nullable=False, server_default=_EMPTY_ARR),
        sa.Column("sprite", sa.String(64), nullable=False, server_default=""),
        sa.Column("room_id", UUID, sa.ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        _ts(),
    )
    op.create_index("ix_agents_owner_id", "agents", ["owner_id"])
    op.create_index("ix_agents_room_id", "agents", ["room_id"])
    op.create_index("ix_agents_department_id", "agents", ["department_id"])

    # --- quests ---
    op.create_table(
        "quests",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("brief", sa.Text(), nullable=False, server_default=""),
        sa.Column("room_id", UUID, sa.ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("created_by", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),  # soft delete
        _ts(),
    )
    op.create_index("ix_quests_room_id", "quests", ["room_id"])
    op.create_index("ix_quests_department_id", "quests", ["department_id"])

    # --- runs (kind = orchestration | agent) ---
    op.create_table(
        "runs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False, server_default="agent"),
        sa.Column("parent_run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=True),
        sa.Column("agent_id", UUID, sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("quest_id", UUID, sa.ForeignKey("quests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("room_id", UUID, sa.ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True),
        # denormalized from room/agent at creation for fast department-scoped filtering (§7.1)
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="queued"),
        sa.Column("input", JSONB, nullable=True),
        sa.Column("tokens_used", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True),
        _ts(),
    )
    op.create_index("ix_runs_parent_run_id", "runs", ["parent_run_id"])
    op.create_index("ix_runs_quest_status", "runs", ["quest_id", "status"])
    op.create_index("ix_runs_department_id", "runs", ["department_id"])

    # --- subtasks (HERMES DAG; deps[] validated in hermes_plan, not enforceable by FK) ---
    op.create_table(
        "subtasks",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("orch_run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("brief_doc_id", UUID, sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assignee_agent_id", UUID, sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("deps", JSONB, nullable=False, server_default=_EMPTY_JSON_ARR),
        sa.Column("status", sa.String(32), nullable=False, server_default="pending"),
        sa.Column("child_run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("result_summary", sa.Text(), nullable=True),
        _ts(),
    )
    op.create_index("ix_subtasks_orch_run_id", "subtasks", ["orch_run_id"])

    # --- run_steps (worklog + replay; 2-phase for tools) ---
    op.create_table(
        "run_steps",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("seq", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),                       # llm|tool|message|status
        sa.Column("status", sa.String(16), nullable=False, server_default="done"),  # pending|done|failed
        sa.Column("idempotency_key", sa.String(128), nullable=True),            # "{run_id}:{seq}"
        sa.Column("role", sa.String(32), nullable=True),
        sa.Column("content", JSONB, nullable=True),
        sa.Column("tokens", sa.Integer(), nullable=False, server_default="0"),
        _ts(),
        sa.UniqueConstraint("run_id", "seq", name="uq_run_steps_run_seq"),
    )

    # --- tools_config (config holds the effect class: read|idempotent_write|side_effect) ---
    op.create_table(
        "tools_config",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("type", sa.String(32), nullable=False, server_default=""),   # mcp|line|telegram|cmd|http|webhook
        sa.Column("config", JSONB, nullable=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        _ts(),
    )

    # --- notifications ---
    op.create_table(
        "notifications",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(32), nullable=False, server_default=""),
        sa.Column("body", JSONB, nullable=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="SET NULL"), nullable=True),
        sa.Column("read", sa.Boolean(), nullable=False, server_default=sa.false()),
        _ts(),
    )
    op.create_index("ix_notifications_user_read", "notifications", ["user_id", "read"])

    # --- documents: add department scoping to the existing table ---
    op.add_column("documents", sa.Column("department_id", UUID, nullable=True))
    op.create_foreign_key(
        "fk_documents_department_id", "documents", "departments", ["department_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_documents_department_id", "documents", ["department_id"])


def downgrade() -> None:
    op.drop_index("ix_documents_department_id", table_name="documents")
    op.drop_constraint("fk_documents_department_id", "documents", type_="foreignkey")
    op.drop_column("documents", "department_id")
    op.drop_index("ix_notifications_user_read", table_name="notifications")
    op.drop_table("notifications")
    op.drop_table("tools_config")
    op.drop_table("run_steps")
    op.drop_index("ix_subtasks_orch_run_id", table_name="subtasks")
    op.drop_table("subtasks")
    op.drop_index("ix_runs_department_id", table_name="runs")
    op.drop_index("ix_runs_quest_status", table_name="runs")
    op.drop_index("ix_runs_parent_run_id", table_name="runs")
    op.drop_table("runs")
    op.drop_index("ix_quests_department_id", table_name="quests")
    op.drop_index("ix_quests_room_id", table_name="quests")
    op.drop_table("quests")
    op.drop_index("ix_agents_department_id", table_name="agents")
    op.drop_index("ix_agents_room_id", table_name="agents")
    op.drop_index("ix_agents_owner_id", table_name="agents")
    op.drop_table("agents")
    op.drop_index("ix_rooms_department_id", table_name="rooms")
    op.drop_table("rooms")
    op.drop_index("ix_user_departments_department_id", table_name="user_departments")
    op.drop_table("user_departments")
    op.drop_table("departments")
