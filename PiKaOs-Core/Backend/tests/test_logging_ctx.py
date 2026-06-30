"""Tests for engine structured-logging context (B7).

Pure (no DB/worker): the contextvar binding + the logging Filter that stamps every record
with run_id/parent_run_id/task_id/agent_id. Proves unbound records default to '-', bound
records carry the ids, merges accumulate, and reset restores cleanly (no leak between jobs).

    docker compose exec backend pytest tests/test_logging_ctx.py
"""
from __future__ import annotations

import logging

from app.core.logging_ctx import RunContextFilter, bind_run, configure_worker_logging, reset_run


def _record() -> logging.LogRecord:
    return logging.LogRecord("pikaos.engine", logging.INFO, __file__, 1, "msg", None, None)


def _stamp(record: logging.LogRecord) -> logging.LogRecord:
    RunContextFilter().filter(record)
    return record


def test_unbound_defaults_to_dash():
    r = _stamp(_record())
    assert r.run_id == "-" and r.parent_run_id == "-" and r.task_id == "-" and r.agent_id == "-"


def test_bind_populates_then_reset_restores():
    token = bind_run(run_id="r1", task_id="q1")
    try:
        r = _stamp(_record())
        assert r.run_id == "r1" and r.task_id == "q1"
        assert r.parent_run_id == "-" and r.agent_id == "-"  # only what was bound
    finally:
        reset_run(token)
    assert _stamp(_record()).run_id == "-"  # context cleared — nothing leaks to the next job


def test_bind_merges_and_ignores_none_and_unknown():
    t1 = bind_run(run_id="r1")
    t2 = bind_run(task_id="q1", parent_run_id=None, bogus="x")  # None + unknown key ignored
    try:
        r = _stamp(_record())
        assert r.run_id == "r1" and r.task_id == "q1"  # merged across binds
        assert r.parent_run_id == "-" and not hasattr(r, "bogus")
    finally:
        reset_run(t2)
        reset_run(t1)


def test_filter_always_returns_true():
    assert RunContextFilter().filter(_record()) is True


def test_configure_worker_logging_is_idempotent():
    configure_worker_logging()
    configure_worker_logging()
    logger = logging.getLogger("pikaos")
    assert len(logger.handlers) == 1               # not duplicated on repeat calls
    assert logger.propagate is False               # scoped — doesn't double-log via arq/root
    handler = logger.handlers[0]
    assert any(isinstance(f, RunContextFilter) for f in handler.filters)
