"""telegram channel — bot connection + account links + one-time link codes

The Telegram 2-way agent chat channel (features/telegram-integration.md). Additive only
(three new tables) → expand-contract safe, satisfies the release-and-rollback invariant.

- telegram_connections : the bot (encrypted token, webhook|polling mode), one active row.
- telegram_links       : trust anchor — a Telegram identity bound to a PiKaOs user.
- telegram_link_codes  : short-lived single-use codes minted by a logged-in user to link.

Revision ID: 0010_telegram
Revises: 0009_doc_summary
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0010_telegram"
down_revision = "0008_user_settings"
branch_labels = None
depends_on = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.create_table(
        "telegram_connections",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("bot_token_enc", sa.String(1024), nullable=True),        # Fernet ciphertext (never plaintext)
        sa.Column("mode", sa.String(16), nullable=False, server_default="polling"),  # webhook | polling
        sa.Column("webhook_secret_enc", sa.String(1024), nullable=True),   # Fernet ciphertext
        sa.Column("bot_username", sa.String(64), nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    # at most one active bot — partial unique index (only one row may have is_active = true)
    op.create_index(
        "uq_telegram_connections_active", "telegram_connections", ["is_active"],
        unique=True, postgresql_where=sa.text("is_active"),
    )

    op.create_table(
        "telegram_links",
        # Telegram's numeric user id — supplied by Telegram, NOT autoincrement (no sequence).
        sa.Column("tg_user_id", sa.BigInteger, primary_key=True, autoincrement=False),
        sa.Column("tg_chat_id", sa.BigInteger, nullable=False),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("task_id", UUID, nullable=True),  # logical ref -> ai.tasks.id (no cross-plugin FK)
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_telegram_links_user_id", "telegram_links", ["user_id"])

    op.create_table(
        "telegram_link_codes",
        sa.Column("code", sa.String(64), primary_key=True),
        sa.Column("user_id", UUID, nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_telegram_link_codes_user_id", "telegram_link_codes", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_telegram_link_codes_user_id", table_name="telegram_link_codes")
    op.drop_table("telegram_link_codes")
    op.drop_index("ix_telegram_links_user_id", table_name="telegram_links")
    op.drop_table("telegram_links")
    op.drop_index("uq_telegram_connections_active", table_name="telegram_connections")
    op.drop_table("telegram_connections")
