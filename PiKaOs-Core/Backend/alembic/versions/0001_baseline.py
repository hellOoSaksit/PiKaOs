"""baseline schema — modular, organized by bounded context (core · knowledge · engine)

Consolidated baseline replacing the old 0001_init…0004_engine chain (pre-prod: no deployed DB
to preserve). Organized per docs/architecture/modularity.md §1–§2:

  core      — users · departments · user_departments · roles · permissions · role_perms · user_perms
  knowledge — documents (markdown-as-truth; no vector column — knowledge-rag.md)
  engine    — rooms · agents · quests · runs · run_steps

Extraction rule (modularity §2.1): a module's tables FK only into **core** or within themselves —
never into another non-core module. That keeps any one module liftable to a lightweight local
deploy. Tables with no code yet (subtasks/tools_config/notifications — HERMES/tools/notify, phase C)
are intentionally NOT created here (YAGNI); they land in their own phase migration with soft-refs
where they would otherwise cross a module boundary. The engine test sink (stub_tool_writes) is a
separate migration (0002), out of the domain schema.

FK/cascade/index/unique preserved exactly from the old chain (risk-mitigation §4.4).

Revision ID: 0001_baseline
Revises:
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB
ARR = postgresql.ARRAY
_EMPTY_ARR = sa.text("'{}'")


def _ts():
    return sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now())


def upgrade() -> None:
    # ===================== MODULE: core (identity · access · tenancy) =====================
    # NOTE (Phase C): the auth/identity tables — users · departments · user_departments · roles ·
    # permissions · role_perms · user_perms — are NO LONGER created here. They moved to the `auth`
    # plugin, which owns them on its own metadata and creates + seeds them via its migrate() step
    # (run by scripts.migrate_plugins right after this baseline). Columns in the modules below that
    # used to FK users.id/departments.id are plain UUIDs now (logical cross-plugin refs, no FK), so
    # this baseline stays valid on a fresh DB even when the auth plugin is disabled.

    # NOTE (knowledge extraction): the `documents` + `doc_chunks` tables (+ pgvector) moved to the
    # `knowledge` plugin — it owns them on its own metadata and creates them via its migrate() step
    # (CREATE EXTENSION vector → create_all → HNSW index). Core no longer creates them.

    # ===================== MODULE: engine (agent-ops) =====================
    # Stateful. FKs → core (users/departments) or within engine (rooms/agents/quests/runs) only.

    op.create_table(
        "rooms",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("template", sa.String(64), nullable=False, server_default=""),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("department_id", UUID, nullable=True),
        _ts(),
    )
    op.create_index("ix_rooms_department_id", "rooms", ["department_id"])

    op.create_table(
        "agents",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("owner_id", UUID, nullable=True),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("role", sa.String(64), nullable=False, server_default=""),
        sa.Column("status", sa.String(32), nullable=False, server_default="idle"),  # AI-set only
        sa.Column("model", sa.String(64), nullable=False, server_default=""),
        sa.Column("skills", ARR(sa.String()), nullable=False, server_default=_EMPTY_ARR),
        sa.Column("granted_tools", ARR(sa.String()), nullable=False, server_default=_EMPTY_ARR),
        sa.Column("sprite", sa.String(64), nullable=False, server_default=""),
        sa.Column("room_id", UUID, sa.ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("department_id", UUID, nullable=True),
        _ts(),
    )
    op.create_index("ix_agents_owner_id", "agents", ["owner_id"])
    op.create_index("ix_agents_room_id", "agents", ["room_id"])
    op.create_index("ix_agents_department_id", "agents", ["department_id"])

    op.create_table(
        "quests",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("title", sa.String(255), nullable=False, server_default=""),
        sa.Column("brief", sa.Text(), nullable=False, server_default=""),
        sa.Column("room_id", UUID, sa.ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(32), nullable=False, server_default="open"),
        sa.Column("created_by", UUID, nullable=True),
        sa.Column("department_id", UUID, nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),  # soft delete
        _ts(),
    )
    op.create_index("ix_quests_room_id", "quests", ["room_id"])
    op.create_index("ix_quests_department_id", "quests", ["department_id"])

    op.create_table(
        "runs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False, server_default="agent"),  # agent | orchestration
        sa.Column("parent_run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=True),
        sa.Column("agent_id", UUID, sa.ForeignKey("agents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("quest_id", UUID, sa.ForeignKey("quests.id", ondelete="SET NULL"), nullable=True),
        sa.Column("room_id", UUID, sa.ForeignKey("rooms.id", ondelete="SET NULL"), nullable=True),
        # denormalized from room/agent at creation for fast department-scoped filtering (§7.1)
        sa.Column("department_id", UUID, nullable=True),
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


def downgrade() -> None:
    # reverse dependency order (auth tables are owned by the auth plugin now — not dropped here)
    op.drop_table("run_steps")
    op.drop_table("runs")
    op.drop_table("quests")
    op.drop_table("agents")
    op.drop_table("rooms")
