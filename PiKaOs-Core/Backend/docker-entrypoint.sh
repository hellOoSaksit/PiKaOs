#!/usr/bin/env bash
set -e

echo "[entrypoint] running Core migrations..."
alembic upgrade head

# Resolve the plugin registry (set by the install UI) into ENABLED_MODULES so this boot mounts exactly
# what the registry wants (restart-to-apply, plugin-lifecycle-ui §7). compute_enabled exits 0 ONLY when a
# registry exists → we override; otherwise (empty registry / first boot) the existing env value stands.
# Run BEFORE the plugin migrations below so the enabled set they migrate is the final one.
if RESOLVED="$(python -m scripts.compute_enabled)"; then
  echo "[entrypoint] plugin registry → ENABLED_MODULES='${RESOLVED}'"
  export ENABLED_MODULES="${RESOLVED}"
fi

# Per-plugin schema step: each enabled plugin that owns tables creates + seeds them on its own metadata
# (Phase C). Auth's users/roles/permissions live here now, not in Core's Alembic baseline. Idempotent.
echo "[entrypoint] running enabled-plugin migrations + seed..."
python -m scripts.migrate_plugins

# Dev (UVICORN_RELOAD set) → single worker with hot-reload (code is volume-mounted).
# Otherwise → multiple workers so one crashed/leaked worker can't take the whole API down;
# uvicorn's supervisor restarts dead workers. Tune the count with WEB_CONCURRENCY. (A8)
if [ -n "${UVICORN_RELOAD}" ]; then
  echo "[entrypoint] starting uvicorn (reload, 1 worker)..."
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
  echo "[entrypoint] starting uvicorn (${WEB_CONCURRENCY:-4} workers)..."
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers "${WEB_CONCURRENCY:-4}"
fi
