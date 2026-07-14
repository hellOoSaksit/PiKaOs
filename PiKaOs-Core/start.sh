#!/usr/bin/env bash
# ===========================================================
#  PiKaOs launcher (Linux) — the Linux counterpart of start.bat.
#  Single generated compose project — the only supported way to run (CLAUDE.md §0).
#
#  Flow:
#    1) make sure the Docker engine answers `docker info`
#         - if not, try `sudo systemctl start docker` and wait
#         - (first time? run ./setup.sh once — group + env files)
#    2) render deploy/docker-compose.generated.yml: the kernel base
#       (backend + frontend) merged with every ENABLED tool plugin's
#       compose.fragment.yml (Backend/scripts/render_compose.py —
#       kernel-redesign.md §3, install-time compose generation)
#    3) bring up the ONE generated stack, -p pikaos
#    4) open the app in the browser (xdg-open) and exit
#
#  All services share one compose network now (backend/frontend/worker/
#  db/redis/minio reach each other by service name — no host.docker.internal).
#  Stop everything with ./stop.sh. Watch logs: docker compose -p pikaos logs -f
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
cyan "       Agent-Ops Workspace launcher"
cyan "==========================================================="
echo

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
echo "[1/4] Checking Docker engine..."
if docker info >/dev/null 2>&1; then
  echo "      Docker is already running."
else
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
if [[ ! -f "Backend/.env" ]]; then
  yellow "      Missing env file: Backend/.env"
  yellow "      Run ./setup.sh first to create it from the template."
  exit 1
fi

# ---- 2. render the compose file (base + enabled tool fragments) ----
echo "[2/4] Rendering docker-compose.generated.yml..."
if ! python3 Backend/scripts/render_compose.py; then
  red "      ERROR: render_compose.py failed."
  exit 1
fi
echo

# ---- 3. bring up the ONE generated stack ------------------------
echo "[3/4] Starting the stack (build + wait for health)..."
docker compose -p pikaos -f deploy/docker-compose.generated.yml up -d --build --wait \
  || { red "      ERROR: stack failed to start."; docker compose -p pikaos -f deploy/docker-compose.generated.yml logs; exit 1; }

printf "      Waiting for the backend API (so the UI doesn't load before it's ready)"
if wait_backend 90; then echo; echo "      Backend API is ready."; else
  echo; yellow "      Backend not ready yet — opening anyway; reload the page in a moment."
fi
echo

# ---- 4. open the app + exit (logs live in docker) --------------
echo "[4/4] Opening http://localhost:5173 ..."
if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5173" >/dev/null 2>&1 &
else
  yellow "      (no xdg-open) open this manually: http://localhost:5173"
fi
echo
green "      The stack runs in Docker. Stop it with ./stop.sh. Watch logs:"
echo  "        docker compose -p pikaos -f deploy/docker-compose.generated.yml logs -f"
