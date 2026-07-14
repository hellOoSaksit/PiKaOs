"""App settings HTTP routes — server-scoped, cross-device config (`/api/settings`).

Two tiers: the shared sidebar `nav` arrangement (read = any authenticated user, so every role can
render the sidebar on load; write = `options.manage`, a human-admin action, NOT an AI tool), and
per-user `/me` settings (theme/lexicon, own scope only). Backed by kernel local-JSON (zero-datastore
kernel): the shared nav blob lives in the `app_settings` state file, per-user prefs in `user_settings`.

The generic `/settings/global/{key}` KV was removed (G1, 2026-07-14): it had no remaining consumer and
was an authz side-channel over a shared blob. `GET /nav` is intentionally open — non-sensitive layout.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from .. import kernel_state
from ..identity import UserLike, get_current_user, require_perm
from ..schemas import NavConfigIn, NavConfigOut, SettingValueIn, UserSettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])

_NAV_KEY = "nav"
_APP = "app_settings"       # {key: {"value": <json>, "updated_at": <iso>}}
_USERS = "user_settings"    # {user_id: {key: <json>}}

# The nav writer re-reads, mutates and rewrites the whole `app_settings` JSON blob, so one oversized
# value taxes every later settings read/write. 64 KiB is generous for a layout value; cap it before it
# reaches kernel_state. (Defensive hygiene on the shared file — not an ai_safe-authority DoS guard: the
# writer is options.manage-gated and no longer an AI tool.)
_MAX_VALUE_BYTES = 65536


def _guard_value_size(value: object) -> None:
    """Reject a value too large to belong in the shared settings blob. Measured the way it will be
    persisted (`kernel_state.write_json` → `ensure_ascii=False`), so a Thai label costs its real UTF-8
    bytes rather than six ASCII escapes."""
    if len(json.dumps(value, ensure_ascii=False).encode("utf-8")) > _MAX_VALUE_BYTES:
        raise HTTPException(status_code=413, detail="value too large")


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
    # Human-admin write of the shared sidebar arrangement. NOT ai_safe (G1): an AI must never
    # blind-overwrite the shared nav — see docs/architecture/security.md.
    user: UserLike = Depends(require_perm("options.manage")),
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
