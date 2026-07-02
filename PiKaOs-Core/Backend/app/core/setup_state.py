"""Console-only rotating setup code — the bootstrap gate for the first-run install page.

Before any `auth` plugin exists there is no one to log in as, so the install/Modules page is instead
gated by a code printed ONLY to the server console (stdout) — the Jupyter-token pattern. Generated once
per container boot (`scripts/generate_setup_code.py`, run before uvicorn workers spawn — see that
module's docstring for why) and shared across every worker process via kernel state (the same JSON-file
mechanism the plugin registry uses). This module owns the code's format + the kernel-state round-trip;
`scripts/generate_setup_code.py` writes it, `routers/setup.py` reads/verifies it.

Design: docs/superpowers/specs/2026-07-02-setup-code-bootstrap-design.md.
"""
from __future__ import annotations

import hmac
import secrets

from . import kernel_state

_KEY = "setup_code"

# Crockford-ish safe alphabet: excludes 0/O and 1/I/L (easy to misread off a terminal). 8 symbols from
# a 32-char alphabet ≈ 40 bits of entropy — the code rotates every restart, so that's ample: not worth
# a dedicated rate-limiter for a code that's dead within one boot's lifetime anyway (see the design doc).
_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ"
_GROUP_LEN = 4
_GROUPS = 2


def generate_code() -> str:
    """A fresh `PIKA-XXXX-XXXX`-shaped code from a cryptographic RNG (never `random`)."""
    groups = [
        "".join(secrets.choice(_ALPHABET) for _ in range(_GROUP_LEN))
        for _ in range(_GROUPS)
    ]
    return "PIKA-" + "-".join(groups)


def write_code(code: str) -> None:
    """Persist the boot's setup code to kernel state, visible to every worker process."""
    kernel_state.write_json(_KEY, {"code": code})


def clear_code() -> None:
    """Drop any stored code — called when `auth` is enabled, so the bootstrap gate goes moot."""
    kernel_state.write_json(_KEY, None)


def read_code() -> str | None:
    """The current boot's setup code, or None if none is set (auth installed, or never generated)."""
    data = kernel_state.read_json(_KEY, None)
    return data.get("code") if isinstance(data, dict) else None


def verify_code(candidate: str) -> bool:
    """Constant-time, case-insensitive match against the stored code. False if none is set."""
    code = read_code()
    if not code:
        return False
    return hmac.compare_digest(candidate.strip().upper(), code.upper())


__all__ = ["generate_code", "write_code", "clear_code", "read_code", "verify_code"]
