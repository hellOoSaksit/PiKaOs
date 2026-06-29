"""engine test sink (stub_tool_writes) — kept out of the domain baseline

A test-only fixture for the engine's stub tools (B4/B6): record (side_effect, plain INSERT,
at-most-once) and upsert (idempotent_write, ON CONFLICT(idempotency_key) DO NOTHING). Separated
from 0001_baseline so the canonical domain ER (core/knowledge/engine) stays free of test tables
(modularity.md §4). Inert in any real deployment — only the stub tool registry writes here.

Revision ID: 0002_stub_tool_sink
Revises: 0001_baseline
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_stub_tool_sink"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)
JSONB = postgresql.JSONB


def upgrade() -> None:
    op.create_table(
        "stub_tool_writes",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("run_id", UUID, sa.ForeignKey("runs.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("tool", sa.String(120), nullable=False, server_default=""),
        sa.Column("idempotency_key", sa.String(128), nullable=False),
        sa.Column("payload", JSONB, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("idempotency_key", name="uq_stub_tool_writes_key"),
    )


def downgrade() -> None:
    op.drop_table("stub_tool_writes")
