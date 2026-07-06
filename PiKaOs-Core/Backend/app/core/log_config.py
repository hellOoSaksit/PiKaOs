"""Uvicorn access-log filter for the web process — silences polled healthcheck noise.

Docker's HEALTHCHECK (Backend/Dockerfile) GETs /api/version every 15s; uvicorn logs every
request at INFO by default, so that one probe buries real request/error lines in
`docker compose logs`. Wired in via `--log-config uvicorn_log_config.json`
(docker-entrypoint.sh), which references this module's filter by dotted path.
"""
from __future__ import annotations

import logging

# Endpoints whose successful access-log line is pure noise (polled on a fixed interval,
# carries no diagnostic value on a 2xx) — currently just the Docker healthcheck probe.
SILENCED_PATHS = frozenset({"/api/version"})


class HealthCheckFilter(logging.Filter):
    """Drop uvicorn access-log records for SILENCED_PATHS.

    uvicorn's access logger call is `logger.info('%s - "%s %s HTTP/%s" %d', client_addr,
    method, path_with_query, http_version, status)` (uvicorn h11_impl.py / httptools_impl.py,
    verified against the installed 0.49.0) — the request path lives at `record.args[2]`.
    """

    def filter(self, record: logging.LogRecord) -> bool:
        if not record.args or len(record.args) < 3:
            return True
        path = str(record.args[2]).split("?", 1)[0]
        return path not in SILENCED_PATHS
