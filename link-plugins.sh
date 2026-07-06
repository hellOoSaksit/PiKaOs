#!/usr/bin/env bash
# Link the Core PLUGIN repos (PiKaOs-Plugin-<Name>/) into Core's import paths (dev convenience).
#
# Each Core plugin is its own repo at top level: PiKaOs-Plugin-Knowledge/, PiKaOs-Plugin-World/, …
# (lowercase backend/ + frontend/, carrying a manifest.json / index.jsx). Python (backend) and Vite
# (frontend) need each plugin under Core's plugins dir, so we drop gitignored SYMLINKS:
#   PiKaOs-Core/Backend/app/plugins/<id>   -> ../../../../PiKaOs-Plugin-<Name>/backend
#   PiKaOs-Core/Frontend/src/plugins/<id>  -> ../../../../PiKaOs-Plugin-<Name>/frontend
# Standalone plugin-APPS (Compare/RedirectMap — capitalized Backend/Frontend + docker-compose.yml) are
# NOT Core plugins and are skipped. Core's tracked tree still ships zero plugin code (links are gitignored).
#   bash link-plugins.sh
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACK="$ROOT/PiKaOs-Core/Backend/app/plugins"
FRONT="$ROOT/PiKaOs-Core/Frontend/src/plugins"

for d in "$ROOT"/PiKaOs-Plugin-*/; do
  name="$(basename "$d")"                                  # PiKaOs-Plugin-Knowledge
  # Core plugin? (lowercase backend/manifest.json or frontend/index.jsx). Else it's a standalone app → skip.
  [ -f "${d}backend/manifest.json" ] || [ -f "${d}frontend/index.jsx" ] || { echo "skip $name (standalone app)"; continue; }
  # strip the optional Tools- taxonomy segment so PiKaOs-Plugin-Tools-Postgres → id `postgres`
  # (ids must be import-safe: no hyphen). Single-word feature repos are unaffected.
  id="$(echo "${name#PiKaOs-Plugin-}" | sed 's/^Tools-//' | tr '[:upper:]' '[:lower:]')"   # → knowledge / world / postgres
  [ -d "${d}backend"  ] && ln -sfn "../../../../$name/backend"  "$BACK/$id"  && echo "backend  ← $id ($name)"
  [ -d "${d}frontend" ] && ln -sfn "../../../../$name/frontend" "$FRONT/$id" && echo "frontend ← $id ($name)"
done

# Build-merge (kernel-redesign §2–§3): now that the plugins are linked, merge the kernel + each linked
# plugin's requirements.txt into Backend/requirements.lock so `docker build` bakes the plugin libs into
# the Core image (the kernel requirements.txt itself carries no datastore/feature libs). Regenerated on
# every link so it always matches the installed plugin set. Pure-stdlib, so any python3 runs it.
if command -v python3 >/dev/null 2>&1; then
  python3 "$ROOT/PiKaOs-Core/Backend/scripts/render_requirements.py" || echo "warn: requirements.lock not regenerated"
else
  echo "warn: python3 not found on host — run scripts/render_requirements.py before build to bake plugin libs"
fi
echo "done. (links + requirements.lock are gitignored; Core source is untouched)"
