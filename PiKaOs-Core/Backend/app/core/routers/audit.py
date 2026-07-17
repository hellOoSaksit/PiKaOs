"""Audit read API (audit-notifications v2 spec §1) — behind the identity catalog's `audit.view`.
Read-only; NOT ai_safe (the trail names every admin action — operator eyes only)."""
from __future__ import annotations

from fastapi import APIRouter, Depends

from .. import audit
from ..identity import UserLike, require_perm

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("")
async def read_audit(limit: int = 100, action: str | None = None, actor: str | None = None,
                     _: UserLike = Depends(require_perm("audit.view"))) -> list[dict]:
    return audit.read(limit=min(max(limit, 1), 500), action=action, actor=actor)
