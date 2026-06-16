"""arq worker entrypoint (B2).

Runs the agent-ops engine jobs out-of-process from the FastAPI web app — a crashed or slow
job can't take the API down, and jobs run concurrently. Same image, different command
(`arq app.worker.WorkerSettings`); see the `worker` service in docker-compose.yml.

The `agent_run` job (B3) runs one agent loop via services/agent_runner. HERMES jobs
(hermes_plan/advance/finalize) land in C3. The engine runtime (LLM provider + tool
registry) is configured once on worker startup — stub in B4, real adapters in C1.
"""
from __future__ import annotations

import logging

from arq import func
from arq.connections import RedisSettings

from .config import settings
from .logging_ctx import configure_worker_logging
from .services import agent_runner
from .services.engine_stubs import StubLLMProvider, StubToolRegistry

log = logging.getLogger("pikaos.worker")


async def ping(ctx) -> str:
    """Trivial job — confirms the worker is wired to Redis."""
    return "pong"


async def agent_run(ctx, run_id: str) -> str:
    """arq job: execute (or resume) one agent run. See services/agent_runner.run."""
    return await agent_runner.run_job(run_id)


async def startup(ctx) -> None:
    """Wire structured logging (B7) + the engine runtime once per worker — the stub LLM
    provider + tool registry (B4). Real adapters (OpenAI/Anthropic/Local) swap in here at C1."""
    configure_worker_logging()
    agent_runner.set_engine_runtime(StubLLMProvider(), StubToolRegistry())
    log.info("pikaos worker up — structured logging on · engine runtime: stub LLM + stub tools")


class WorkerSettings:
    """arq worker config. Discovered via `arq app.worker.WorkerSettings`."""

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    # `agent_run` keyed by run_id → arq dedups concurrent enqueues of the same run, so a
    # resume can't run twice in parallel (replay-safety belt over the per-step guards).
    functions = [ping, func(agent_run, keep_result=3600)]
