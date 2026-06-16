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
from .services import agent_runner

log = logging.getLogger("pikaos.worker")


async def ping(ctx) -> str:
    """Trivial job — confirms the worker is wired to Redis."""
    return "pong"


async def agent_run(ctx, run_id: str) -> str:
    """arq job: execute (or resume) one agent run. See services/agent_runner.run."""
    return await agent_runner.run_job(run_id)


async def startup(ctx) -> None:
    """Wire the engine runtime once per worker. B4 replaces this with the stub provider +
    tool registry (set_engine_runtime); until then agent_run raises a clear error."""
    log.info("pikaos worker up — engine runtime pending (B4 stubs)")


class WorkerSettings:
    """arq worker config. Discovered via `arq app.worker.WorkerSettings`."""

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    on_startup = startup
    # `agent_run` keyed by run_id → arq dedups concurrent enqueues of the same run, so a
    # resume can't run twice in parallel (replay-safety belt over the per-step guards).
    functions = [ping, func(agent_run, keep_result=3600)]
