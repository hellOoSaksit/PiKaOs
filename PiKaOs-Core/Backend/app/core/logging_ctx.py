"""Structured logging context for the engine (B7).

Every worker log line carries the run it belongs to — run_id / parent_run_id / task_id —
without threading those ids through every log call. A `contextvars.ContextVar` holds the
current run's identifiers (async-safe: each arq job runs in its own task context, so
concurrent runs never bleed into each other's logs), a logging `Filter` copies them onto
every LogRecord (defaulting to "-" when unbound), and the worker formatter prints them.

Used to attribute load + trace a run across the worker — and, once modules share one
Center Server (modularity.md), to tell which run/task a noisy log line came from.
"""
from __future__ import annotations

import contextvars
import logging

# Fields injected onto every record. Order = display order in the formatter.
_FIELDS = ("run_id", "parent_run_id", "task_id", "agent_id")

_run_ctx: contextvars.ContextVar[dict] = contextvars.ContextVar("pikaos_run_ctx", default={})

LOG_FORMAT = (
    "%(asctime)s %(levelname)s %(name)s "
    "[run=%(run_id)s parent=%(parent_run_id)s task=%(task_id)s agent=%(agent_id)s] %(message)s"
)


def bind_run(**fields: str | None) -> contextvars.Token:
    """Merge non-None identifiers into the current run context. Returns a token; pass it to
    reset_run() to restore the previous context (call once per job at the entrypoint)."""
    current = dict(_run_ctx.get())
    current.update({k: v for k, v in fields.items() if v is not None and k in _FIELDS})
    return _run_ctx.set(current)


def reset_run(token: contextvars.Token) -> None:
    _run_ctx.reset(token)


class RunContextFilter(logging.Filter):
    """Copy the bound run identifiers onto each record (missing → '-'), so the formatter
    can print them on every line regardless of who logged it."""

    def filter(self, record: logging.LogRecord) -> bool:
        ctx = _run_ctx.get()
        for field in _FIELDS:
            setattr(record, field, ctx.get(field, "-"))
        return True


def configure_worker_logging(level: int = logging.INFO) -> None:
    """Route all `pikaos.*` logs through one structured handler (idempotent). Scoped to the
    pikaos namespace + propagate=False so it doesn't fight arq's own lifecycle logging."""
    logger = logging.getLogger("pikaos")
    logger.handlers.clear()
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter(LOG_FORMAT))
    handler.addFilter(RunContextFilter())
    logger.addHandler(handler)
    logger.setLevel(level)
    logger.propagate = False
