"""Consumer-driven contract test (plugin-architecture.md §13) — the provider's pipeline proves it still
honors the contract its consumer depends on, across the no-import boundary.

The engine (consumer, Core) consumes the `knowledge.Retriever` contract: the `agent_runner.Retriever`
interface, resolved from the DI container under the `contracts.RETRIEVER` token. This test runs the
knowledge plugin's real `register()` lifecycle and asserts the binding it produces satisfies that
interface — so the knowledge plugin can never silently drop or reshape `retrieve_context` without this
turning red. It also pins the removability + job-contribution wiring the worker relies on.

In-process (no DB): register() only binds a constructed retriever; we never call retrieve_context here.

    docker compose exec backend pytest tests/test_plugin_contract.py
"""
from __future__ import annotations

import inspect

from app import contracts, modules, plugin_loader
from app.container import Container
from app.events import EventBus
from app.services.agent_runner import Retriever


def _ctx() -> plugin_loader.PluginContext:
    return plugin_loader.PluginContext(container=Container(), events=EventBus())


def test_knowledge_provides_retriever_contract():
    ctx = _ctx()
    plugin_loader.register_plugins({"knowledge"}, modules.PLUGIN_MANIFESTS, ctx)

    impl = ctx.container.resolve(contracts.RETRIEVER)
    assert impl is not None, "knowledge.register() must bind the knowledge.Retriever contract"
    # runtime_checkable Protocol: the impl must structurally satisfy the engine's interface.
    assert isinstance(impl, Retriever), "bound retriever does not satisfy agent_runner.Retriever (§13)"
    assert inspect.iscoroutinefunction(impl.retrieve_context), "retrieve_context must be async"
    # the consumer's call shape is pinned: keyword params the engine passes must all exist.
    params = inspect.signature(impl.retrieve_context).parameters
    assert {"db", "owner_id", "run_input", "k"} <= set(params), "contract signature drifted from consumer"


def test_manifest_declares_what_it_provides():
    """The runtime binding must match the manifest's `provides` (the static contract Phase-2 validates)."""
    mf = modules.PLUGIN_MANIFESTS["knowledge"]
    assert contracts.RETRIEVER in mf.provides


def test_base_only_binds_nothing_and_contributes_no_jobs():
    """Removability at the DI/job layer: with knowledge disabled, no contract is bound and the worker
    gets no plugin jobs — the engine's retriever resolves to None and runs without RAG (§2.2/§5)."""
    ctx = _ctx()
    plugin_loader.register_plugins(set(), modules.PLUGIN_MANIFESTS, ctx)
    assert ctx.container.resolve(contracts.RETRIEVER) is None
    assert plugin_loader.collect_jobs(set(), modules.PLUGIN_MANIFESTS) == []


def test_enabled_knowledge_contributes_its_job():
    jobs = plugin_loader.collect_jobs({"knowledge"}, modules.PLUGIN_MANIFESTS)
    assert [j.__name__ for j in jobs] == ["ingest_document"]
