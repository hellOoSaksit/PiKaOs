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

    # NOTE (AI extraction): the engine tables — rooms · agents · tasks · runs · run_steps (+
    # stub_tool_writes · llm_connections · llm_role_bindings, formerly migrations 0002/0003/0004) — moved
    # to the `ai` plugin. It owns them on its own metadata and creates them via its migrate() step. Core
    # no longer creates any of them.
    #
    # After the auth/knowledge/ai/chat extractions AND the settings→local-JSON move, this baseline (and the
    # whole Core Alembic history) creates NO tables at all — the kernel Base is empty. Core's former own
    # tables app_settings/user_settings (migrations 0007/0008, now deleted) became kernel local-JSON state
    # (app/core/kernel_state.py); the telegram tables (0010) left for the chat plugin + telegram Tool. Every
    # remaining table is plugin-owned (created by each plugin's migrate() step, not here). Kept as the chain
    # root (down_revision=None) so the history stays linear on a fresh DB.
    pass


def downgrade() -> None:
    pass
