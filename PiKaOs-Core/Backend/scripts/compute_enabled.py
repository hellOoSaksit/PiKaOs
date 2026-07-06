"""Resolve the plugin registry into the ENABLED_MODULES set at boot (restart-to-apply, plugin-lifecycle-ui
§7 🟢). The install UI writes desired state to the plugin registry (kernel local-JSON now, not a DB table);
this script reads the *enabled* set back and prints it so the entrypoint can export ENABLED_MODULES before
uvicorn/arq mount. So the registry is the source of truth, but mounting still happens once, at import.

Zero-datastore: reads a JSON file (`kernel_state`), NOT the DB — the kernel resolves its plugin set with no
Postgres. Contract with the entrypoints:
  - registry has entries → print the comma-joined enabled plugin ids (may be empty = Base only), exit 0.
  - registry empty / unreadable → exit non-zero, print nothing → the entrypoint KEEPS the existing
    ENABLED_MODULES env (so env-driven deploys and the very first boot are unaffected).
Run:  python -m scripts.compute_enabled
"""
from __future__ import annotations

import sys

from app.core import plugin_registry as registry


def main() -> None:
    try:
        reg = registry.read()
        if not reg:                              # no registry yet → let the env value stand
            sys.exit(2)
        print(",".join(sorted(registry.enabled_ids(reg))))
        sys.exit(0)
    except SystemExit:
        raise
    except Exception as exc:                     # unreadable state → keep env, never block boot
        print(f"compute_enabled: {exc}", file=sys.stderr)
        sys.exit(3)


if __name__ == "__main__":
    main()
