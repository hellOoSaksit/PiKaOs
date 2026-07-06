"""Console-only rotating setup code — the bootstrap gate for the first-run install page.

Before any `auth` plugin exists there is no one to log in as, so the install/Modules page is instead
gated by a code printed ONLY to the server console (stdout) — the Jupyter-token pattern. Generated once
per container boot (`scripts/generate_setup_code.py`, run before uvicorn workers spawn — see that
module's docstring for why) and shared across every worker process via kernel state (the same JSON-file
mechanism the plugin registry uses). This module owns the code's + session token's format and the
kernel-state round-trip; `scripts/generate_setup_code.py` writes them, `routers/setup.py` reads/verifies
the code, `identity.BootstrapProvider` verifies the session token.

A second, machine-only value — the session token — travels alongside the human-typed code: once an
operator proves they read the console by submitting the right code, the backend hands back this token
so the frontend can act as a temporary bootstrap admin (installing `auth` itself, chicken-and-egg)
without re-typing the code on every request. See
docs/superpowers/specs/2026-07-02-bootstrap-install-shell-design.md.
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


def generate_session_token() -> str:
    """A fresh opaque bearer token — machine-only, never displayed, never typed by a human."""
    return secrets.token_urlsafe(32)


def write(code: str, session_token: str) -> None:
    """Persist this boot's code + session token to kernel state, visible to every worker process."""
    kernel_state.write_json(_KEY, {"code": code, "session_token": session_token})


def clear() -> None:
    """Drop any stored code/token — called when `auth` is enabled, so the bootstrap gate goes moot."""
    kernel_state.write_json(_KEY, None)


def _entry() -> dict:
    data = kernel_state.read_json(_KEY, None)
    return data if isinstance(data, dict) else {}


def read_code() -> str | None:
    """The current boot's setup code, or None if none is set (auth installed, or never generated)."""
    return _entry().get("code")


def read_session_token() -> str | None:
    """The current boot's session token, or None if none is set."""
    return _entry().get("session_token")


def verify_code(candidate: str) -> bool:
    """Constant-time, case-insensitive match against the stored code. False if none is set."""
    code = read_code()
    if not code:
        return False
    return hmac.compare_digest(candidate.strip().upper(), code.upper())


def verify_session_token(candidate: str | None) -> bool:
    """Constant-time match against the stored session token. False if none set or none given."""
    token = read_session_token()
    if not token or not candidate:
        return False
    return hmac.compare_digest(candidate, token)


# --- optional-auth open mode (capability-handshake spec §4) -----------------------------------------
# The boot entrypoint (scripts/generate_setup_code.py) decides this boot's mode ONCE and persists it
# here so every worker process reads the same value: "login" (auth plugin enabled), "open" (no auth +
# first-run setup completed — BootstrapProvider grants everyone), "setup" (no auth, setup pending —
# the console code gates). `setup_completed` is the durable fact the boot decision derives from.

_MODE_KEY = "auth_mode"
_COMPLETED_KEY = "setup_completed"
_MODES = ("login", "open", "setup")


def write_auth_mode(mode: str) -> None:
    """Persist this boot's auth mode for all workers. Callers pass one of `_MODES`."""
    kernel_state.write_json(_MODE_KEY, {"mode": mode})


def read_auth_mode() -> str:
    """This boot's auth mode; absent/unknown reads as "login" — the fail-closed default (a server
    must never accidentally open itself because a state file is missing or mangled)."""
    data = kernel_state.read_json(_MODE_KEY, None)
    mode = data.get("mode") if isinstance(data, dict) else None
    return mode if mode in _MODES else "login"


def mark_setup_completed() -> None:
    """Durable: first-run setup finished once on this server (survives restarts on the state volume)."""
    kernel_state.write_json(_COMPLETED_KEY, {"done": True})


def is_setup_completed() -> bool:
    data = kernel_state.read_json(_COMPLETED_KEY, None)
    return bool(isinstance(data, dict) and data.get("done"))


__all__ = [
    "generate_code", "generate_session_token", "write", "clear",
    "read_code", "read_session_token", "verify_code", "verify_session_token",
    "write_auth_mode", "read_auth_mode", "mark_setup_completed", "is_setup_completed",
]
