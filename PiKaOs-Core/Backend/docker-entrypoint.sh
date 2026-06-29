#!/usr/bin/env bash
set -e

echo "[entrypoint] running migrations..."
alembic upgrade head

echo "[entrypoint] seeding database..."
python -m scripts.seed

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
