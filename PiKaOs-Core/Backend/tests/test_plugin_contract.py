"""Kernel plugin-contract mechanics (plugin-architecture.md §5/§13) — the Loader's register()/DI/job
wiring, exercised plugin-free with the synthetic `sample` (capability) + `sampletool` (tool) plugins.

This pins the *mechanism* every plugin relies on: register() binds the contract a manifest `provides`,
a disabled plugin binds nothing + contributes no jobs (removability, §2.2), and route namespacing is
enforced. Each real plugin owns its *own* consumer-driven contract test in its repo (e.g. knowledge
proving it binds a `knowledge.Retriever` that satisfies the engine's interface).

In-process (no DB): register() only binds constructed objects; nothing is called through.

    docker compose exec backend pytest tests/test_plugin_contract.py
"""
from __future__ import annotations

import pytest

from app import plugin_loader
from app.core.container import Container
from app.core.events import EventBus


def _ctx() -> plugin_loader.PluginContext:
    return plugin_loader.PluginContext(container=Container(), events=EventBus())


def test_register_binds_the_contract_the_manifest_provides(sample_plugins):
    """A capability plugin's register() binds the DI contract its manifest declares in `provides`."""
    ctx = _ctx()
    plugin_loader.register_plugins({"sample"}, sample_plugins.manifests, ctx)
    assert sample_plugins.sample_contract in sample_plugins.sample.provides
    assert ctx.container.resolve(sample_plugins.sample_contract) is not None


def test_tool_plugin_binds_its_connection(sample_plugins):
    """A `kind: tool` plugin (routeless) binds its Connection contract for consumers to resolve."""
    ctx = _ctx()
    plugin_loader.register_plugins({"sampletool"}, sample_plugins.manifests, ctx)
    conn = ctx.container.resolve(sample_plugins.tool_contract)
    assert conn is not None and conn["engine"] is not None and conn["session_factory"] is not None


def test_base_only_binds_nothing_and_contributes_no_jobs(sample_plugins):
    """Removability at the DI/job layer: with the plugin disabled, no contract is bound and the worker
    gets no plugin jobs (§2.2/§5)."""
    ctx = _ctx()
    plugin_loader.register_plugins(set(), sample_plugins.manifests, ctx)
    assert ctx.container.resolve(sample_plugins.sample_contract) is None
    assert plugin_loader.collect_jobs(set(), sample_plugins.manifests) == []


def test_enabled_plugin_contributes_its_job(sample_plugins):
    jobs = plugin_loader.collect_jobs({"sample"}, sample_plugins.manifests)
    assert [j.__name__ for j in jobs] == ["sample_job"]


def test_route_must_be_namespaced_with_plugin_id():
    """§6: a plugin's declared routes must carry its id segment, so two plugins can't collide on a URL."""
    good = {"id": "crm", "name": "CRM", "version": "0.1.0", "coreVersion": "*", "routes": ["/api/crm"]}
    plugin_loader._validate("crm", good)  # ok — namespaced

    bad = {**good, "routes": ["/api/leads"]}  # not namespaced with /crm
    with pytest.raises(plugin_loader.ManifestError, match="namespaced"):
        plugin_loader._validate("crm", bad)
