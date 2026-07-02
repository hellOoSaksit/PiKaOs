"""First-run setup HTTP routes (`/api/setup`) — the API behind the console-code bootstrap gate.

Both routes are intentionally public: this gate exists precisely because no account can exist yet, so
there is nothing to authenticate against (a bearer token, when present, is read as an OPTIONAL signal
for `/status`, never required). See `app/core/setup_state.py` for the code/token format + storage, and
docs/superpowers/specs/2026-07-02-bootstrap-install-shell-design.md for the full design.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import setup_state

router = APIRouter(prefix="/api/setup", tags=["setup"])


class StatusOut(BaseModel):
    needsSetup: bool
    bootstrapAuthorized: bool


class VerifyIn(BaseModel):
    code: str


class VerifyOut(BaseModel):
    ok: bool
    token: str


def _bearer(request: Request) -> str | None:
    auth = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    return auth[7:].strip() or None


@router.get("/status", response_model=StatusOut)
async def status(request: Request) -> StatusOut:
    """`needsSetup` is true while a setup code is live (i.e. `auth` isn't enabled yet — see
    generate_setup_code.py). `bootstrapAuthorized` reports whether the caller's bearer token (if any)
    is the current boot's valid session token — the frontend uses this to skip back to FirstRun after
    a restart invalidates a previously-stored token."""
    return StatusOut(
        needsSetup=setup_state.read_code() is not None,
        bootstrapAuthorized=setup_state.verify_session_token(_bearer(request)),
    )


@router.post("/verify-code", response_model=VerifyOut)
async def verify_code(body: VerifyIn) -> VerifyOut:
    """Check `body.code` against the current boot's setup code. On success, returns the session token
    the frontend then sends as a Bearer token — `identity.BootstrapProvider` accepts it as a synthetic
    admin, the only way to reach `plugins.manage`-gated routes before any auth plugin exists."""
    if not setup_state.verify_code(body.code):
        raise HTTPException(status_code=401, detail="invalid setup code")
    return VerifyOut(ok=True, token=setup_state.read_session_token())
