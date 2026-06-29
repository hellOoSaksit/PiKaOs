"""documents.source_object_key — keep the original file as a Ref after converting to markdown
(phase E / E6, knowledge-rag.md §6.4)

When a pdf/word upload is ingested it is converted to markdown (the RAG truth, knowledge-rag.md
§0): the markdown becomes `object_key` and the original file is kept as a **Ref** in this new
column so the source can still be opened/cited. NULL = the upload was already markdown/text, so
there is no separate original (object_key IS the markdown).

Nullable + no backfill: existing rows keep object_key = their uploaded file and source = NULL,
which is exactly correct (md/log were never converted). Reversible.

Revision ID: 0006_doc_source
Revises: 0005_doc_chunks
Create Date: 2026-06-19
"""
from alembic import op
import sqlalchemy as sa

revision = "0006_doc_source"
down_revision = "0005_doc_chunks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("source_object_key", sa.String(512), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "source_object_key")
