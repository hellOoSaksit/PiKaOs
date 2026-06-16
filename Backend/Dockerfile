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

EXPOSE 8000

# entrypoint runs migrations + seed, then starts uvicorn (see docker-entrypoint.sh).
# Invoke via `bash` (not `./`) so it works even though the compose dev mount (./Backend:/app)
# shadows the image with the host checkout, which may lack the +x bit (e.g. committed on Windows).
RUN chmod +x docker-entrypoint.sh
CMD ["bash", "docker-entrypoint.sh"]
