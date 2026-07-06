"""Server instance identity — one uuid per server, generated lazily on first read.

Lives on the kernel-state volume so it survives restarts and is shared by every worker; clients use
it as the per-server namespace key for local data isolation (capability-handshake spec §5). Uses
`kernel_state.update` (flock) so two workers racing the first read still agree on one id."""
from __future__ import annotations

from uuid import uuid4

from . import kernel_state

_KEY = "instance_id"


def instance_id() -> str:
    # Fast path: the id is immutable once written, so a plain read serves every call after the first —
    # `/api/capabilities` is hit by every client on connect, and `kernel_state.update` would otherwise
    # take a flock + rewrite the file on EVERY request (a blocking write inside an async handler).
    cached = kernel_state.read_json(_KEY, None)
    if isinstance(cached, dict) and cached.get("id"):
        return cached["id"]

    # First read (or absent state): take the flock so two workers racing the first write agree on one id.
    def _ensure(cur):
        return cur if isinstance(cur, dict) and cur.get("id") else {"id": str(uuid4())}

    return kernel_state.update(_KEY, _ensure, None)["id"]
