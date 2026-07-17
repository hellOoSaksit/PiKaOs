#!/usr/bin/env bash
# link-plugins.sh — drop enabled plugin CODE into Core so the Loader can discover it and the
# build-merge scripts (render_requirements.py / render_compose.py) can see its requirements + compose
# fragment. This is the "link" step the whole plugin dev/build flow assumes:
#
#     ./link-plugins.sh                             # link what Backend/.env ENABLED_MODULES enables
#     ./link-plugins.sh auth postgres redis         # link a chosen set (overrides .env)
#     ./link-plugins.sh --all                       # link every discoverable plugin (release builds)
#     python Backend/scripts/render_requirements.py   # then this (defaults to every LINKED plugin)
#     python Backend/scripts/render_compose.py         # and this (reads the same ENABLED_MODULES)
#     docker compose -p pikaos -f deploy/docker-compose.generated.yml up -d --build
#
# The no-arg default reads `ENABLED_MODULES` from Backend/.env — the same source of truth
# render_compose.py resolves, with the same rules ("" = none, "*" = every discovered plugin, else a
# comma list). That is what keeps the three build steps agreeing: link the enabled set → lock the
# requirements of what's linked → generate compose for the same set. It used to default to "every
# plugin repo on disk", which quietly broke both ends of that chain: the image carried dependencies for
# plugins the stack never enables, and — because Core's frontend registry globs whatever is on disk — a
# broken frontend in ANY sibling repo took Core's dev server down with it, even for a plugin nobody had
# enabled. A release build that must carry every plugin's UI (folder presence can't vary per install —
# see plugin-architecture.md's runtime UI gate) asks for that explicitly with `--all`.
#
# Repo-per-plugin (see CLAUDE.md): each plugin lives in its OWN repo, gitignored + nested as a sibling
# of PiKaOs-Core/. A plugin's Python runs IN the Core process, so its code must sit under
# Backend/app/plugins/<id>/ (and its UI under Desktop/Frontend/src/plugins/<id>/). Those paths are gitignored
# — this script (re)creates them from the sibling repos, so they are build state, never committed.
#
# id -> repo is discovered, not hardcoded: every sibling PiKaOs-Plugin-*/backend/manifest.json declares
# its own "id". Standalone plugin-APPS (Compare/RedirectMap — capitalized Backend/, own compose) and
# frontend-only plugins with no backend manifest (World) simply have no backend id and are skipped.
#
# Why COPY, not symlink: the Docker dev flow mounts `../Backend:/app` into the backend container, so
# `app/plugins/<id>` must be REAL files that resolve inside the container. An absolute host symlink
# (`/c/Users/.../backend`) is meaningless in the container, and a relative symlink only works if the
# plugin repo is ALSO mounted at the resolvable path (the special-case dance the dev compose does for
# the mock plugin). A plain copy resolves everywhere — host tooling (render_requirements/render_compose,
# host pytest) AND the container — at the cost of no hot-reload: re-run this script after editing linked
# plugin code (or, for one plugin you're actively editing, mount its repo as a volume like the mock).
# `--link` opts into symlinks for a pure host-tooling run where no container mount is involved.
set -euo pipefail

USE_SYMLINK=0
LINK_ALL=0
while [ "$#" -gt 0 ]; do
  case "${1:-}" in
    --link) USE_SYMLINK=1; shift ;;
    --all)  LINK_ALL=1; shift ;;
    -*)     echo "unknown flag: $1" >&2; exit 2 ;;
    *)      break ;;
  esac
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"     # PiKaOs-Core/
PROJECTS="$(cd "$ROOT/.." && pwd)"                       # PiKaOs-Projects/ (holds the plugin repos)
BACKEND_PLUGINS="$ROOT/Backend/app/plugins"
FRONTEND_PLUGINS="$ROOT/Desktop/Frontend/src/plugins"

# --- discover id -> repo backend dir from every sibling plugin repo's manifest ------------------------
declare -A REPO_FOR_ID
for manifest in "$PROJECTS"/PiKaOs-Plugin-*/backend/manifest.json; do
  [ -f "$manifest" ] || continue
  # id is a JSON string field; read it without a JSON parser (pure sed, same style as render_compose)
  id="$(sed -nE 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$manifest" | head -1)"
  [ -n "$id" ] || continue
  REPO_FOR_ID["$id"]="$(cd "$(dirname "$manifest")/.." && pwd)"   # the plugin repo root
done

# --- ENABLED_MODULES from Backend/.env, falling back to .env.example so a fresh checkout (no .env copied
# yet) still links something sensible. Same file, same precedence, same rules as render_compose.py's
# _enabled_modules_raw() — deliberately duplicated in 4 lines of sed rather than shelling out to python,
# which this script otherwise never needs.
enabled_modules_raw() {
  local f
  for f in "$ROOT/Backend/.env" "$ROOT/Backend/.env.example"; do
    [ -f "$f" ] || continue
    sed -nE 's/^ENABLED_MODULES[[:space:]]*=[[:space:]]*(.*)$/\1/p' "$f" | head -1
    return
  done
}

# --- pick the set to link: explicit ids > --all > .env's ENABLED_MODULES ------------------------------
WANT=()
if [ "$#" -gt 0 ]; then
  WANT=("$@")
  SOURCE="arguments"
elif [ "$LINK_ALL" = "1" ]; then
  WANT=("${!REPO_FOR_ID[@]}")
  SOURCE="--all"
else
  RAW="$(enabled_modules_raw || true)"
  RAW="${RAW//[[:space:]]/}"                              # tolerate "auth, postgres"
  SOURCE="Backend/.env ENABLED_MODULES=\"$RAW\""
  case "$RAW" in
    '*') WANT=("${!REPO_FOR_ID[@]}") ;;                   # every discovered plugin (mirrors the loader)
    '')  WANT=() ;;                                       # kernel-only: link nothing
    *)   IFS=',' read -ra WANT <<< "$RAW" ;;
  esac
fi

# --- link one path: COPY by default (resolves in-container); symlink only with --link ----------------
link_one() {
  local src="$1" dst="$2"
  rm -rf "$dst"                                          # idempotent: drop any stale link/copy first
  if [ "$USE_SYMLINK" = "1" ] && ln -s "$src" "$dst" 2>/dev/null; then
    echo "    linked  $dst -> $src"
  else
    cp -r "$src" "$dst"
    echo "    copied  $dst  (re-run after editing plugin code — copies don't hot-reload)"
  fi
}

mkdir -p "$BACKEND_PLUGINS" "$FRONTEND_PLUGINS"
echo "[link-plugins] set from $SOURCE: ${WANT[*]:-(none — kernel-only)}"

# --- drop copies of plugins that are no longer in the set --------------------------------------------
# Without this, "link the enabled set" is only true the first time: flip ENABLED_MODULES and yesterday's
# copies stay on disk, where the loader and the frontend glob still find them. Only ever removes a dir
# whose name is a KNOWN plugin id — i.e. something this script created — so the committed `index.jsx`
# barrel sitting alongside them, and anything hand-placed, are never touched.
in_want() { local x; for x in ${WANT[@]+"${WANT[@]}"}; do [ "$x" = "$1" ] && return 0; done; return 1; }
for dir in "$BACKEND_PLUGINS"/* "$FRONTEND_PLUGINS"/*; do
  [ -d "$dir" ] || continue
  id="$(basename "$dir")"
  [ -n "${REPO_FOR_ID[$id]:-}" ] || continue             # not a plugin copy — leave it alone
  in_want "$id" || { rm -rf "$dir"; echo "    pruned  $dir  (not in the set)"; }
done

linked=0
for id in ${WANT[@]+"${WANT[@]}"}; do
  repo="${REPO_FOR_ID[$id]:-}"
  if [ -z "$repo" ]; then
    echo "  !! '$id' — no PiKaOs-Plugin-*/backend/manifest.json declares this id; skipping"
    continue
  fi
  echo "  $id  ($(basename "$repo"))"
  [ -d "$repo/backend" ]  && link_one "$repo/backend"  "$BACKEND_PLUGINS/$id"
  [ -d "$repo/frontend" ] && link_one "$repo/frontend" "$FRONTEND_PLUGINS/$id"
  linked=$((linked + 1))
done

echo "[link-plugins] linked $linked plugin(s)."
echo "[link-plugins] next: render_requirements.py ; render_compose.py ; docker compose ... up --build"
