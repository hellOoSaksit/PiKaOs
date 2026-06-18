"""llm_role_bindings — per-system LLM assignment (no-hardcode)

Lets admins pick *which* connection a given system role uses, from the UI (จัดการเครื่องมือ):
e.g. the search/RAG system → a local llama, the engine → Claude. A role with no binding
falls back to the active connection (and then to the .env provider). The binding points at a
`llm_connections` row; deleting that connection cascades the binding away.

Revision ID: 0004_llm_role_bindings
Revises: 0003_llm_connections
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_llm_role_bindings"
down_revision = "0003_llm_connections"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "llm_role_bindings",
        sa.Column("role", sa.String(32), primary_key=True),     # engine | search | summarize | ...
        sa.Column(
            "connection_id", UUID,
            sa.ForeignKey("llm_connections.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("llm_role_bindings")
