"""stub engine tool sink (B4)

A small table the stub tools write to, so the engine's two-phase / effect-class behaviour
is *observable* end-to-end (B6 kills a worker mid-tool and asserts the row count):
- side_effect tool (`record`) → plain INSERT (at-most-once; the runner never auto-retries it).
- idempotent_write tool (`upsert`) → INSERT … ON CONFLICT(idempotency_key) DO NOTHING, so a
  replay-safe resume re-runs the same key without a second row.

UNIQUE(idempotency_key) makes the upsert dedup provable. The table is inert in prod (only the
stub tools touch it) — kept as a permanent engine self-test fixture.

Revision ID: 0005_stub_tool_writes
Revises: 0004_engine
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0005_stub_tool_writes"
down_revision = "0004_engine"
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
