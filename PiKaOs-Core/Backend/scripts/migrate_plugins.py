"""Run each enabled plugin's install-time schema step (create tables + seed).

Phase C gave each plugin ownership of its own tables: a plugin keeps its models on its OWN declarative
metadata and ships a `migrate(engine, session_factory)` (e.g. `app/plugins/auth/migrate.py`) instead of
having Core's Alembic baseline create them. Core has no Alembic anymore — this is the ONLY schema step.

Zero-datastore kernel: the kernel owns no engine, so this script is a **composition root**. It registers
just the postgres Tool into a throwaway container, resolves `postgres.Connection` for the engine + session
factory the Tool created, then runs each enabled plugin's `migrate` in dependency order against them.
Registering ONLY postgres avoids side effects from the other plugins' `register()`. If the postgres Tool
is not enabled, nothing owns a datastore to migrate.

Idempotent — each plugin's `create_all`/seed skips what already exists — so the entrypoint runs this on
every boot, after the plugin registry has resolved ENABLED_MODULES (so the enabled set is final).

Run:  python -m scripts.migrate_plugins
"""
from __future__ import annotations

import asyncio
import importlib.util

from app import plugin_loader
from app.core.container import Container
from app.core.contracts import POSTGRES_CONNECTION
from app.core.events import EventBus


async def _run() -> None:
    manifests = plugin_loader.discover()
    enabled = plugin_loader.enabled_optional_modules() & set(manifests)
    order = plugin_loader.topo_order(enabled, manifests)
    if not order:
        print("[migrate_plugins] no enabled plugins → nothing to migrate")
        return

    # Composition root: register just the postgres Tool so it creates the engine, then resolve it.
    container = Container()
    ctx = plugin_loader.PluginContext(container=container, events=EventBus(), settings=plugin_loader.settings)
    plugin_loader.register_plugins({"postgres"} & enabled, manifests, ctx)
    conn = container.resolve(POSTGRES_CONNECTION)
    if conn is None:  # postgres tool disabled → no datastore owns tables to migrate
        print("[migrate_plugins] postgres tool not enabled → nothing to migrate")
        return
    engine, session_factory = conn["engine"], conn["session_factory"]

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
        await migrate(engine, session_factory)
        ran += 1
    print(f"[migrate_plugins] done ({ran} of {len(order)} enabled plugin(s) had a schema step)")
    await engine.dispose()


def main() -> None:
    asyncio.run(_run())


if __name__ == "__main__":
    main()
