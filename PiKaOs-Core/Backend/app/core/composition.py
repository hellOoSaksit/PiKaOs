"""Composition root helper — build the plugin DI tier for a process (web or worker).

Both the FastAPI app (`main.py:lifespan`) and the arq worker (`worker.py:startup`) need to build a DI
`Container` + `EventBus` and run every enabled plugin's `register()/boot()` so their contracts (e.g.
`postgres.Connection`, `knowledge.Retriever`) are resolvable. This module is that shared, unit-testable
step — pass the enabled id set + the session factory, get back the wired container. Fault isolation lives
in `plugin_loader.register_plugins` (§8): a plugin whose lifecycle raises is marked degraded, never
crashes the caller.
"""
from __future__ import annotations

from .. import plugin_loader
from .config import settings
from .container import Container
from .contracts import IDENTITY
from .events import EventBus


def build_container(enabled: set[str], session_factory) -> tuple[Container, EventBus, "plugin_loader.LifecycleResult"]:
    """Build a fresh container+bus and register the `enabled` plugins (dependency order, fault-isolated).
    Returns (container, bus, result) where result.booted / result.degraded report the outcome."""
    container, bus = Container(), EventBus()
    ctx = plugin_loader.PluginContext(container=container, events=bus,
                                      session_factory=session_factory, settings=settings)
    result = plugin_loader.register_plugins(enabled, plugin_loader.PLUGIN_MANIFESTS, ctx)
    # Kernel default: bind Core's built-in identity provider unless an auth plugin already bound one.
    # (Temporary — Phase B moves this into the auth plugin; then unbound → BootstrapProvider takes over.)
    if container.resolve(IDENTITY) is None:
        from .services.core_identity_provider import CoreIdentityProvider
        container.bind(IDENTITY, CoreIdentityProvider(session_factory))
    return container, bus, result


def teardown_container(container: Container, bus: EventBus, enabled: set[str], session_factory) -> dict[str, str]:
    """Run each enabled plugin's shutdown() in reverse dependency order (§10) when the process stops — fault-isolated,
    so a misbehaving shutdown() never blocks the rest. Returns errors."""
    ctx = plugin_loader.PluginContext(container=container, events=bus,
                                      session_factory=session_factory, settings=settings)
    return plugin_loader.shutdown_plugins(enabled, plugin_loader.PLUGIN_MANIFESTS, ctx)
