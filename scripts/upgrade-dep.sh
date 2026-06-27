#!/usr/bin/env bash
# ===========================================================
#  Safe dependency upgrade + rollback (ai-runbooks.md R4).
#
#  Adopt or bump ONE backend Python dependency without risking a system-down:
#    1) snapshot Backend/requirements.txt (exact rollback target)
#    2) apply the new pin  (replace name==... , or append for a brand-new dep)
#    3) run the gate: rebuild the backend image + full pytest  (TEST_CMD)
#    4) gate red  → restore the snapshot → clean tree, system unchanged
#       gate green → leave the change staged for you to review + commit
#
#  Why this is safe: the pin is the single source of the version, so rollback is
#  one line; nothing is committed/pushed here; app DATA is never touched (a dep
#  bump is code-only). Production rollback is separate = redeploy the previous
#  image tag (R6 / versions.md).
#
#  Usage:
#    ./scripts/upgrade-dep.sh httpx==0.29.0      # bump (or add) a pin, then gate
#    ./scripts/upgrade-dep.sh pgvector==0.4.2    # adopt a new lib
#    ./scripts/upgrade-dep.sh --check            # just run the gate on the current pins
#
#  The build+test step is the one thing that needs the running stack (db/redis/minio
#  reachable). Override it for your setup with TEST_CMD, e.g.:
#    TEST_CMD='docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml run --rm backend pytest' \
#      ./scripts/upgrade-dep.sh httpx==0.29.0
# ===========================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
REQ="Backend/requirements.txt"

# Default gate: rebuild the backend image with the new pin, then run pytest in a
# throwaway container on the split backend stack. Adjust via TEST_CMD if your
# compose project/files differ (the script doesn't assume the stack is already up
# for the build, but pytest needs db/redis/minio reachable — start them first).
DEFAULT_TEST_CMD='docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml build backend \
  && docker compose -p pikaos-backend -f deploy/docker-compose.backend.yml run --rm backend pytest'
TEST_CMD="${TEST_CMD:-$DEFAULT_TEST_CMD}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
cyan()  { printf '\033[36m%s\033[0m\n' "$*"; }

[ -f "$REQ" ] || { red "Cannot find $REQ (run from the PiKaOs repo root)."; exit 1; }

SPEC="${1:-}"
[ -n "$SPEC" ] || { red "Usage: $0 <package>==<version> | --check"; exit 1; }

# Snapshot for rollback (the whole file — restores exactly, comments and all).
BACKUP="$(mktemp)"
cp "$REQ" "$BACKUP"
restore() { cp "$BACKUP" "$REQ"; }
cleanup() { rm -f "$BACKUP"; }
trap cleanup EXIT

if [ "$SPEC" != "--check" ]; then
  case "$SPEC" in
    *==*) : ;;
    *) red "Pin must be exact: <package>==<version> (got '$SPEC')."; exit 1 ;;
  esac
  PKG="${SPEC%%==*}"
  cyan "Applying pin: $SPEC"
  if grep -qiE "^${PKG}([=<>~! ].*)?$" "$REQ"; then
    # replace the existing pin line (case-insensitive package name, keep file order)
    tmp="$(mktemp)"
    awk -v pkg="$PKG" -v spec="$SPEC" 'BEGIN{IGNORECASE=1}
      $0 ~ "^" pkg "([=<>~! ].*)?$" { print spec; next } { print }' "$REQ" > "$tmp" && mv "$tmp" "$REQ"
  else
    cyan "(new dependency — appending)"
    printf '%s\n' "$SPEC" >> "$REQ"
  fi
  echo "--- requirements diff:"
  git --no-pager diff -- "$REQ" || true
fi

cyan "Running the gate (build + pytest)… this needs the stack reachable."
if bash -c "$TEST_CMD"; then
  green "GATE GREEN ✅  — $SPEC passed."
  if [ "$SPEC" != "--check" ]; then
    echo "Next: review 'git diff', then commit on the dep's own branch + update tech-stack.md/versions.md (R4)."
  fi
  exit 0
else
  code=$?
  red "GATE RED ❌ (exit $code) — rolling back the pin."
  [ "$SPEC" != "--check" ] && { restore; green "Restored $REQ — working tree is clean, system unchanged."; }
  red "The upgrade did NOT land. Investigate the failure above before retrying."
  exit "$code"
fi
