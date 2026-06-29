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
    # The shared base every deployment carries. Other modules FK into these; core FKs nowhere.

    op.create_table(
        "users",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("display", sa.String(120), nullable=False, server_default=""),
        sa.Column("role", sa.String(32), nullable=False, server_default="member"),
        sa.Column("status", sa.String(32), nullable=False, server_default="active"),
        sa.Column("avatar", sa.String(64), nullable=False, server_default="🙂"),
        sa.Column("quota", sa.BigInteger(), nullable=True),
        sa.Column("period", sa.String(16), nullable=False, server_default="monthly"),
        sa.Column("used", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True), nullable=True),
        _ts(),
    )
    op.create_index("ix_users_username", "users", ["username"])
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "departments",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name_th", sa.String(120), nullable=False, server_default=""),
        sa.Column("name_en", sa.String(120), nullable=False, server_default=""),
        _ts(),
    )

    op.create_table(
        "roles",
        sa.Column("key", sa.String(32), primary_key=True),
        sa.Column("name_th", sa.String(64), nullable=False, server_default=""),
        sa.Column("name_en", sa.String(64), nullable=False, server_default=""),
        sa.Column("description", sa.String(255), nullable=False, server_default=""),
        sa.Column("color", sa.String(32), nullable=False, server_default=""),
        sa.Column("system", sa.Boolean(), nullable=False, server_default=sa.false()),
    )

    op.create_table(
        "permissions",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("grp", sa.String(32), nullable=False, server_default=""),
        sa.Column("name_th", sa.String(128), nullable=False, server_default=""),
        sa.Column("name_en", sa.String(128), nullable=False, server_default=""),
    )

    op.create_table(
        "role_perms",
        sa.Column("role_key", sa.String(32), sa.ForeignKey("roles.key", ondelete="CASCADE"), primary_key=True),
        sa.Column("perm_key", sa.String(64), sa.ForeignKey("permissions.key", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "user_perms",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("perm_key", sa.String(64), sa.ForeignKey("permissions.key", ondelete="CASCADE"), primary_key=True),
        sa.Column("allow", sa.Boolean(), nullable=False, server_default=sa.true()),
    )

    # user ↔ department, many-to-many (1 user can belong to several departments)
    op.create_table(
        "user_departments",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index("ix_user_departments_department_id", "user_departments", ["department_id"])

    # ===================== MODULE: knowledge (document storage) =====================
    # Markdown is the source of truth (knowledge-rag.md); no vector column. FKs → core only.

    op.create_table(
        "documents",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("owner_id", UUID, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False, server_default="md"),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("object_key", sa.String(512), nullable=False),
        sa.Column("content_type", sa.String(128), nullable=False, server_default="application/octet-stream"),
        sa.Column("size", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("department_id", UUID, sa.ForeignKey("departments.id", ondelete="SET NULL"), nullable=True),
        _ts(),
    )
    op.create_index("ix_documents_owner_id", "documents", ["owner_id"])
    op.create_index("ix_documents_department_id", "documents", ["department_id"])

    # ===================== MODULE: engine (agent-ops) =====================
    # Stateful. FKs → core (users/departments) or within engine (rooms/agents/quests/runs) only.

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

    op.create_table(
        "runs",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("kind", sa.String(16), nullable=False, server_default="agent"),  # agent | orchestration
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
    # reverse dependency order
    op.drop_table("run_steps")
    op.drop_table("runs")
    op.drop_table("quests")
    op.drop_table("agents")
    op.drop_table("rooms")
    op.drop_table("documents")
    op.drop_table("user_departments")
    op.drop_table("user_perms")
    op.drop_table("role_perms")
    op.drop_table("permissions")
    op.drop_table("roles")
    op.drop_table("departments")
    op.drop_table("users")
