"""app/core/plugin_readiness.py — the pre-build gate every install (git or symlink) passes through
before being registered+enabled (install-from-git design §2.3). Static only: no plugin code runs.

    docker compose exec backend pytest tests/test_plugin_readiness.py -v
"""
from __future__ import annotations

from app.core import plugin_readiness
from app import plugin_loader


def _mf(**over):
    base = dict(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    return plugin_loader._validate("crm", {**base, **over})


def test_passes_a_clean_capability_plugin(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    mf = _mf()
    result = plugin_readiness.check("crm", mf, {"crm": mf})
    assert result.passed is True
    assert result.reasons == ()


def test_fails_on_unresolvable_dependency(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*",
                                 dependencies=("missing-dep",))
    result = plugin_readiness.check("crm", mf, {"crm": mf})
    assert result.passed is False
    assert any("missing-dep" in r for r in result.reasons)


def test_fails_on_broken_compose_fragment(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))

    def _boom(base, enabled, manifests):
        raise ValueError("bad yaml")
    monkeypatch.setattr(plugin_readiness.compose_render, "render_compose", _boom)
    mf = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*",
                                 kind="tool", compose="compose.fragment.yml")
    result = plugin_readiness.check("crm", mf, {"crm": mf})
    assert result.passed is False
    assert any("compose" in r for r in result.reasons)


def test_disabled_plugin_with_broken_fragment_does_not_fail_unrelated_candidate(monkeypatch, tmp_path):
    """A DISABLED (not ENABLED) plugin's broken compose fragment must never leak into the readiness
    simulation for an unrelated candidate — only registry.ENABLED plugins are actually merged into the
    real compose file at boot (registry.enabled_ids), so that's the only set readiness should simulate."""
    from app.core import kernel_state, plugin_registry as registry
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))

    # A broken tool plugin, present in the registry but DISABLED — not part of the real boot-time merge.
    registry.set_state("broken-tool", registry.DISABLED)

    def _boom_if_broken_tool_included(base, enabled, manifests):
        if "broken-tool" in enabled:
            raise ValueError("bad yaml")
        return {"services": {}}
    monkeypatch.setattr(plugin_readiness.compose_render, "render_compose", _boom_if_broken_tool_included)

    mf = _mf(kind="tool", compose="compose.fragment.yml")
    result = plugin_readiness.check("crm", mf, {"crm": mf})
    assert result.passed is True
    assert result.reasons == ()
