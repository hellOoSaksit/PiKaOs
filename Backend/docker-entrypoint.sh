#!/usr/bin/env bash
set -e

echo "[entrypoint] running migrations..."
alembic upgrade head

echo "[entrypoint] seeding database..."
python -m scripts.seed

echo "[entrypoint] starting uvicorn..."
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 ${UVICORN_RELOAD:+--reload}
