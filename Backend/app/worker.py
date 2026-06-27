"""arq worker entrypoint (B2).

Runs the agent-ops engine jobs out-of-process from the FastAPI web app — a crashed or slow
job can't take the API down, and jobs run concurrently. Same image, different command
(`arq app.worker.WorkerSettings`); see the `worker` service in deploy/docker-compose.ai.yml.

The `agent_run` job (B3) runs one agent loop via services/agent_runner. The `ingest_document`
job (E2) chunks + embeds an uploaded document into the RAG index. HERMES jobs
(hermes_plan/advance/finalize) land in C3. The engine runtime (LLM provider + tool
registry) is configured once on worker startup — stub in B4, real adapters in C1.
"""
from __future__ import annotations

import logging
import uuid

from arq import func
from arq.connections import RedisSettings

from . import modules
from .config import settings
from .db import SessionLocal
from .logging_ctx import configure_worker_logging
from .services import agent_runner, ingestion_service
from .services.embeddings import get_embedder
from .services.engine_stubs import StubToolRegistry
from .services.llm_config_service import ConfiguredLLMProvider

log = logging.getLogger("pikaos.worker")


async def ping(ctx) -> str:
    """Trivial job — confirms the worker is wired to Redis."""
    return "pong"


async def agent_run(ctx, run_id: str) -> str:
    """arq job: execute (or resume) one agent run. See services/agent_runner.run."""
    return await agent_runner.run_job(run_id)


async def ingest_document(ctx, doc_id: str) -> str:
    """arq job: chunk + embed one document into the RAG index (E2). The embedder is resolved
    from config per job (stub by default), so flipping `embed_provider` needs no code change.
    When `ingest_summary_enabled` (E7 enrich B) the doc is also summarized via the 'summarize'
    role — best-effort, off by default so ingest stays free/offline."""
    embedder = get_embedder()
    summarizer = ConfiguredLLMProvider(role="summarize") if settings.ingest_summary_enabled else None
    async with SessionLocal() as db:
        result = await ingestion_service.ingest_document(
            db, embedder, uuid.UUID(doc_id), summarizer=summarizer
        )
    return result["status"]


async def startup(ctx) -> None:
    """Wire structured logging (B7) + the engine runtime once per worker. The LLM provider is
    resolved from the DB (llm_connections) per call with a short cache, falling back to the
    .env provider — so an admin's UI change applies without a restart. Tools stay stub until C5."""
    configure_worker_logging()
    agent_runner.set_engine_runtime(ConfiguredLLMProvider(), StubToolRegistry())
    log.info("pikaos worker up — structured logging on · engine runtime: DB-configured LLM "
             "(env fallback: %s) + stub tools", settings.llm_provider)


# Jobs owned by an optional module — loaded only when that module is enabled (modularity.md §2.5),
# so a build without the engine doesn't advertise agent_run, etc. `ping` is infra (always on).
_MODULE_JOBS = {
    "engine": [func(agent_run, keep_result=3600)],
    "knowledge": [ingest_document],
}


def _active_functions() -> list:
    """The arq job set for this build: infra `ping` + the jobs of every enabled module."""
    fns = [ping]
    for name, jobs in _MODULE_JOBS.items():
        if modules.is_module_active(name):
            fns.extend(jobs)
    return fns


class WorkerSettings:
    """arq worker config. Discovered via `arq app.worker.WorkerSettings`."""

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    # `agent_run` keyed by run_id → arq dedups concurrent enqueues of the same run, so a
    # resume can't run twice in parallel (replay-safety belt over the per-step guards).
    functions = _active_functions()
