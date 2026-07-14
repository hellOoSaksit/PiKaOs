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
# Windows: symlinks need admin/developer-mode, so we try `ln -s` and fall back to a plain copy (the
# Windows ln->copy fallback noted in the RBAC-frontend migration). A copy means edits in the plugin
# repo do NOT reflect live — re-run this script after changing linked plugin code (or mount the repo
# as a volume for hot-reload, the way the dev compose mounts the mock plugin).
set -euo pipefail

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

# --- link one path: prefer a symlink, fall back to a copy (Windows) ----------------------------------
link_one() {
  local src="$1" dst="$2"
  rm -rf "$dst"                                          # idempotent: drop any stale link/copy first
  if ln -s "$src" "$dst" 2>/dev/null; then
    echo "    linked  $dst -> $src"
  else
    cp -r "$src" "$dst"
    echo "    copied  $dst  (symlink unavailable — re-run after editing plugin code)"
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
