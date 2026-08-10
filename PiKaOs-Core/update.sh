#!/usr/bin/env bash
# ===========================================================
#  PiKaOs SERVER CORE updater  (server-core-update spec §5)
#
#    ./update.sh [core-vX.Y.Z] [--force]
#      no tag  -> the highest core-v* tag fetched from origin
#      old tag -> a rollback; it is the same flow in the other direction
#      --force -> proceed even though a plugin declares an incompatible
#                 coreVersion. It cannot override a target that is not a
#                 release tag at all.
#
#  The POSIX twin of update.bat: same ten steps, same messages, same exit
#  codes, so one page of documentation covers both.
#
#  Logs to update.log; update.lock refuses concurrent runs.
#  This updates the SERVER. The Electron desktop app updates itself.
# ===========================================================
set -euo pipefail

# ---- 0. re-exec from a staged copy --------------------------
#  The checkout below rewrites this very file whenever the updater itself
#  changed between the two versions -- and the shell reads a running script
#  incrementally, BY BYTE OFFSET, so it would resume mid-line inside the new
#  file and run whatever happened to land there. The copy lives outside the
#  work tree, where git cannot reach it. PIKAOS_UPDATE_ROOT is both the
#  "already staged" flag and the repo location the copy has to be told about.
if [ -z "${PIKAOS_UPDATE_ROOT:-}" ]; then
  PIKAOS_UPDATE_ROOT="$(cd "$(dirname "$0")" && pwd)"
  export PIKAOS_UPDATE_ROOT
  staged="$(mktemp "${TMPDIR:-/tmp}/pikaos-update.XXXXXX")" ||
    { echo "  ERROR: could not stage the updater."; exit 1; }
  cat "$0" > "$staged"
  chmod +x "$staged"
  rc=0
  "$staged" "$@" || rc=$?
  rm -f "$staged"
  exit "$rc"
fi

ROOT="$PIKAOS_UPDATE_ROOT"
cd "$ROOT"
LOG="$ROOT/update.log"
LOCK="$ROOT/update.lock"
COMPOSE=(docker compose -p pikaos -f deploy/docker-compose.generated.yml)

log() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG"; echo "  $*"; }

fail() { log "FAILED: $*"; rm -f "$LOCK"; exit 1; }

# Put the server back on $REVERT, then fall into fail() -- which is what
# releases the lock.
rollback() {
  log "ROLLBACK: $*"
  git checkout --quiet "$REVERT" || true
  python3 Backend/scripts/render_compose.py || true
  docker tag pikaos-backend:pre-update pikaos-backend:latest >/dev/null 2>&1 || true
  "${COMPOSE[@]}" up -d --no-build || true
  log "==== ROLLED BACK to $REVERT ===="
  echo
  echo "  The server was put back on $REVERT. See update.log."
  fail "$*"
}

echo
echo "  ==========================================================="
echo "       .:::.   P i K a O S   .:::."
echo "       Server Core updater"
echo "  ==========================================================="
echo

# ---- 1. one at a time ---------------------------------------
if [ -e "$LOCK" ]; then
  echo "  Another update is already running (update.lock exists)."
  echo "  If you are sure none is, delete $LOCK and try again."
  exit 1
fi
echo running > "$LOCK"
# Installed only now, so the "another update is running" exit above cannot
# delete the OTHER run's lock. update.bat has no equivalent -- batch has no
# trap -- which is why every exit path there deletes the lock by hand.
trap 'rm -f "$LOCK"' EXIT
log "==== update started ===="

# ---- 2. arguments -------------------------------------------
TARGET=""
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    *) [ -n "$TARGET" ] || TARGET="$arg" ;;
  esac
done

# ---- 3. the engine and the stack have to be up --------------
#  The preflight runs inside the RUNNING backend (it reads the manifests of
#  the plugins installed right now), so a stopped stack is not a compat
#  failure -- it is a different problem, and saying so keeps `exec`'s exit 1
#  from being read as "incompatible plugins" below.
docker info >/dev/null 2>&1 ||
  fail "the Docker engine is not running - start it first"
[ -n "$("${COMPOSE[@]}" ps -q backend 2>/dev/null)" ] ||
  fail "the PiKaOs stack is not running - start it first"

# ---- 4. a dirty work tree cannot be checked out -------------
#  Refused here, with the reason, rather than 8 steps later as a mystery
#  checkout failure that drags a rollback behind it. Untracked files are
#  fine (-uno): the generated compose file and the installed plugins are.
[ -z "$(git status --porcelain -uno)" ] ||
  fail "the checkout has local modifications - commit or stash them first"

# ---- 5. fetch, then resolve the target ----------------------
log "fetching tags from origin"
git fetch --tags --force origin ||
  fail "git fetch failed - check the network and the remote"

# `awk NR==1`, not `head -1`: head closes the pipe on the first line, git dies
# of SIGPIPE, and `pipefail` turns that into a failed assignment under `set -e`
# -- intermittently, only once there are enough tags to fill the pipe buffer.
[ -n "$TARGET" ] || TARGET="$(git tag -l 'core-v*' --sort=-v:refname | awk 'NR==1')"
[ -n "$TARGET" ] || fail "no core-v* tags found on origin"
git rev-parse --verify --quiet "$TARGET^{commit}" >/dev/null ||
  fail "unknown target $TARGET"

# Where a failure puts the server back: the branch if we are on one, else the
# tag we are standing on, else the bare commit.
REVERT="$(git symbolic-ref -q --short HEAD 2>/dev/null ||
          git describe --tags --exact-match 2>/dev/null ||
          git rev-parse HEAD)"
log "target=$TARGET  revert-point=$REVERT  force=$FORCE"

# ---- 6. preflight: would this bump strand a plugin? ---------
#  Exit 2 = the target is not a Core release at all (a branch, a glob, a
#  typo). --force deliberately does NOT cover that: it overrides a judgement
#  about plugins, not a nonsense target. The shape rule itself lives in
#  app/core/core_update.py so this script never grows a second copy of it.
echo "  Checking installed plugins against $TARGET..."
pf=0
"${COMPOSE[@]}" exec -T backend python -m app.core.update_preflight "$TARGET" || pf=$?
if [ "$pf" -ge 2 ]; then
  fail "$TARGET is not a Core release tag"
elif [ "$pf" -eq 1 ]; then
  [ "$FORCE" -eq 1 ] ||
    fail "preflight found incompatible plugins - rerun with --force to override"
  log "preflight overridden with --force"
fi

# ---- 7. keep the running image for an instant rollback ------
img="$("${COMPOSE[@]}" images -q backend 2>/dev/null | awk 'NR==1')"
[ -z "$img" ] || docker tag "$img" pikaos-backend:pre-update
log "tagged the running backend image as pikaos-backend:pre-update"

# ---- 8. switch the source over and rebuild ------------------
echo "  Switching to $TARGET..."
git checkout --quiet "$TARGET" || fail "checkout $TARGET failed"
python3 Backend/scripts/render_compose.py || rollback "compose render failed"
"${COMPOSE[@]}" build || rollback "build failed"
"${COMPOSE[@]}" up -d || rollback "the new stack failed to start"

# ---- 9. health: /api/version must answer with the NEW one ---
#  24 tries x 5s = 2 minutes, which covers a cold start + migrations. Matched
#  on the whole `"version":"X.Y.Z"` pair so 0.3.0 cannot match 0.3.01 -- and
#  with a `case`, not `curl | grep -q`: grep exits on the first match, curl
#  takes SIGPIPE, and `pipefail` would report the successful poll as a failure.
WANT="${TARGET#core-v}"
echo "  Waiting for the server to come back on $WANT..."
tries=0
while :; do
  tries=$((tries + 1))
  body="$(curl -fsS -m 3 http://127.0.0.1:8000/api/version 2>/dev/null || true)"
  case "$body" in
    *"\"version\":\"$WANT\""*) break ;;
  esac
  [ "$tries" -lt 24 ] || rollback "the server never came back on $WANT"
  printf '.'
  sleep 5
done

echo
log "==== UPDATED to $TARGET ===="
echo "  The PiKaOs server is now on $TARGET."
echo "  Restart the desktop app to pick up the new frontend."
rm -f "$LOCK"
exit 0
