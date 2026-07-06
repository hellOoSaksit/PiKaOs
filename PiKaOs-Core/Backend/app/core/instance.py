"""Server instance identity — one uuid per server, generated lazily on first read.

Lives on the kernel-state volume so it survives restarts and is shared by every worker; clients use
it as the per-server namespace key for local data isolation (capability-handshake spec §5). Uses
`kernel_state.update` (flock) so two workers racing the first read still agree on one id."""
from __future__ import annotations

from uuid import uuid4

from . import kernel_state

_KEY = "instance_id"


def instance_id() -> str:
    def _ensure(cur):
        return cur if isinstance(cur, dict) and cur.get("id") else {"id": str(uuid4())}

    return kernel_state.update(_KEY, _ensure, None)["id"]
