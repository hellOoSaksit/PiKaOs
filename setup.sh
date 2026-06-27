#!/usr/bin/env bash
# ===========================================================
#  PiKaOs — one-time Linux setup (the Linux counterpart of the
#  Windows Docker-Desktop install step; run ONCE per machine).
#
#  Does three things, each idempotent:
#    1) make the Docker engine usable WITHOUT sudo
#         - enable + start docker.service (systemd)
#         - add the current user to the `docker` group
#           (⚠ needs a re-login / `newgrp docker` to take effect)
#    2) copy the env templates into the real (gitignored) env files
#       IF they don't exist yet — never overwrites your edits:
#         Backend/.env.example   -> Backend/.env
#         .env.ai.example        -> .env.ai
#         Frontend/.env.example  -> Frontend/.env
#    3) print what to do next (./start.sh)
#
#  Safe to re-run. After it finishes the first time, log out/in
#  (or run `newgrp docker`) so the group membership is active.
# ===========================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

cyan "==========================================================="
cyan "  PiKaOS — Linux setup (run once)"
cyan "==========================================================="
echo

# ---- 1. Docker engine: enabled, running, usable without sudo ----
echo "[1/3] Docker engine (systemd + group)..."
if ! command -v docker >/dev/null 2>&1; then
  yellow "      Docker is not installed. On CachyOS/Arch:"
  yellow "        sudo pacman -S docker docker-compose"
  yellow "      Then re-run ./setup.sh"
  exit 1
fi

# enable + start the daemon (no-op if already done)
if ! systemctl is-active --quiet docker; then
  echo "      docker.service is not running — enabling + starting (needs sudo)..."
  sudo systemctl enable --now docker
else
  echo "      docker.service already running."
fi

# add the current user to the docker group so `docker` works without sudo
if id -nG "$USER" | tr ' ' '\n' | grep -qx docker; then
  echo "      $USER already in the 'docker' group."
  GROUP_JUST_ADDED=0
else
  echo "      Adding $USER to the 'docker' group (needs sudo)..."
  sudo usermod -aG docker "$USER"
  GROUP_JUST_ADDED=1
fi

# ---- 2. env files (copy template → real, only if missing) -------
echo "[2/3] Env files (copy from *.example only if missing)..."
copy_env() {
  local src="$1" dst="$2"
  if [[ -f "$dst" ]]; then
    echo "      keep  $dst (exists)"
  elif [[ -f "$src" ]]; then
    cp "$src" "$dst"
    green "      created $dst  ← $src"
  else
    yellow "      WARN  template $src not found — skipped"
  fi
}
copy_env "Backend/.env.example"  "Backend/.env"
copy_env ".env.ai.example"       ".env.ai"
copy_env "Frontend/.env.example" "Frontend/.env"

# ---- 3. next steps ---------------------------------------------
echo "[3/3] Done."
echo
green "Setup complete."
if [[ "${GROUP_JUST_ADDED:-0}" == "1" ]]; then
  yellow "⚠ You were just added to the 'docker' group — it is NOT active in this shell yet."
  yellow "  Do ONE of these, then run ./start.sh:"
  yellow "    • log out and back in   (most reliable), or"
  yellow "    • run:  newgrp docker   (activates the group in a new shell)"
else
  echo "Next:  ./start.sh"
fi
