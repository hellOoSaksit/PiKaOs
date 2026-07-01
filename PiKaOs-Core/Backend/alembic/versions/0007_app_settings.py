"""app_settings — server-scoped key/value config (cross-device, admin-set)

A small JSONB key/value store for settings that must be identical for every user and device.
The first consumer is the sidebar nav arrangement (`key="nav"`), which used to live in each
browser's localStorage (so it never crossed machines). Reads are any authenticated user; writes
are gated per-key in the router. Generic on purpose so later server-scope config reuses it.

Revision ID: 0007_app_settings
Revises: 0006_doc_source
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0007_app_settings"
down_revision = "0004_llm_role_bindings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True),
                  nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("app_settings")
