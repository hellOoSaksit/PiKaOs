#!/usr/bin/env bash
# Worker entrypoint — mirrors the API's registry→ENABLED_MODULES resolution (docker-entrypoint.sh) so a
# plugin disabled/enabled in the install UI also changes which JOBS the worker runs (restart-to-apply,
# plugin-lifecycle-ui §7). The worker collects its jobs at import from the enabled set, so the env var must
# be resolved BEFORE arq imports WorkerSettings — same reason the API resolves it before uvicorn.
#
# compute_enabled exits 0 only when a plugin registry exists → we override ENABLED_MODULES; otherwise
# (empty registry / DB down) the existing env value stands. The worker runs NO migrations/seed — the API
# owns those; this only resolves the enabled set, then hands off to arq.
set -e

if RESOLVED="$(python -m scripts.compute_enabled)"; then
  echo "[worker] plugin registry → ENABLED_MODULES='${RESOLVED}'"
  export ENABLED_MODULES="${RESOLVED}"
fi

exec arq app.worker.WorkerSettings
