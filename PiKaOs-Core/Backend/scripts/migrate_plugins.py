"""Run each enabled plugin's install-time schema step (create tables + seed) after Core's Alembic.

Phase C gave each plugin ownership of its own tables: a plugin keeps its models on its OWN declarative
metadata and ships a `migrate(engine, session_factory)` (e.g. `app/plugins/auth/migrate.py`) instead of
having Core's Alembic baseline create them. This runner discovers the ENABLED plugins in dependency
order, imports each one's `migrate` module (if any), and runs it against the app DB. Plugins that ship
no `migrate` module are skipped.

Idempotent — each plugin's `create_all`/seed skips what already exists — so the entrypoint runs this on
every boot, right after `alembic upgrade head` and after the plugin registry has resolved
ENABLED_MODULES (so the enabled set is final).

Run:  python -m scripts.migrate_plugins
"""
from __future__ import annotations

import asyncio
import importlib.util

from app import plugin_loader
from app.core.db import SessionLocal, engine


async def _run() -> None:
    manifests = plugin_loader.discover()
    enabled = plugin_loader.enabled_optional_modules() & set(manifests)
    order = plugin_loader.topo_order(enabled, manifests)
    if not order:
        print("[migrate_plugins] no enabled plugins → nothing to migrate")
        return
    ran = 0
    for pid in order:
        module_name = f"app.plugins.{pid}.migrate"
        # find_spec imports the plugin package (its __init__) but NOT the migrate module; None → the
        # plugin ships no schema step, so skip it without swallowing real import errors from migrate().
        if importlib.util.find_spec(module_name) is None:
            continue
        migrate = getattr(importlib.import_module(module_name), "migrate", None)
        if migrate is None:
            continue
        print(f"[migrate_plugins] {pid}: migrate()")
        await migrate(engine, SessionLocal)
        ran += 1
    print(f"[migrate_plugins] done ({ran} of {len(order)} enabled plugin(s) had a schema step)")
    await engine.dispose()


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
