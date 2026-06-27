#!/usr/bin/env bash
# ===========================================================
#  PiKaOs — stop all 4 stacks (Linux; reverse order of start.sh).
#  Containers + networks are removed; named volumes (pgdata/
#  redisdata/miniodata/frontend_node_modules) are KEPT so data
#  survives a restart.
#  To wipe the datastores too:  ./stop.sh --volumes   (or -v)
# ===========================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DOWN=(down)
case "${1:-}" in
  --volumes|-v) DOWN=(down -v) ;;
esac

echo "Stopping frontend stack..."
docker compose -p pikaos-frontend -f deploy/docker-compose.frontend.dev.yml "${DOWN[@]}"
echo "Stopping ai stack..."
docker compose -p pikaos-ai -f deploy/docker-compose.ai.yml "${DOWN[@]}"
echo "Stopping backend stack..."
docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml "${DOWN[@]}"
echo "Stopping data stack..."
docker compose -p pikaos-data -f deploy/docker-compose.data.yml "${DOWN[@]}"

echo
printf '\033[32m%s\033[0m\n' "All stacks stopped."
