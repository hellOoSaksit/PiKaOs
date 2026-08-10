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


# --- dependencyVersions: an optional MINIMUM per declared dependency (spec §8.3) ---------------------
# Same range dialect as coreVersion (`*` · exact · caret), so a plugin author learns one syntax.

def _dep_case(monkeypatch, tmp_path, *, ai_version, spec=None):
    """A `rag` plugin depending on `ai`, optionally pinning a range at it."""
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    over = {"dependencies": ["ai"]}
    if spec is not None:
        over["dependencyVersions"] = {"ai": spec}
    rag = plugin_loader._validate("crm", {"id": "crm", "name": "CRM", "version": "1.0.0",
                                          "coreVersion": "*", **over})
    ai = plugin_loader.Manifest(id="ai", name="AI", version=ai_version, coreVersion="*")
    return plugin_readiness.check("crm", rag, {"crm": rag, "ai": ai})


def test_dependency_version_range_satisfied_passes(monkeypatch, tmp_path):
    assert _dep_case(monkeypatch, tmp_path, ai_version="0.2.5", spec="^0.2.0").passed


def test_dependency_version_range_violated_fails_with_reason(monkeypatch, tmp_path):
    result = _dep_case(monkeypatch, tmp_path, ai_version="0.2.5", spec="^0.3.0")
    assert result.passed is False
    assert any("ai" in r and "^0.3.0" in r and "0.2.5" in r for r in result.reasons)


def test_absent_dependency_versions_is_todays_behavior(monkeypatch, tmp_path):
    """The key is optional and every manifest in the tree predates it — an absent one must not start
    gating installs that pass today."""
    assert _dep_case(monkeypatch, tmp_path, ai_version="0.0.1").passed


def test_an_unresolvable_dependency_is_reported_once_not_twice(monkeypatch, tmp_path):
    """A missing dependency has no version to compare, so the range check must not pile a second,
    confusing reason on top of "not resolvable" — the operator gets one fault per fault."""
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    mf = _mf(dependencies=["ai"], dependencyVersions={"ai": "^9.0.0"})
    result = plugin_readiness.check("crm", mf, {"crm": mf})
    assert result.passed is False
    assert len(result.reasons) == 1 and "not resolvable" in result.reasons[0]


def test_dependency_versions_must_name_a_declared_dependency(monkeypatch, tmp_path):
    """A range against a plugin that is not a dependency is silently dead — nothing would ever check
    it — so the Loader refuses the manifest instead of loading a rule that cannot fire. Catches the
    common typo of pinning an OPTIONAL dependency here."""
    import pytest
    with pytest.raises(plugin_loader.ManifestError, match="dependencyVersions"):
        _mf(dependencies=["ai"], dependencyVersions={"knowledge": "^1.0.0"})


def test_dependency_versions_must_be_a_map_of_strings():
    import pytest
    for bad in (["ai"], {"ai": 1}, {"ai": None}):
        with pytest.raises(plugin_loader.ManifestError, match="dependencyVersions"):
            _mf(dependencies=["ai"], dependencyVersions=bad)


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
