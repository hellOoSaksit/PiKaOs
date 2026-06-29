"""Knowledge plugin — codex/documents + RAG (ingest · chunk · embed · search · answer).

A **plugin** (off unless ENABLED_MODULES lists `knowledge`). Was flat under app/routers/knowledge.py +
app/services/{ingestion,retrieval,summarize,answer,knowledge}_service.py + chunking/converters +
app/repositories/{doc_chunks,documents}.py; moved here per [extraction-plan.md]. The shared
`embeddings` + the `vector(N)` column type stay in the **Base** (used by db/models/config), so this
plugin depends on the Base — never the reverse. The engine consumes RAG only through the injected
`retriever` (see retriever.py), so the Base never imports this plugin.
"""
from .router import router

__all__ = ["router"]
