#!/usr/bin/env python3
"""CI gate: every plugin manifest is structurally valid (plugin-architecture.md §3 + §15).

Validates each `app/plugins/<id>/manifest.json` against the canonical `manifest.schema.json`
(draft-07, `additionalProperties:false`) and checks the one cross-field rule that is cheap to
verify without importing the app: `id` must equal its folder name. The richer cross-field rules
(namespacing prefix, `coreVersion` compatibility, acyclic dependencies) run inside the Loader and
are exercised by the backend pytest suite — this gate only needs `jsonschema`, no app deps, so it
runs in the lightweight `architecture` CI job alongside import-linter.

    python scripts/check_manifests.py        # exits non-zero on the first invalid manifest
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from jsonschema import Draft7Validator

BACKEND = Path(__file__).resolve().parent.parent
PLUGINS_DIR = BACKEND / "app" / "plugins"
SCHEMA_PATH = PLUGINS_DIR / "manifest.schema.json"


def main() -> int:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft7Validator(schema)

    manifests = sorted(PLUGINS_DIR.glob("*/manifest.json"))
    if not manifests:
        print("no plugin manifests found — nothing to validate")
        return 0

    errors: list[str] = []
    for mf in manifests:
        folder = mf.parent.name
        try:
            raw = json.loads(mf.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{folder}: manifest.json is not valid JSON — {e}")
            continue
        for err in sorted(validator.iter_errors(raw), key=str):
            loc = ".".join(str(p) for p in err.absolute_path) or "(root)"
            errors.append(f"{folder}: {loc}: {err.message}")
        if raw.get("id") not in (None, folder):
            errors.append(f"{folder}: id '{raw.get('id')}' must equal its folder name")

    if errors:
        print(f"✗ {len(errors)} manifest error(s):", file=sys.stderr)
        for e in errors:
            print(f"  - {e}", file=sys.stderr)
        return 1

    print(f"✓ {len(manifests)} manifest(s) valid: {', '.join(m.parent.name for m in manifests)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
