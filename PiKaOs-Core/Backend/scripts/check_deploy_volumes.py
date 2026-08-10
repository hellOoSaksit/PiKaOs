#!/usr/bin/env python3
"""CI gate: the deploy compose files keep the volume invariants a Core update depends on
(server-core-update spec §7).

Two invariants, and both are the kind that fail SILENTLY in production rather than loudly in a test:

1. **Prod mounts `pluginsdir` at `app/plugins`.** Git-installed plugins are written into the image's
   filesystem, so without a named volume the next `up -d --build` — which is exactly what a Core
   update runs — reverts every plugin the operator installed. Nothing errors; the plugins are just
   gone. The volume must also be DECLARED top-level, or `docker compose up` refuses to start at all.
2. **Dev must NOT mount it.** Dev bind-mounts `../Backend` whole and `link-plugins.sh` drops symlinks
   into `app/plugins`; a named volume there shadows them, and the dev tree comes up plugin-less.

This lives in the lightweight `architecture` CI job rather than the pytest suite for a concrete
reason: the backend suite runs INSIDE the container, whose only bind mount is `Backend/` — `deploy/`
is not visible from there, so a pytest guard could never read these files. This job runs on the host
checkout, where they are.

    python scripts/check_deploy_volumes.py     # exits non-zero on a broken invariant
"""
from __future__ import annotations

import sys
from pathlib import Path

import yaml

DEPLOY = Path(__file__).resolve().parent.parent.parent / "deploy"
PROD = DEPLOY / "docker-compose.prod.yml"
DEV = DEPLOY / "docker-compose.dev.yml"
PLUGINS_MOUNT = "pluginsdir:/app/app/plugins"


def _backend_volumes(compose_path: Path) -> list[str]:
    doc = yaml.safe_load(compose_path.read_text(encoding="utf-8")) or {}
    return list((doc.get("services", {}).get("backend", {}) or {}).get("volumes", []) or [])


def _declared_volumes(compose_path: Path) -> set[str]:
    doc = yaml.safe_load(compose_path.read_text(encoding="utf-8")) or {}
    return set((doc.get("volumes") or {}).keys())


def main() -> None:
    errors: list[str] = []

    if PLUGINS_MOUNT not in _backend_volumes(PROD):
        errors.append(
            f"{PROD.name}: backend must mount `{PLUGINS_MOUNT}` — without it a Core update's image "
            "rebuild silently deletes every git-installed plugin.")
    if "pluginsdir" not in _declared_volumes(PROD):
        errors.append(
            f"{PROD.name}: `pluginsdir` is mounted but not declared under top-level `volumes:` — "
            "`docker compose up` refuses to start with an undefined volume.")
    if any("pluginsdir" in v for v in _backend_volumes(DEV)):
        errors.append(
            f"{DEV.name}: backend must NOT mount `pluginsdir` — it shadows the link-plugins.sh "
            "symlinks and the dev tree comes up plugin-less.")

    if errors:
        for e in errors:
            print(f"[check_deploy_volumes] {e}", file=sys.stderr)
        sys.exit(1)
    print("[check_deploy_volumes] deploy volume invariants OK")


if __name__ == "__main__":
    main()
