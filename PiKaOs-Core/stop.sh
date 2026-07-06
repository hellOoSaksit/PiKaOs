#!/usr/bin/env bash
# ===========================================================
#  PiKaOs — stop the stack (Linux; counterpart of stop.bat).
#  Containers + networks are removed; named volumes (pgdata/
#  redisdata/miniodata/kernelstate/frontend_node_modules) are KEPT
#  so data survives a restart.
#  To wipe volumes too:  ./stop.sh --volumes   (or -v)
# ===========================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DOWN=(down)
case "${1:-}" in
  --volumes|-v) DOWN=(down -v) ;;
esac

if [[ ! -f deploy/docker-compose.generated.yml ]]; then
  echo "Nothing to stop (deploy/docker-compose.generated.yml not found — was start.sh ever run?)"
  exit 0
fi

echo "Stopping the stack..."
docker compose -p pikaos -f deploy/docker-compose.generated.yml "${DOWN[@]}"

echo
printf '\033[32m%s\033[0m\n' "Stack stopped."
