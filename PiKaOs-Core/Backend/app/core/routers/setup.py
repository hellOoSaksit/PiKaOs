"""First-run setup HTTP routes (`/api/setup`) — the API behind the console-code bootstrap gate.

`/status` and `/verify-code` are intentionally public: this gate exists precisely because no account
can exist yet, so there is nothing to authenticate against (a bearer token, when present, is read as
an OPTIONAL signal for `/status`, never required). `/db-test` and `/db-config` (DB-choice, Step 1 of
install) are different — they act on the system DB, so both REQUIRE the bootstrap Bearer `verify-code`
handed back (`_require_bootstrap`), 401 otherwise. See `app/core/setup_state.py` for the code/token
format + storage, and docs/superpowers/specs/2026-07-02-bootstrap-install-shell-design.md for the full
design.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from .. import db_config, db_dsn, db_probe, setup_state

router = APIRouter(prefix="/api/setup", tags=["setup"])


class StatusOut(BaseModel):
    needsSetup: bool
    bootstrapAuthorized: bool
    needsFirstAdmin: bool
    needsDbConfig: bool


class DbIn(BaseModel):
    """The operator's DB choice (Step 1 of install) — same shape for db-test and db-config so the
    frontend can "test then save" against one payload. `db_dsn.build` picks which fields matter."""
    provider: str
    host: str | None = None
    port: int | None = None
    user: str | None = None
    password: str | None = None
    dbname: str | None = None
    connectionString: str | None = None


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


def _require_bootstrap(request: Request) -> None:
    if not setup_state.verify_session_token(_bearer(request)):
        raise HTTPException(status_code=401, detail="bootstrap authorization required")


def _dsn_from(body: DbIn) -> str:
    dsn = db_dsn.build(body.provider, body.model_dump(exclude_none=True))
    db_dsn.reject_pooler(dsn)
    return dsn


@router.get("/status", response_model=StatusOut)
async def status(request: Request) -> StatusOut:
    """`needsSetup` is true while a setup code is live (i.e. `auth` isn't enabled yet — see
    generate_setup_code.py). `bootstrapAuthorized` reports whether the caller's bearer token (if any)
    is the current boot's valid session token — the frontend uses this to skip back to FirstRun after
    a restart invalidates a previously-stored token."""
    mode = setup_state.read_auth_mode()
    code_live = setup_state.read_code() is not None
    authorized = setup_state.verify_session_token(_bearer(request))
    return StatusOut(
        needsSetup=code_live and mode == "setup",
        bootstrapAuthorized=authorized,
        # auth is enabled but ownerless (migrate revived the code): the client shows the
        # create-first-admin form, and THIS router's verify-code refuses (see below).
        needsFirstAdmin=code_live and mode == "login",
        # gated on `authorized` (not just the code being live) so an unauthenticated caller never
        # learns whether the system DB is configured yet.
        needsDbConfig=authorized and not db_config.is_configured(),
    )


@router.post("/verify-code", response_model=VerifyOut)
async def verify_code(body: VerifyIn) -> VerifyOut:
    """Check `body.code` against the current boot's setup code. On success, returns the session token
    the frontend then sends as a Bearer token — `identity.BootstrapProvider` accepts it as a synthetic
    admin. Success ALSO completes first-run setup (open-mode spec §4): the flag is durable, and this
    boot's mode flips to "open" immediately so the operator lands in the full app without a restart."""
    if setup_state.read_auth_mode() == "login":
        # First-admin window (auth enabled, zero users): the live code authorises
        # POST /api/auth/bootstrap-admin, not this route — accepting here would flip the server
        # "open" underneath an auth-plugin identity provider.
        raise HTTPException(status_code=409, detail="auth is installed — create the first admin instead")
    if not setup_state.verify_code(body.code):
        raise HTTPException(status_code=401, detail="invalid setup code")
    setup_state.mark_setup_completed()
    setup_state.write_auth_mode("open")
    return VerifyOut(ok=True, token=setup_state.read_session_token())


@router.post("/db-test")
async def db_test(body: DbIn, request: Request) -> dict:
    """Connectivity check only — never persists. The client sends this before db-config so the
    operator gets pass/fail feedback without committing a bad DSN. Errors are GENERIC to the client
    (the real driver exception is logged server-side only by `db_probe.probe` — never the DSN or
    password crosses the wire in either direction on failure)."""
    _require_bootstrap(request)
    try:
        dsn = _dsn_from(body)                 # KeyError here = an incomplete `pg` payload (missing host/user/…)
        await db_probe.probe(dsn)
    except (db_dsn.DbDsnError, db_probe.DbProbeError, KeyError) as exc:
        raise HTTPException(status_code=400, detail="database connection failed") from exc
    return {"ok": True}


@router.post("/db-config")
async def db_config_save(body: DbIn, request: Request) -> dict:
    """Re-probes (never trusts a prior /db-test without re-checking) then persists the DSN via
    `db_config.save` — encrypted at rest, see db_config.py. 409 once a DB is already configured: this
    is a one-shot Step-1 choice, not an update endpoint. `restart_required` tells the frontend the
    kernel needs a restart before the new DSN takes effect (the running process keeps its old engine)."""
    _require_bootstrap(request)
    if db_config.is_configured():
        raise HTTPException(status_code=409, detail="a database is already configured")
    try:
        dsn = _dsn_from(body)                 # KeyError here = an incomplete `pg` payload (missing host/user/…)
        await db_probe.probe(dsn)
    except (db_dsn.DbDsnError, db_probe.DbProbeError, KeyError) as exc:
        raise HTTPException(status_code=400, detail="database connection failed") from exc
    db_config.save(body.provider, dsn)
    return {"ok": True, "restart_required": True}
