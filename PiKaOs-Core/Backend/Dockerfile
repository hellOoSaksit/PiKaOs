FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# build deps for asyncpg / argon2 wheels are prebuilt, but keep curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Immutable build identity baked into the image (CI passes --build-arg BUILD_HASH=$GIT_SHA);
# read by config.build_hash → /api/version for version-skew detection (release-and-rollback.md §4).
ARG BUILD_HASH=dev
ENV BUILD_HASH=$BUILD_HASH

EXPOSE 8000

# Liveness probe for the API (release-and-rollback.md §2: start-first rolling update needs the new
# task to report healthy before the old one stops). Hits /api/version — no dependency I/O, so a
# blipping Redis/MinIO can't falsely fail the check. The WORKER (same image, no HTTP server) OVERRIDES
# this with `arq ... --check` in its compose/stack service.
HEALTHCHECK --interval=15s --timeout=3s --start-period=40s --retries=3 \
    CMD curl -fsS http://localhost:8000/api/version || exit 1

# entrypoint runs migrations + seed, then starts uvicorn (see docker-entrypoint.sh).
# Invoke via `bash` (not `./`) so it works even though the compose dev mount (./Backend:/app)
# shadows the image with the host checkout, which may lack the +x bit (e.g. committed on Windows).
RUN chmod +x docker-entrypoint.sh
CMD ["bash", "docker-entrypoint.sh"]
