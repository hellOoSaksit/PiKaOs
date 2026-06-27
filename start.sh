#!/usr/bin/env bash
# ===========================================================
#  PiKaOs launcher (Linux) — the Linux counterpart of start.bat.
#  Split 4-stack — the only supported way to run (CLAUDE.md §0).
#
#  Flow (same as start.bat, Linux mechanics):
#    1) make sure the Docker engine answers `docker info`
#         - if not, try `sudo systemctl start docker` and wait
#         - (first time? run ./setup.sh once — group + env files)
#    2) bring up the 4 SEPARATE stacks (each its own compose
#       project/network), in order so each is ready before the next:
#         data     (db, redis, minio)            -p pikaos-data
#         backend  (FastAPI API, hot-reload)     -p pikaos-backend  (+ sim overlay)
#         ai       (arq worker)                  -p pikaos-ai
#         frontend (Vite dev server, hot-reload) -p pikaos-frontend
#    3) open the app in the browser (xdg-open) and exit
#
#  Stacks talk over the host (host.docker.internal:<port>) — the
#  compose files map that to host-gateway so it resolves on Linux.
#  Stop everything with ./stop.sh. Watch logs:
#    docker compose -p pikaos-frontend logs -f   (or -backend / -ai / -data)
# ===========================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
red()   { printf '\033[31m%s\033[0m\n' "$*"; }

cyan "==========================================================="
cyan "       .:::.   P i K a O S   .:::."
cyan "       Agent-Ops Workspace launcher  (split 4-stack)"
cyan "==========================================================="
echo

# ---- poll helpers (mirror :waitdocker / :waitbackend in start.bat) ----
wait_docker() {  # $1 = max seconds
  local max="$1" t=0
  while ! docker info >/dev/null 2>&1; do
    (( t += 2 )); (( t >= max )) && return 1
    printf '.'; sleep 2
  done
  return 0
}
wait_backend() {  # $1 = max seconds; 200 only via --fail
  local max="$1" t=0
  while ! curl -fsS -m 2 -o /dev/null http://127.0.0.1:8000/api/health 2>/dev/null; do
    (( t += 2 )); (( t >= max )) && return 1
    printf '.'; sleep 2
  done
  return 0
}

# ---- 1. Docker preflight ---------------------------------------
echo "[1/3] Checking Docker engine..."
if docker info >/dev/null 2>&1; then
  echo "      Docker is already running."
else
  # Distinguish "daemon down" from "no permission" so the message is useful.
  if ! id -nG "$USER" | tr ' ' '\n' | grep -qx docker && ! [ -w /var/run/docker.sock ]; then
    red "      Cannot reach the Docker daemon and you're not in the 'docker' group."
    yellow "      Run ./setup.sh once, then re-login (or 'newgrp docker'), then ./start.sh."
    exit 1
  fi
  echo "      Docker not responding — trying 'sudo systemctl start docker'..."
  sudo systemctl start docker || true
  printf '      Waiting for the engine'
  if wait_docker 45; then echo; else
    echo
    red "  *** Docker engine did not come up. ***"
    yellow "  Check it with:  systemctl status docker   /   journalctl -u docker -e"
    exit 1
  fi
fi
echo "      Docker engine OK."
echo

# ---- env preflight (point at setup.sh instead of failing cryptically) ----
missing=0
for f in Backend/.env .env.ai Frontend/.env; do
  [[ -f "$f" ]] || { yellow "      Missing env file: $f"; missing=1; }
done
if [[ "$missing" == "1" ]]; then
  yellow "      Run ./setup.sh first to create the env files from the templates."
  exit 1
fi

# ---- 2. bring up the 4 stacks (order matters) ------------------
echo "[2/3] (1/4) data stack  (db, redis, minio)..."
docker compose -p pikaos-data -f deploy/docker-compose.data.yml up -d --wait \
  || { red "      ERROR: data stack failed to start."; exit 1; }

echo "      (2/4) backend stack (FastAPI + migrate/seed)..."
docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml up -d --build --wait backend \
  || { red "      ERROR: backend stack failed to start."; exit 1; }

echo "      (3/4) ai stack      (arq worker)..."
docker compose -p pikaos-ai -f deploy/docker-compose.ai.yml up -d --build \
  || yellow "      WARNING: ai/worker stack failed to start — continuing."

echo "      (4/4) frontend stack (Vite dev server)..."
docker compose -p pikaos-frontend -f deploy/docker-compose.frontend.dev.yml up -d --build \
  || { red "      ERROR: frontend stack failed to start."; exit 1; }

printf "      Waiting for the backend API (so the UI doesn't load before it's ready)"
if wait_backend 90; then echo; echo "      Backend API is ready."; else
  echo; yellow "      Backend not ready yet — opening anyway; reload the page in a moment."
fi
echo

# ---- 3. open the app + exit (logs live in docker) --------------
echo "[3/3] Opening http://localhost:5173 ..."
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5173" >/dev/null 2>&1 &
else
  yellow "      (no xdg-open) open this manually: http://localhost:5173"
fi
echo
green "      All 4 stacks run in Docker. Stop them with ./stop.sh. Watch logs:"
echo  "        docker compose -p pikaos-frontend logs -f   (or -backend / -ai / -data)"
