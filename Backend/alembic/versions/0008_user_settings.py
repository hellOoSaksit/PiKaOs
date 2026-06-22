"""user_settings — per-user config that follows the user across devices

Personal preferences (theme, lexicon pack, ...) keyed by (user_id, key), stored server-side so
they travel with the user instead of the browser. Counterpart to app_settings (global). The
two-tier config rule is recorded in process/lessons.md (2026-06-22).

Revision ID: 0008_user_settings
Revises: 0007_app_settings
Create Date: 2026-06-22
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0008_user_settings"
down_revision = "0007_app_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_settings",
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("value", postgresql.JSONB(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("user_settings")
