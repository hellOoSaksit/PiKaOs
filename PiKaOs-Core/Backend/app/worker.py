"""arq worker entrypoint (B2) — the engine's run loop, plus whatever jobs the enabled plugins contribute.

Runs the agent-ops engine jobs out-of-process from the FastAPI web app — a crashed or slow job can't take
the API down, and jobs run concurrently. Same image, different command (`arq app.worker.WorkerSettings`);
see the `worker` service in deploy/docker-compose.ai.yml.

This module is **Core only** — it imports no plugin. The engine job `agent_run` is Base; every *feature*
job (e.g. knowledge's `ingest_document`) is contributed by its plugin's `jobs` list and discovered through
the Loader (dynamic import). At startup the worker assembles the DI container + Event Bus, runs each enabled
plugin's `register()/boot()`, and resolves the `knowledge.Retriever` contract for the engine — so the engine
gets RAG when knowledge is enabled and `None` when it isn't, without ever importing the plugin (§5).
"""
from __future__ import annotations

import logging

from arq import func
from arq.connections import RedisSettings

from . import modules, plugin_loader
from .core import contracts
from .core.config import settings
from .core.container import Container
from .core.db import SessionLocal
from .core.events import EventBus
from .core.logging_ctx import configure_worker_logging
from .core.services import agent_runner
from .core.services.engine_stubs import StubToolRegistry
from .core.services.llm_config_service import ConfiguredLLMProvider

log = logging.getLogger("pikaos.worker")


async def ping(ctx) -> str:
    """Trivial job — confirms the worker is wired to Redis."""
    return "pong"


async def agent_run(ctx, run_id: str) -> str:
    """arq job: execute (or resume) one agent run. See services/agent_runner.run."""
    return await agent_runner.run_job(run_id)


async def startup(ctx) -> None:
    """Wire structured logging (B7), assemble the plugin tier, and configure the engine runtime once per
    worker. The DI container + Event Bus are built here (this worker is a composition root); each enabled
    plugin's register()/boot() runs in dependency order, then the engine resolves its optional `Retriever`
    contract from the container — present iff a provider plugin (knowledge) is enabled. The LLM provider is
    resolved from the DB (llm_connections) per call with a short cache, env fallback; tools stay stub until C5."""
    configure_worker_logging()

    container, bus = Container(), EventBus()
    ctx["container"], ctx["bus"] = container, bus  # jobs read these off the arq context
    enabled = modules.enabled_optional_modules()
    booted = plugin_loader.register_plugins(enabled, modules.PLUGIN_MANIFESTS,
                                            plugin_loader.PluginContext(container=container, events=bus,
                                                                        session_factory=SessionLocal,
                                                                        settings=settings))

    # The engine consumes RAG only through the contract — never an import. Unresolved (no knowledge) → None.
    retriever = container.resolve(contracts.RETRIEVER)
    agent_runner.set_engine_runtime(ConfiguredLLMProvider(), StubToolRegistry(), retriever=retriever)
    log.info("pikaos worker up — structured logging on · engine runtime: DB-configured LLM "
             "(env fallback: %s) + stub tools · plugins booted: %s · RAG retriever: %s",
             settings.llm_provider, booted or "(none)", "on" if retriever else "off")


def _active_functions() -> list:
    """The arq job set for this build: infra `ping` + the engine `agent_run` (Base, always on) + the jobs
    every enabled plugin contributes via its `jobs` list (collected through the Loader — no plugin import
    here, §5). `agent_run` is keyed by run_id so arq dedups concurrent enqueues (resume replay-safety)."""
    plugin_jobs = plugin_loader.collect_jobs(modules.enabled_optional_modules(), modules.PLUGIN_MANIFESTS)
    return [ping, func(agent_run, keep_result=3600), *plugin_jobs]


class WorkerSettings:
    """arq worker config. Discovered via `arq app.worker.WorkerSettings`."""

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    functions = _active_functions()
