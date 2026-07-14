#!/usr/bin/env bash
# link-plugins.sh — drop enabled plugin CODE into Core so the Loader can discover it and the
# build-merge scripts (render_requirements.py / render_compose.py) can see its requirements + compose
# fragment. This is the "link" step the whole plugin dev/build flow assumes:
#
#     ./link-plugins.sh auth postgres redis         # link a chosen set
#     ./link-plugins.sh                             # link every discoverable backend plugin
#     python Backend/scripts/render_requirements.py --only auth,postgres,redis   # then this
#     python Backend/scripts/render_compose.py                                   # and this
#     docker compose -p pikaos -f deploy/docker-compose.generated.yml up -d --build
#
# Repo-per-plugin (see CLAUDE.md): each plugin lives in its OWN repo, gitignored + nested as a sibling
# of PiKaOs-Core/. A plugin's Python runs IN the Core process, so its code must sit under
# Backend/app/plugins/<id>/ (and its UI under Frontend/src/plugins/<id>/). Those paths are gitignored
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
if [ "${1:-}" = "--link" ]; then USE_SYMLINK=1; shift; fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"     # PiKaOs-Core/
PROJECTS="$(cd "$ROOT/.." && pwd)"                       # PiKaOs-Projects/ (holds the plugin repos)
BACKEND_PLUGINS="$ROOT/Backend/app/plugins"
FRONTEND_PLUGINS="$ROOT/Frontend/src/plugins"

# --- discover id -> repo backend dir from every sibling plugin repo's manifest ------------------------
declare -A REPO_FOR_ID
for manifest in "$PROJECTS"/PiKaOs-Plugin-*/backend/manifest.json; do
  [ -f "$manifest" ] || continue
  # id is a JSON string field; read it without a JSON parser (pure sed, same style as render_compose)
  id="$(sed -nE 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$manifest" | head -1)"
  [ -n "$id" ] || continue
  REPO_FOR_ID["$id"]="$(cd "$(dirname "$manifest")/.." && pwd)"   # the plugin repo root
done

# --- pick the set to link: args, or all discovered ---------------------------------------------------
if [ "$#" -gt 0 ]; then
  WANT=("$@")
else
  WANT=("${!REPO_FOR_ID[@]}")
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
echo "[link-plugins] linking: ${WANT[*]}"
linked=0
for id in "${WANT[@]}"; do
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
echo "[link-plugins] next: render_requirements.py --only <ids> ; render_compose.py ; docker compose ... up --build"
