# Bootstrap session token + kernel-only install shell — design

**Date:** 2026-07-02
**Status:** approved, scoped narrowly (see Non-goals)
**Scope:** `PiKaOs-Core` (Backend + Frontend). Follow-up to
[2026-07-02-setup-code-bootstrap-design.md](2026-07-02-setup-code-bootstrap-design.md), which explicitly
deferred "wiring `onVerified` to an actual install page." This is that wiring.

## Why

Verifying the console-only setup code currently does nothing — `App.jsx`'s `onVerified` is a no-op, so
the operator is left on a blank-looking screen with no path forward. Worse: even if a page existed,
`GET /api/plugins` already requires `Depends(get_current_user)`, and with no `auth` plugin bound,
`BootstrapProvider.authenticate()` always returns `None` — every call 401s. There is currently no way
to install the `auth` plugin itself without an `auth` plugin already installed.

## A. Backend — a bootstrap session token, authorized through the existing identity chain

Extend `app/core/setup_state.py`: alongside the human-typed code, generate a second value —
`session_token = secrets.token_urlsafe(32)` — at the same time (`generate_setup_code.py`, same kernel-
state write: `{"code": ..., "session_token": ...}`). Add `verify_session_token(token) -> bool`
(constant-time, mirrors `verify_code`).

`POST /api/setup/verify-code` returns `{"ok": true, "token": <session_token>}` on success (was
`{"ok": true}`) — the frontend stores this token the same way it stores a real login token
(`api.setToken()`, `Authorization: Bearer` on subsequent calls).

`app/core/identity.py`'s `BootstrapProvider` gets the one behavior change this design needs:

```python
async def authenticate(self, token):
    if token and setup_state.verify_session_token(token):
        return _BOOTSTRAP_ADMIN            # synthetic UserLike: role=ADMIN_ROLE
    return None

async def has_perm(self, user, perm):
    return getattr(user, "role", None) == ADMIN_ROLE

def has_role(self, user, *roles):
    return getattr(user, "role", None) in roles
```

`_BOOTSTRAP_ADMIN` is a module-level `UserLike`-shaped constant (fixed nil UUID, `role="admin"`,
`status="active"`) — there is exactly one possible holder of a valid bootstrap token per boot, so no
per-request identity beyond "is this the right token" is needed.

**This is the whole backend change.** `routers/plugins.py` and every other `require_perm`/
`get_current_user` consumer needs zero edits — they already resolve through `provider_for()` →
`BootstrapProvider`, which now grants instead of always denying, exactly for a caller bearing the
current boot's session token.

**Security note:** this token now grants real admin-equivalent capability (installing/enabling
plugins), a step up from the previous verify-code endpoint's zero-side-effect check. Same threat model
as before applies (see the setup-code design's Non-goals): ~40 bits of entropy on the underlying code,
dead every restart — still no dedicated rate-limiter added this pass.

## B. Frontend — `KernelOnlyShell`, a small new component (not a re-plumb of App.jsx)

`GET /api/setup/status` (already dangling/unused by the frontend) gains a second field:
`{"needsSetup": bool, "bootstrapAuthorized": bool}` — `bootstrapAuthorized` is true iff the request's
Authorization header carries a token that `verify_session_token` accepts. Public route (no `auth: false`
change needed — it doesn't require the token, it just reports on one if present).

`App.jsx`'s gate logic:
```
if (!auth.ready) return null;
if (!auth.loggedIn) {
  if (bootstrap.bootstrapAuthorized) return <KernelOnlyShell .../>;
  return <FirstRun ... onVerified={(token) => { api.setToken(token); refreshBootstrap(); }} />;
}
... existing full app, unchanged ...
```
A new `bootstrap` state (`{needsSetup, bootstrapAuthorized}`) is populated by calling
`api.setupStatus()` on mount (mirrors the existing `auth.ready`/`restore()` pattern) and again right
after `onVerified` fires.

`KernelOnlyShell` (new, `src/screens/KernelOnlyShell.jsx`):
- Reuses `Sidebar` as-is (`route, go, t, nav` — `can` omitted, works standalone per the earlier
  investigation) with a single-item nav config: one group, one node `{id: "modules", icon: "⚙", customLabel: "Install"}`.
- A small purpose-built header (NOT the full `Topbar` — that needs `me`/`roles`/theme-menu wiring this
  mode doesn't have yet): brand + a "kernel mode" badge, nothing else.
- `.app`/`.main`/`.content`/`.content-pad` CSS classes reused from `styles.css` — no new styles.
- Body: `<PluginsManager Sys={{ T: t, can: () => true }} />` — reused unmodified. Client-side `can`
  always allows (server-side `require_perm` is the real gate, already covered by part A).
- `route`/`go` are a trivial `useState`/no-op pair — only one screen exists this pass, so there is
  nothing to route between yet (see Non-goals).

## C. Mascot resize (FirstRun.jsx)

Wrapper `div` (currently `width: 340, height: 380`) → `width: 272, height: 304` (80% — "one step
smaller"). The sleeping-Zzz overlay's hardcoded offsets (`top: 92, left: 196` etc., lines 160-165)
scale by the same 0.8 factor.

## Testing

- Backend: `tests/test_setup_code.py` gains cases for `verify_session_token` (round-trip, wrong token,
  no token set) and `BootstrapProvider` (valid token → synthetic admin with `plugins.manage`-equivalent
  access; invalid/missing token → still denies everything, unchanged from today). An integration test
  hits `GET /api/plugins` with a real bootstrap token end-to-end and expects 200 (currently 401).
- Manual: `PiKaOs-UAT-Run/run-uat.sh` clean-slate — enter the printed code in the browser, confirm the
  Install screen renders (not blank), list/install/enable a plugin through it, confirm `/api/plugins`
  calls succeed with the stored token and still 401 without one.

## Non-goals (this pass)

- A second kernel-only nav item for logs/audit (explicitly deferred — no real backend audit trail
  exists yet; adding it now would surface misleading mock data).
- Routing between multiple kernel-only screens (only "Install" exists, so `KernelOnlyShell`'s
  route/go pair is intentionally inert — real routing arrives with the next kernel-only screen).
- Live session revocation (e.g. if `auth` gets installed mid-boot via this bootstrap access, the
  token stays valid for the rest of that boot — dies at the next restart like the code itself).
- A guided "install auth specifically" flow distinct from the general plugin list — installing `auth`
  is just installing any other discovered plugin through the same `PluginsManager` UI already built.
