"""Generate this boot's console-only setup code, once, before any uvicorn worker spawns.

Run in production with `--workers N` (N separate OS processes) — generating the code at app import
time (in-process) would give each worker a different value, and an operator watching the console
would have no way to know which one is real. So this runs once in the entrypoint, right after
`compute_enabled.py` has resolved `ENABLED_MODULES` for this boot, and writes the code to kernel state
(the same JSON-file mechanism the plugin registry uses) — every worker process reads that one value.

If `auth` is already enabled, the bootstrap gate is moot (real login exists): clear any stale code and
print nothing. Otherwise generate + persist + print the boxed console banner.

Design: docs/superpowers/specs/2026-07-02-setup-code-bootstrap-design.md.
Run:  python -m scripts.generate_setup_code
"""
from __future__ import annotations

import os

from app.core import setup_state

_BANNER_WIDTH = 66


def _enabled_modules() -> set[str]:
    return {m.strip() for m in os.environ.get("ENABLED_MODULES", "").split(",") if m.strip()}


def _print_banner(code: str) -> None:
    rule = "═" * _BANNER_WIDTH
    lines = [
        "PiKaOs — First-run setup required",
        "",
        code,
        "",
        "Paste this code into the setup screen.",
        "It rotates on every container restart.",
    ]
    print(rule)
    for line in lines:
        print(line.center(_BANNER_WIDTH) if line else "")
    print(rule)


def main() -> None:
    if "auth" in _enabled_modules():
        setup_state.clear_code()
        return
    code = setup_state.generate_code()
    setup_state.write_code(code)
    _print_banner(code)


if __name__ == "__main__":
    main()
