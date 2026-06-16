"""arq worker entrypoint (B2).

Runs the agent-ops engine jobs out-of-process from the FastAPI web app — a crashed or slow
job can't take the API down, and jobs run concurrently. Same image, different command
(`arq app.worker.WorkerSettings`); see the `worker` service in docker-compose.yml.

Engine jobs (agent_run, hermes_plan/advance/finalize) are registered here in B3+. For now the
worker boots, connects to Redis, and exposes a `ping` job so the service is verifiable.
"""
from __future__ import annotations

import logging

from arq.connections import RedisSettings

from .config import settings

log = logging.getLogger("pikaos.worker")


async def ping(ctx) -> str:
    """Trivial job — confirms the worker is wired to Redis (B3 adds the real jobs)."""
    return "pong"


class WorkerSettings:
    """arq worker config. Discovered via `arq app.worker.WorkerSettings`."""

    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    functions = [ping]
