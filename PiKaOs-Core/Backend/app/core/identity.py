"""Identity contract — the kernel's single seam for authentication + authorization.

Core owns the *interface* (an `IdentityProvider` Protocol) and the FastAPI *dependencies* every router
uses (`get_current_user` / `require_perm` / `require_role`); an **auth plugin** binds the concrete
provider into the DI container under the `IDENTITY` token (`contracts.IDENTITY`). The dependencies
resolve that provider from `request.app.state.container` **per request**, so the auth plugin is
swappable and the kernel boots without it — falling back to `BootstrapProvider`, which denies everyone
EXCEPT a caller bearing the current boot's setup-code session token (`setup_state.py`), who is granted
a synthetic admin identity — the install page's only way to call `plugins.manage`-gated routes before
any auth plugin exists. Spec: docs/superpowers/specs/2026-07-02-bootstrap-install-shell-design.md.

Routers and plugins import these dependencies from here (kernel), NEVER from the auth plugin — that is
what keeps Core independent of the plugin (import-linter §2.1). Spec:
docs/superpowers/specs/2026-07-01-auth-plugin-extraction-design.md.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol, runtime_checkable
from uuid import UUID

from fastapi import HTTPException, Request, status

from . import setup_state
from .contracts import IDENTITY

# The well-known superuser role. Lives in the kernel identity module (not in the auth plugin's
# rbac_service) so kernel/other-feature code can reference it without importing the auth plugin — e.g.
# an admin-or-owner check. The auth plugin's rbac_service imports it from here.
ADMIN_ROLE = "admin"


# --- the contract (interface both sides agree on) ---------------------------------------------------

@runtime_checkable
class UserLike(Protocol):
    """The structural shape the kernel needs from *a* user — the auth plugin's `User` model satisfies it,
    so the kernel type-checks against users without importing the plugin's model."""
    id: UUID
    role: str
    status: str


@runtime_checkable
class IdentityProvider(Protocol):
    """What an auth plugin binds under `IDENTITY`. `authenticate` turns a bearer token into a user (or
    None); `has_perm`/`has_role` answer authorization questions about that user."""
    async def authenticate(self, token: str | None) -> "UserLike | None": ...
    async def has_perm(self, user: "UserLike", perm: str) -> bool: ...
    def has_role(self, user: "UserLike", *roles: str) -> bool: ...


# --- fallback when no auth plugin is bound ----------------------------------------------------------

@dataclass(frozen=True)
class _SyntheticUser:
    """The one identity `BootstrapProvider` ever authenticates — satisfies `UserLike` structurally."""
    id: UUID
    role: str
    status: str


# A fixed nil UUID: there is at most one holder of a valid bootstrap session token per boot (the
# operator who read the console code), so no per-request identity beyond "right token or not" exists.
_BOOTSTRAP_ADMIN = _SyntheticUser(id=UUID(int=0), role=ADMIN_ROLE, status="active")


class BootstrapProvider:
    """No auth plugin installed/enabled: denies everyone EXCEPT a caller bearing the current boot's
    setup-code session token (`setup_state.verify_session_token`), who authenticates as a synthetic
    admin — install-page-only access until a real `auth` plugin takes over."""

    async def authenticate(self, token: str | None) -> "UserLike | None":
        if token and setup_state.verify_session_token(token):
            return _BOOTSTRAP_ADMIN
        return None

    async def has_perm(self, user: "UserLike", perm: str) -> bool:
        return getattr(user, "role", None) == ADMIN_ROLE

    def has_role(self, user: "UserLike", *roles: str) -> bool:
        return getattr(user, "role", None) in roles


BOOTSTRAP = BootstrapProvider()


# --- FastAPI dependencies (the surface every router depends on) -------------------------------------

_UNAUTHORIZED = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid credentials",
    headers={"WWW-Authenticate": "Bearer"},
)
_FORBIDDEN = HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")


def provider_for(app) -> IdentityProvider:
    """The bound identity provider for an ASGI app, or the deny-all bootstrap fallback. Takes the app
    (not a request) so non-HTTP callers — e.g. the WebSocket router — can authenticate too."""
    container = getattr(app.state, "container", None)
    if container is None:
        return BOOTSTRAP
    provider = container.resolve(IDENTITY)
    return provider if provider is not None else BOOTSTRAP


def _provider(request: Request) -> IdentityProvider:
    """The bound identity provider for this request, or the deny-all bootstrap fallback."""
    return provider_for(request.app)


def _bearer(request: Request) -> str | None:
    """The bearer token from the Authorization header, or None."""
    auth = request.headers.get("Authorization")
    if not auth or not auth.lower().startswith("bearer "):
        return None
    return auth[7:].strip() or None


async def get_current_user(request: Request) -> "UserLike":
    """Resolve the current user from the bearer token, or 401. Use as `user = Depends(get_current_user)`."""
    user = await _provider(request).authenticate(_bearer(request))
    if user is None:
        raise _UNAUTHORIZED
    return user


def require_perm(perm: str):
    """Dependency factory: require a single permission (server-side RBAC). 401 if unauthenticated, 403 if
    the permission is missing. Returns the user so a route may also accept `user = Depends(require_perm(...))`."""

    async def _dep(request: Request) -> "UserLike":
        provider = _provider(request)
        user = await provider.authenticate(_bearer(request))
        if user is None:
            raise _UNAUTHORIZED
        if not await provider.has_perm(user, perm):
            raise _FORBIDDEN
        return user

    return _dep


def require_role(*roles: str):
    """Dependency factory: allow only the given roles. 401 if unauthenticated, 403 otherwise."""

    async def _dep(request: Request) -> "UserLike":
        provider = _provider(request)
        user = await provider.authenticate(_bearer(request))
        if user is None:
            raise _UNAUTHORIZED
        if not provider.has_role(user, *roles):
            raise _FORBIDDEN
        return user

    return _dep


__all__ = [
    "UserLike", "IdentityProvider", "BootstrapProvider", "BOOTSTRAP", "provider_for",
    "get_current_user", "require_perm", "require_role", "ADMIN_ROLE",
]
