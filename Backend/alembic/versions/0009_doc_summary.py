"""documents.summary — doc-level summary produced at ingest (phase E / E7, knowledge-rag.md §6.2)

Ingest enrich B: the whole markdown is summarized once → stored here and also embedded as a
summary-chunk in doc_chunks. The summary is **derived metadata, rebuildable from the markdown**
(the §0 rule) — so it's nullable with no backfill: existing rows keep summary = NULL until their
next ingest, which is exactly correct (a re-ingest recomputes it). Reversible.

Revision ID: 0009_doc_summary
Revises: 0008_user_settings
Create Date: 2026-06-27
"""
from alembic import op
import sqlalchemy as sa

revision = "0009_doc_summary"
down_revision = "0008_user_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("summary", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "summary")
