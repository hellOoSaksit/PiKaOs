"""App settings HTTP routes — server-scoped, cross-device config (`/api/settings`).

The sidebar nav arrangement lives here so an admin's layout is the same on every user and device (it used
to be per-browser localStorage). Read = any authenticated user (the sidebar needs it on load); write =
`options.manage`. Backed by **kernel local-JSON** now (zero-datastore kernel): the shared nav + global
blobs live in the `app_settings` state file (`{key: {value, updated_at}}`), per-user prefs in
`user_settings` (`{user_id: {key: value}}`). The API + response schemas are unchanged, so the frontend is
untouched.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from .. import kernel_state
from ..git_installer import RESERVED_SETTINGS_KEYS
from ..identity import UserLike, get_current_user, require_perm
from ..schemas import GlobalConfigOut, NavConfigIn, NavConfigOut, SettingValueIn, UserSettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])

_NAV_KEY = "nav"
_APP = "app_settings"       # {key: {"value": <json>, "updated_at": <iso>}}
_USERS = "user_settings"    # {user_id: {key: <json>}}

# Both writers below are ai_safe (an options.manage AI may write settings) — without a size cap that
# authority becomes a DoS. `app_settings` is ONE JSON file: every write re-reads, mutates and rewrites
# the whole blob, so one oversized value taxes every later settings read/write, including the reserved
# installer keys that share the file. 64 KiB is generous for a config value and cheap to check before it
# ever reaches kernel_state.
_MAX_VALUE_BYTES = 65536


def _guard_value_size(value: object) -> None:
    """Reject a value too large to belong in the shared settings blob. Measured the way it will be
    persisted (`kernel_state.write_json` → `ensure_ascii=False`), so a Thai label costs its real UTF-8
    bytes rather than six ASCII escapes."""
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > _MAX_VALUE_BYTES:
        raise HTTPException(status_code=413, detail="value too large")


def _guard_reserved(key: str) -> None:
    """Installer-owned keys (git allowlist / credentials) share the `app_settings` blob but MUST NOT be
    readable or writable through this generic KV — that is a privilege side-channel around `plugins.manage`
    (K4). Treat them as absent (404, generic) so this route never becomes a way to read credentials or
    widen the install allowlist."""
    if key in RESERVED_SETTINGS_KEYS:
        raise HTTPException(status_code=404, detail="Not found")


# --- shared (app-scoped) config over the app_settings state file ------------------------------------

def _app_get(key: str) -> dict | None:
    """The `{value, updated_at}` entry for `key`, or None if never written."""
    entry = kernel_state.read_json(_APP, {}).get(key)
    return entry if isinstance(entry, dict) else None


def _app_upsert(key: str, value: Any) -> dict:
    """Create or overwrite `key`'s value; stamps `updated_at`; returns the new entry."""
    store = kernel_state.read_json(_APP, {})
    entry = {"value": value, "updated_at": datetime.now(timezone.utc).isoformat()}
    store[key] = entry
    kernel_state.write_json(_APP, store)
    return entry


@router.get("/nav", response_model=NavConfigOut)
async def get_nav(_: UserLike = Depends(get_current_user)) -> NavConfigOut:
    """The shared sidebar arrangement (or value=null when an admin hasn't customized it yet)."""
    entry = _app_get(_NAV_KEY)
    if entry is None:
        return NavConfigOut(value=None, updated_at=None)
    return NavConfigOut(value=entry.get("value"), updated_at=entry.get("updated_at"))


@router.put("/nav", response_model=NavConfigOut)
async def put_nav(
    body: NavConfigIn,
    # ai_safe: replaces the shared sidebar arrangement — a settings write, never program/server mutation.
    user: UserLike = Depends(require_perm("options.manage", ai_safe=True)),
) -> NavConfigOut:
    """Replace the shared sidebar arrangement (admin only). The frontend owns the value's shape."""
    _guard_value_size(body.value)
    entry = _app_upsert(_NAV_KEY, body.value)
    return NavConfigOut(value=entry["value"], updated_at=entry["updated_at"])


# --- per-user settings (theme/lexicon/...) — follow the user across devices (the per-user tier) ---


def _user_all(user_id: str) -> dict[str, Any]:
    values = kernel_state.read_json(_USERS, {}).get(user_id)
    return dict(values) if isinstance(values, dict) else {}


@router.get("/me", response_model=UserSettingsOut)
async def get_my_settings(user: UserLike = Depends(get_current_user)) -> UserSettingsOut:
    """All of the current user's personal settings ({key: value}); empty for a fresh account."""
    return UserSettingsOut(values=_user_all(str(user.id)))


@router.put("/me/{key}", response_model=UserSettingsOut)
async def set_my_setting(
    key: str,
    body: SettingValueIn,
    user: UserLike = Depends(get_current_user),
) -> UserSettingsOut:
    """Set one of the current user's settings (own scope only)."""
    uid = str(user.id)
    store = kernel_state.read_json(_USERS, {})
    values = dict(store.get(uid) or {})
    values[key] = body.value
    store[uid] = values
    kernel_state.write_json(_USERS, store)
    return UserSettingsOut(values=values)


# --- generic global config blobs (Tools/system settings — same for everyone, the global tier) ---


@router.get("/global/{key}", response_model=GlobalConfigOut)
async def get_global(key: str, _: UserLike = Depends(get_current_user)) -> GlobalConfigOut:
    """A shared config blob by key (or null). Any authenticated user can read it — except installer-owned
    reserved keys (K4), which 404."""
    _guard_reserved(key)
    entry = _app_get(key)
    return GlobalConfigOut(value=entry.get("value") if entry else None)


@router.put("/global/{key}", response_model=GlobalConfigOut)
async def put_global(
    key: str,
    body: SettingValueIn,
    # ai_safe: a settings write, never program/server mutation — but see the size cap, folded in because
    # this authority is exactly what an ai_safe-marked route must not turn into a DoS vector.
    user: UserLike = Depends(require_perm("options.manage", ai_safe=True)),
) -> GlobalConfigOut:
    """Set a shared config blob (requires options.manage). Seen by every user/device. Installer-owned
    reserved keys (K4) 404 — they are managed only through the `plugins.manage`-gated installer routes."""
    _guard_reserved(key)
    _guard_value_size(body.value)
    entry = _app_upsert(key, body.value)
    return GlobalConfigOut(value=entry["value"])
