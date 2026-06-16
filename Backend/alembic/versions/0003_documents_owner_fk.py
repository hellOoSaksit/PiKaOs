"""documents: FK owner_id -> users (ON DELETE SET NULL) + index — A3

`documents.owner_id` shipped in 0001_init as a bare UUID with no referential integrity.
This adds the FK + an index. SET NULL (not CASCADE): deleting a user keeps their documents
but clears ownership — owner_id is nullable. Cheap now while the table is still empty.

See docs/architecture/risk-mitigation.md §4.4.

Revision ID: 0003_documents_owner_fk
Revises: 0002_rbac
Create Date: 2026-06-16
"""
from alembic import op

revision = "0003_documents_owner_fk"
down_revision = "0002_rbac"
branch_labels = None
depends_on = None

_FK = "fk_documents_owner_id_users"
_IX = "ix_documents_owner_id"


def upgrade() -> None:
    op.create_index(_IX, "documents", ["owner_id"])
    op.create_foreign_key(
        _FK, "documents", "users", ["owner_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint(_FK, "documents", type_="foreignkey")
    op.drop_index(_IX, table_name="documents")
