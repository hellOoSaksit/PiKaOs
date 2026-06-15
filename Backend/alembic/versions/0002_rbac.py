"""rbac: roles, permissions, role_perms, user_perms (server-side RBAC — A1)

Revision ID: 0002_rbac
Revises: 0001_init
Create Date: 2026-06-15
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002_rbac"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
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
        sa.Column("role_key", sa.String(32),
                  sa.ForeignKey("roles.key", ondelete="CASCADE"), primary_key=True),
        sa.Column("perm_key", sa.String(64),
                  sa.ForeignKey("permissions.key", ondelete="CASCADE"), primary_key=True),
    )

    op.create_table(
        "user_perms",
        sa.Column("user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("perm_key", sa.String(64),
                  sa.ForeignKey("permissions.key", ondelete="CASCADE"), primary_key=True),
        sa.Column("allow", sa.Boolean(), nullable=False, server_default=sa.true()),
    )


def downgrade() -> None:
    op.drop_table("user_perms")
    op.drop_table("role_perms")
    op.drop_table("permissions")
    op.drop_table("roles")
