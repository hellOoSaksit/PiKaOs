#!/usr/bin/env bash
# Compose the UAT app: symlink every plugin in PiKaOs-App/plugins/<id> into Core's plugin seam.
#
# Core ships ZERO plugin code (the public repo is plugin-free); plugins live here under
# PiKaOs-App/plugins/<id>/{frontend,backend}/ and are gitignored. Running this links them into Core so a
# build/dev run picks them up — `frontend/` -> Core/Frontend/src/plugins/<id>, `backend/` ->
# Core/Backend/app/plugins/<id>. Vite resolves through the symlink (resolve.preserveSymlinks) and the
# backend plugin_loader discovers the folder; remove a plugin = delete its App folder + re-run (or
# `--clean`). Idempotent. (plugin-architecture.md §0, P2.)
#
# Usage:  ./link-plugins.sh           link all plugins found in PiKaOs-App/plugins/
#         ./link-plugins.sh --clean   remove the plugin symlinks from Core (back to plugin-free)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"        # .../PiKaOs-Projects/PiKaOs-App
ROOT="$(cd "$APP_DIR/.." && pwd)"                              # .../PiKaOs-Projects
PLUGINS_DIR="$APP_DIR/plugins"
FE_SEAM="$ROOT/PiKaOs-Core/Frontend/src/plugins"              # <id> symlinks land here
BE_SEAM="$ROOT/PiKaOs-Core/Backend/app/plugins"
# relative target prefix from inside a seam dir up to PiKaOs-Projects (both seams are 4 levels deep)
REL="../../../../PiKaOs-App/plugins"

link_one() {                                                  # $1=seam dir  $2=plugin id  $3=half (frontend|backend)
  local seam="$1" id="$2" half="$3" link="$1/$2"
  [ -e "$PLUGINS_DIR/$id/$half" ] || return 0                 # this plugin has no such half — skip
  rm -rf "$link"                                              # idempotent: drop any stale link/dir
  ln -s "$REL/$id/$half" "$link"
  echo "  linked $half: $(basename "$seam")/$id -> $REL/$id/$half"
}

clean() {
  echo "Unlinking plugin symlinks from Core (keeping the seam files)…"
  find "$FE_SEAM" -maxdepth 1 -type l -exec rm -v {} \;
  find "$BE_SEAM" -maxdepth 1 -type l -exec rm -v {} \;
  echo "Core is plugin-free."
}

if [ "${1:-}" = "--clean" ]; then clean; exit 0; fi

[ -d "$PLUGINS_DIR" ] || { echo "no plugins dir at $PLUGINS_DIR — nothing to link"; exit 0; }
echo "Composing UAT: linking plugins from $PLUGINS_DIR"
for dir in "$PLUGINS_DIR"/*/; do
  [ -d "$dir" ] || continue
  id="$(basename "$dir")"
  echo "plugin: $id"
  link_one "$FE_SEAM" "$id" frontend
  link_one "$BE_SEAM" "$id" backend
done
echo "Done. Core/Frontend/src/plugins + Core/Backend/app/plugins now point at PiKaOs-App/plugins."
