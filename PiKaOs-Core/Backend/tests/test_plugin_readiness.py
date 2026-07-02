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
