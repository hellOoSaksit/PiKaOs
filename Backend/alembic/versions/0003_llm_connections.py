"""llm_connections — runtime-configurable LLM providers (no-hardcode)

Lets admins set the engine's LLM provider/model/endpoint/key from the UI (จัดการเครื่องมือ)
instead of `.env`/config.py. The API key is stored **encrypted** (app/crypto.py), never
plaintext. One row may be `is_active` — the worker resolves it per call (short cache), so
edits take effect without a redeploy. Falls back to the .env-based provider when none active.

Revision ID: 0003_llm_connections
Revises: 0002_stub_tool_sink
Create Date: 2026-06-16
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003_llm_connections"
down_revision = "0002_stub_tool_sink"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "llm_connections",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),       # ollama | openai | anthropic
        sa.Column("model", sa.String(120), nullable=False, server_default=""),
        sa.Column("base_url", sa.String(512), nullable=True),
        sa.Column("api_key_enc", sa.String(1024), nullable=True),   # Fernet ciphertext (never plaintext)
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # at most one active connection — partial unique index (only one row may have is_active = true)
    op.create_index(
        "uq_llm_connections_active", "llm_connections", ["is_active"],
        unique=True, postgresql_where=sa.text("is_active"),
    )


def downgrade() -> None:
    op.drop_index("uq_llm_connections_active", table_name="llm_connections")
    op.drop_table("llm_connections")
