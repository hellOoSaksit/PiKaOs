"""Resolve the plugin registry into the ENABLED_MODULES set at boot (restart-to-apply, plugin-lifecycle-ui
§7 🟢). The install UI writes desired state to the `plugin_registry` (app_settings-backed); this script
reads the *enabled* set back and prints it so the entrypoint can export ENABLED_MODULES before uvicorn
mounts routers. So the registry is the source of truth, but mounting still happens once, at import.

Contract with `docker-entrypoint.sh`:
  - registry has rows  → print the comma-joined enabled plugin ids (may be empty = Base only), exit 0.
  - registry empty / DB unreachable → exit non-zero, print nothing → the entrypoint KEEPS the existing
    ENABLED_MODULES env (so env-driven deploys and the very first boot are unaffected).
Run:  python -m scripts.compute_enabled
"""
from __future__ import annotations

import asyncio
import sys

from app.core import plugin_registry as registry
from app.core.db import SessionLocal


async def _resolve() -> int:
    async with SessionLocal() as db:
        reg = await registry.read(db)
    if not reg:                                  # no registry yet → let the env value stand
        return 2
    print(",".join(sorted(registry.enabled_ids(reg))))
    return 0


def main() -> None:
    try:
        sys.exit(asyncio.run(_resolve()))
    except SystemExit:
        raise
    except Exception as exc:                     # DB down / not migrated yet → keep env, never block boot
        print(f"compute_enabled: {exc}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
