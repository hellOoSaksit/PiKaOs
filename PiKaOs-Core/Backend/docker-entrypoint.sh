#!/usr/bin/env bash
set -e

# Zero-datastore kernel: Core owns no tables and no Alembic. Every table is plugin-owned and created by
# scripts.migrate_plugins below (create_all), so there is no Core migration step here anymore.

# Resolve the plugin registry (set by the install UI) into ENABLED_MODULES so this boot mounts exactly
# what the registry wants (restart-to-apply, plugin-lifecycle-ui §7). compute_enabled exits 0 ONLY when a
# registry exists → we override; otherwise (empty registry / first boot) the existing env value stands.
# Run BEFORE the plugin migrations below so the enabled set they migrate is the final one.
if RESOLVED="$(python -m scripts.compute_enabled)"; then
  echo "[entrypoint] plugin registry → ENABLED_MODULES='${RESOLVED}'"
  export ENABLED_MODULES="${RESOLVED}"
fi

# Dev/deploy-baked DB marker: when DB_CONFIG_SOURCE=env, tell the postgres plugin its DSN comes from
# env (DATABASE_URL) rather than the install-time db-choice wizard, so `needsDbConfig` is false and
# dev/CI stacks boot straight through (see PiKaOs-Plugin-Tools-Postgres/backend/db_config.py mark_env).
# Guarded two ways: the env var must be set (prod leaves it unset → the wizard runs), and the postgres
# plugin must actually be linked in — `find_spec` returns None (falsy) when it isn't, so this is a
# silent no-op rather than an ImportError; `|| true` additionally never fails the boot either way.
if [ "${DB_CONFIG_SOURCE:-}" = "env" ]; then
  python -c "import importlib.util as u; (u.find_spec('app.plugins.postgres') and __import__('app.plugins.postgres.db_config', fromlist=['mark_env']).mark_env())" || true
fi

# Bootstrap gate: print this boot's console-only setup code (once, before any uvicorn worker spawns —
# see scripts/generate_setup_code.py for why it can't just happen at app import time). No-ops once
# `auth` is enabled.
python -m scripts.generate_setup_code

# Per-plugin schema step: each enabled plugin that owns tables creates + seeds them on its own metadata
# (Phase C). Auth's users/roles/permissions live here now, not in Core's Alembic baseline. Idempotent.
echo "[entrypoint] running enabled-plugin migrations + seed..."
python -m scripts.migrate_plugins

# Dev (UVICORN_RELOAD set) → single worker with hot-reload (code is volume-mounted).
# Otherwise → multiple workers so one crashed/leaked worker can't take the whole API down;
# uvicorn's supervisor restarts dead workers. Tune the count with WEB_CONCURRENCY. (A8)
# --log-config silences the /api/version access-log line Docker's HEALTHCHECK triggers every
# 15s (app/core/log_config.py) — without it that single probe drowns out real request/error
# lines in `docker compose logs`. uvicorn.error (startup/shutdown/exceptions) is untouched.
# Bind loopback by default (G2 safe default); compose sets BIND_HOST=0.0.0.0 for Docker, where the
# container must listen on all interfaces and host exposure is controlled by the `ports:` binding.
BIND_HOST="${BIND_HOST:-127.0.0.1}"
if [ -n "${UVICORN_RELOAD}" ]; then
  echo "[entrypoint] starting uvicorn (reload, 1 worker) on ${BIND_HOST}:8000..."
  exec uvicorn app.main:app --host "${BIND_HOST}" --port 8000 --reload --log-config uvicorn_log_config.json
else
  echo "[entrypoint] starting uvicorn (${WEB_CONCURRENCY:-4} workers) on ${BIND_HOST}:8000..."
  exec uvicorn app.main:app --host "${BIND_HOST}" --port 8000 --workers "${WEB_CONCURRENCY:-4}" --log-config uvicorn_log_config.json
fi
