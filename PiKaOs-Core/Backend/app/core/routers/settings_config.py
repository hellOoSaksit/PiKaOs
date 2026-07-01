"""App settings HTTP routes — server-scoped, cross-device config (`/api/settings`).

The sidebar nav arrangement lives here so an admin's layout is the same on every user and device
(it used to be per-browser localStorage). Read = any authenticated user (the sidebar needs it on
load); write = `options.manage` (the same permission that opens the Menu Manager). Backed by the
generic `app_settings` table under key "nav".
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from ..db import get_db
from ..identity import UserLike, get_current_user, require_perm
from ..repositories import app_settings as repo
from ..repositories import user_settings as user_repo
from ..schemas import GlobalConfigOut, NavConfigIn, NavConfigOut, SettingValueIn, UserSettingsOut

router = APIRouter(prefix="/api/settings", tags=["settings"])

_NAV_KEY = "nav"


@router.get("/nav", response_model=NavConfigOut)
async def get_nav(
    _: UserLike = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> NavConfigOut:
    """The shared sidebar arrangement (or value=null when an admin hasn't customized it yet)."""
    row = await repo.get(db, _NAV_KEY)
    if row is None:
        return NavConfigOut(value=None, updated_at=None)
    return NavConfigOut(value=row.value, updated_at=row.updated_at)


@router.put("/nav", response_model=NavConfigOut)
async def put_nav(
    body: NavConfigIn,
    user: UserLike = Depends(require_perm("options.manage")),
    db: AsyncSession = Depends(get_db),
) -> NavConfigOut:
    """Replace the shared sidebar arrangement (admin only). The frontend owns the value's shape."""
    row = await repo.upsert(db, _NAV_KEY, body.value, updated_by=user.id)
    return NavConfigOut(value=row.value, updated_at=row.updated_at)


# --- per-user settings (theme/lexicon/...) — follow the user across devices (the per-user tier) ---


@router.get("/me", response_model=UserSettingsOut)
async def get_my_settings(
    user: UserLike = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsOut:
    """All of the current user's personal settings ({key: value}); empty for a fresh account."""
    return UserSettingsOut(values=await user_repo.get_all(db, user.id))


@router.put("/me/{key}", response_model=UserSettingsOut)
async def set_my_setting(
    key: str,
    body: SettingValueIn,
    user: UserLike = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserSettingsOut:
    """Set one of the current user's settings (own scope only)."""
    await user_repo.upsert(db, user.id, key, body.value)
    return UserSettingsOut(values=await user_repo.get_all(db, user.id))


# --- generic global config blobs (Tools/system settings — same for everyone, the global tier) ---


@router.get("/global/{key}", response_model=GlobalConfigOut)
async def get_global(
    key: str,
    _: UserLike = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GlobalConfigOut:
    """A shared config blob by key (or null). Any authenticated user can read it."""
    row = await repo.get(db, key)
    return GlobalConfigOut(value=row.value if row else None)


@router.put("/global/{key}", response_model=GlobalConfigOut)
async def put_global(
    key: str,
    body: SettingValueIn,
    user: UserLike = Depends(require_perm("options.manage")),
    db: AsyncSession = Depends(get_db),
) -> GlobalConfigOut:
    """Set a shared config blob (requires options.manage). Seen by every user/device."""
    row = await repo.upsert(db, key, body.value, updated_by=user.id)
    return GlobalConfigOut(value=row.value)
