"""doc_chunks — RAG semantic index (phase E / M2, knowledge-rag.md §3)

The vector layer the knowledge store was designed to grow into. Markdown stays the source of
truth (knowledge-rag.md §0); these chunks are a **derived, rebuildable cache**: each row is one
heading-bounded slice of a document plus its bge-m3 embedding. They are searched by cosine
distance and re-created wholesale when a document is re-ingested — there is never data that lives
only here, so dropping/rebuilding the table loses nothing (the one rule that makes it last).

This migration also turns the `vector` extension back on (it was removed while unused — see
docker-compose.yml / 0001_baseline) and tracks ingest state on `documents` so the UI (E4) can
show whether a file has been embedded yet.

Key choices baked in here (changing them = re-embed the whole corpus, knowledge-rag.md §3 / E1):
  * dimension 1024 = bge-m3 — must equal config.embed_dim.
  * FK document_id → documents ON DELETE CASCADE: deleting a document removes its chunks, so
    there are never orphan vectors (phase-E acceptance criterion).
  * owner_id / department_id are denormalized from the document so retrieval can scope by
    permission without a join (retrieval that crosses scope = data leak — knowledge-rag.md §3).

Revision ID: 0005_doc_chunks
Revises: 0004_llm_role_bindings
Create Date: 2026-06-17
"""
from alembic import op
import sqlalchemy as sa

revision = "0005_doc_chunks"
down_revision = "0004_llm_role_bindings"
branch_labels = None
depends_on = None

# bge-m3 output dimension. Kept in sync with app/config.py:embed_dim — a vector column's
# dimension is fixed at DDL time, so this is the platform-wide embedding size.
EMBED_DIM = 1024


def upgrade() -> None:
    # The vector type ships with the pgvector image (docker-compose db). Idempotent.
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")

    # doc_chunks — written via raw SQL (here + repositories/doc_chunks.py) because asyncpg has no
    # built-in codec for the `vector` type; we pass embeddings as a '[..]'::vector literal instead
    # of pulling in the pgvector python binding (zero-dep ethos — same as the httpx LLM adapters).
    op.execute(
        f"""
        CREATE TABLE doc_chunks (
            id              uuid PRIMARY KEY,
            document_id     uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
            owner_id        uuid REFERENCES users(id) ON DELETE SET NULL,
            department_id   uuid REFERENCES departments(id) ON DELETE SET NULL,
            seq             integer NOT NULL,
            heading         text NOT NULL DEFAULT '',
            content         text NOT NULL DEFAULT '',
            embedding       vector({EMBED_DIM}) NOT NULL,
            embedding_model varchar(120) NOT NULL DEFAULT '',
            created_at      timestamptz NOT NULL DEFAULT now(),
            CONSTRAINT uq_doc_chunks_document_seq UNIQUE (document_id, seq)
        )
        """
    )
    op.create_index("ix_doc_chunks_document_id", "doc_chunks", ["document_id"])
    op.create_index("ix_doc_chunks_department_id", "doc_chunks", ["department_id"])
    op.create_index("ix_doc_chunks_owner_id", "doc_chunks", ["owner_id"])
    # Approximate-nearest-neighbour index for cosine search (the `<=>` operator). HNSW builds fine
    # on an empty table; it keeps top-k retrieval fast as the corpus grows.
    op.execute(
        "CREATE INDEX ix_doc_chunks_embedding ON doc_chunks "
        "USING hnsw (embedding vector_cosine_ops)"
    )

    # Ingest state on the document itself — so list/UI can show "embedded yet?" without scanning
    # chunks, and so re-ingest can record which model produced the current chunks.
    op.add_column("documents", sa.Column(
        "ingest_status", sa.String(16), nullable=False, server_default="pending"))  # pending|done|failed|skipped
    op.add_column("documents", sa.Column(
        "embedding_model", sa.String(120), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("documents", "embedding_model")
    op.drop_column("documents", "ingest_status")
    op.drop_index("ix_doc_chunks_embedding", table_name="doc_chunks")
    op.drop_index("ix_doc_chunks_owner_id", table_name="doc_chunks")
    op.drop_index("ix_doc_chunks_department_id", table_name="doc_chunks")
    op.drop_index("ix_doc_chunks_document_id", table_name="doc_chunks")
    op.drop_table("doc_chunks")
    # Leave the `vector` extension in place — dropping it would fail if any other object uses it,
    # and it's harmless to keep. Re-enabling is idempotent on the next upgrade.
