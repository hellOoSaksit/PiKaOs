FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# build deps for asyncpg / argon2 wheels are prebuilt, but keep curl for healthcheck
RUN apt-get update && apt-get install -y --no-install-recommends curl git \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Build-merge (kernel-redesign.md §2–§3, "install engine = HYBRID"): every datastore/feature lib is
# plugin-owned. If link-plugins.sh + scripts/render_requirements.py produced a requirements.lock
# (kernel + enabled-plugin libs), install the extra plugin libs it declares on top of the kernel layer
# above. A bare kernel build ships NO lock → kernel-only image, and Core's plugin-free suite runs on it
# unchanged. (This bakes the LIBS; the plugin CODE is mounted/linked per the deploy flow.)
RUN if [ -f requirements.lock ]; then pip install --no-cache-dir -r requirements.lock; fi

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

# Fix-SEC-05: drop root — the app runs as a non-root user (least privilege; a container compromise no
# longer starts as root). APP_UID defaults to 1000 to MATCH the dev host user, so the bind-mounted
# source (./Backend:/app) and the shared kernelstate volume (/app/state) stay writable under the dev
# compose. In prod (baked image + fresh named volume) Docker seeds the empty volume's ownership from
# the chowned /app/state below, so the worker/api can write the plugin registry.
# NOTE: requires an image rebuild + clean-slate (`down -v`) to take effect; an existing root-owned
# kernelstate volume must be recreated so appuser can write it.
ARG APP_UID=1000
RUN useradd --create-home --uid ${APP_UID} appuser \
    && mkdir -p /app/state \
    && chown -R appuser:appuser /app
USER appuser

CMD ["bash", "docker-entrypoint.sh"]
