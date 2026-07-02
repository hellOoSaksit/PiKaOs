"""First-run setup HTTP routes (`/api/setup`) — the API behind the console-code bootstrap gate.

Both routes are intentionally public: this gate exists precisely because no account can exist yet, so
there is nothing to authenticate against. See `app/core/setup_state.py` for the code's format + storage,
and docs/superpowers/specs/2026-07-02-setup-code-bootstrap-design.md for the full design.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import setup_state

router = APIRouter(prefix="/api/setup", tags=["setup"])


class StatusOut(BaseModel):
    needsSetup: bool


class VerifyIn(BaseModel):
    code: str


class VerifyOut(BaseModel):
    ok: bool


@router.get("/status", response_model=StatusOut)
async def status() -> StatusOut:
    """True while a setup code is live (i.e. `auth` isn't enabled yet — see generate_setup_code.py)."""
    return StatusOut(needsSetup=setup_state.read_code() is not None)


@router.post("/verify-code", response_model=VerifyOut)
async def verify_code(body: VerifyIn) -> VerifyOut:
    """Check `body.code` against the current boot's setup code. No side effect beyond the answer —
    this pass doesn't wire what happens next (see the design doc's Non-goals)."""
    if not setup_state.verify_code(body.code):
        raise HTTPException(status_code=401, detail="invalid setup code")
    return VerifyOut(ok=True)
