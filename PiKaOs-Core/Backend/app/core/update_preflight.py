"""`python -m app.core.update_preflight <targetCoreVersion|core-vX.Y.Z>` — the update script's
in-container preflight (server-core-update spec §5 step 4): prints the installed-plugin compat table
for the target Core version and exits 0 when everything is compatible, 1 otherwise, so
`update.bat`/`update.sh` can stop before checking out an image that would strand a plugin.

No HTTP and no credentials — it reads manifests off disk and is run via `docker compose exec backend`,
which is why it is a module rather than a second caller of the route.
"""
from __future__ import annotations

import sys

from . import core_update


def main(argv: list[str]) -> int:
    if len(argv) != 1:
        print("usage: python -m app.core.update_preflight <targetCoreVersion>")
        return 2
    # The script has the tag in hand, a human types the bare version — `version_of` is the same
    # stripper the route uses, so both gate on the number rather than on a string no range satisfies.
    target = core_update.version_of(argv[0])
    report = core_update.plugin_compat(target)
    bad = [r for r in report if not r["compatible"]]
    for r in report:
        mark = "OK" if r["compatible"] else "INCOMPATIBLE"
        print(f"{mark:13} {r['id']:24} requires Core {r['requires']}")
    print(f"target Core {target}: {len(report) - len(bad)} compatible, {len(bad)} incompatible")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
