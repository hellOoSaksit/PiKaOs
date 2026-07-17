"""Shared kernel-test fixtures.

The kernel (Core) must be able to test the plugin **Loader / module seam** with NO real feature plugin
present — Core's pytest suite runs plugin-free in CI (no plugins linked). These fixtures install a pair
of **synthetic** plugins that stand in for whatever real plugin a kernel-mechanism test used to borrow:

  * ``sample``     — a routed **capability** (has a namespaced router, a ``register()`` that binds a
                     contract + echoes its config, a ``boot()``, and one ``jobs`` callable).
  * ``sampletool`` — a routeless **tool** (``kind: tool``, ``routes: []``, provides a Connection
                     contract in ``register()``).

They are injected both into ``sys.modules`` (so the Loader's ``importlib.import_module`` finds them)
and into the discovered manifest catalog (so ``modules``/``plugin_loader`` list + enable them).
"""
from __future__ import annotations

import sys
from types import ModuleType, SimpleNamespace

import pytest
from fastapi import APIRouter

from app import modules, plugin_loader
from app.core import kernel_state

SAMPLE_CONTRACT = "sample.Thing"
TOOL_CONTRACT = "sampletool.Connection"
SAMPLE_ROUTE = "/api/sample/ping"


@pytest.fixture
def tmp_state(tmp_path, monkeypatch):
    """Point `kernel_state` at a fresh temp dir for one test — the same isolation pattern
    `test_git_installer.py`'s autouse `_isolate_kernel_state` uses, shared here so any
    kernel-state-touching test can just ask for `tmp_state`."""
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))


def seed_manifest(mf) -> None:
    """Drop a manifest into the live catalog exactly as boot-time ``discover()`` would — installs no
    longer register in-process (B3-H2: visibility is restart-to-apply), so a test that acts on an
    installed plugin seeds the post-restart state itself. The rebind is undone by ``sample_plugins``'s
    monkeypatch teardown, same as ``register_discovered``'s used to be."""
    plugin_loader.PLUGIN_MANIFESTS = {**plugin_loader.PLUGIN_MANIFESTS, mf.id: mf}
    plugin_loader.OPTIONAL_MODULE_NAMES = tuple(sorted(plugin_loader.PLUGIN_MANIFESTS))
    plugin_loader._notify_catalog_change()


def _make_sample_module() -> ModuleType:
    mod = ModuleType("app.plugins.sample")
    router = APIRouter()

    @router.get(SAMPLE_ROUTE)
    def _ping():  # a namespaced route → proves an enabled plugin adds observable surface (§2.2)
        return {"ok": True}

    def register(ctx):
        # bind the provided contract + echo the schema-defaulted config we were handed (§11)
        ctx.container.bind(SAMPLE_CONTRACT, {"config": dict(ctx.config)})

    def boot(ctx):  # nothing to wire — present so the two-pass lifecycle has a boot() to call
        pass

    def _job():
        return None
    _job.__name__ = "sample_job"

    mod.router = router
    mod.register = register
    mod.boot = boot
    mod.jobs = [_job]
    return mod


def _make_tool_module() -> ModuleType:
    mod = ModuleType("app.plugins.sampletool")

    def register(ctx):  # kind:tool → binds a DI Connection, exports no router
        ctx.container.bind(TOOL_CONTRACT, {"engine": object(), "session_factory": object()})

    mod.register = register
    return mod


SAMPLE_MF = plugin_loader.Manifest(
    id="sample", name="Sample", version="1.2.3", coreVersion="*",
    provides=(SAMPLE_CONTRACT,), routes=("/api/sample",),
    # a declared permission in the normalized {key, group, name_th, name_en} shape _norm_perm() produces
    # (not a bare string) — exercises the object form GET /api/plugins must serialize down to keys only.
    permissions=({"key": "sample.manage", "group": "", "name_th": "", "name_en": ""},),
)
TOOL_MF = plugin_loader.Manifest(
    id="sampletool", name="Sample Tool", version="0.1.0", coreVersion="*",
    kind="tool", provides=(TOOL_CONTRACT,),
)


@pytest.fixture
def sample_plugins(monkeypatch):
    """Install the synthetic ``sample`` + ``sampletool`` plugins into the Loader for one test —
    importable as ``app.plugins.*`` and present in the discovered manifest catalog. Returns a handle
    with the manifests + contract tokens so a test needn't re-declare them."""
    monkeypatch.setitem(sys.modules, "app.plugins.sample", _make_sample_module())
    monkeypatch.setitem(sys.modules, "app.plugins.sampletool", _make_tool_module())
    manifests = {"sample": SAMPLE_MF, "sampletool": TOOL_MF}
    names = tuple(sorted(manifests))
    # patch BOTH the kernel source (plugin_loader) and the re-export (modules) so either import path sees it
    for target in (plugin_loader, modules):
        monkeypatch.setattr(target, "PLUGIN_MANIFESTS", manifests)
        monkeypatch.setattr(target, "OPTIONAL_MODULE_NAMES", names)
    return SimpleNamespace(
        manifests=manifests, sample=SAMPLE_MF, tool=TOOL_MF,
        sample_contract=SAMPLE_CONTRACT, tool_contract=TOOL_CONTRACT, sample_route=SAMPLE_ROUTE,
    )
