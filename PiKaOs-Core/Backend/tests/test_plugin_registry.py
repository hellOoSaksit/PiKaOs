"""Unit tests for the plugin install resolver (the dependency-request brain, P2b).

`resolve_install_plan` is pure (manifests + installed set → plan), so these run in-process with no DB.
They pin the behaviours the install UI promises: pull in missing deps dependency-first, **skip deps that
are already installed (no duplicate install)**, order topologically, and flag an unknown target.
"""
from __future__ import annotations

from dataclasses import dataclass, field

from app.core import plugin_registry as registry


@dataclass(frozen=True)
class _Mf:
    """Minimal stand-in for plugin_loader.Manifest — the resolver only reads `.dependencies`."""
    dependencies: tuple[str, ...] = ()


# ai ← knowledge ← qa ; ui is independent
MANIFESTS = {
    "ai": _Mf(),
    "knowledge": _Mf(dependencies=("ai",)),
    "qa": _Mf(dependencies=("knowledge",)),
    "ui": _Mf(),
}


def test_install_pulls_missing_dep_first():
    plan = registry.resolve_install_plan("knowledge", MANIFESTS, installed=set())
    assert plan["unknown"] is False
    assert plan["order"] == ["ai", "knowledge"]          # dep before dependent
    assert plan["to_install"] == ["ai", "knowledge"]
    assert plan["already_installed"] == []


def test_already_installed_dep_is_skipped():
    # ai already installed by some other plugin → installing knowledge must NOT reinstall ai
    plan = registry.resolve_install_plan("knowledge", MANIFESTS, installed={"ai"})
    assert plan["already_installed"] == ["ai"]
    assert plan["to_install"] == ["knowledge"]


def test_transitive_chain_orders_deep_deps():
    plan = registry.resolve_install_plan("qa", MANIFESTS, installed=set())
    assert plan["order"] == ["ai", "knowledge", "qa"]
    assert plan["to_install"] == ["ai", "knowledge", "qa"]


def test_fully_satisfied_target_installs_only_itself():
    plan = registry.resolve_install_plan("qa", MANIFESTS, installed={"ai", "knowledge"})
    assert plan["to_install"] == ["qa"]
    assert plan["already_installed"] == ["ai", "knowledge"]


def test_no_deps_plugin():
    plan = registry.resolve_install_plan("ui", MANIFESTS, installed=set())
    assert plan["order"] == ["ui"]
    assert plan["to_install"] == ["ui"]


def test_unknown_target():
    plan = registry.resolve_install_plan("nope", MANIFESTS, installed=set())
    assert plan["unknown"] is True
    assert plan["to_install"] == []


# --- registry state helpers (pure over a plain dict) ------------------------------------------------

def test_state_helpers():
    reg = {"ai": {"state": registry.ENABLED}, "knowledge": {"state": registry.DISABLED}}
    assert registry.state_of(reg, "ai") == registry.ENABLED
    assert registry.state_of(reg, "missing") == registry.AVAILABLE     # no row ⇒ available
    assert registry.enabled_ids(reg) == {"ai"}                         # disabled is not enabled


# --- git-install provenance + pending-purge state ---------------------------------------------------

def test_set_git_install_records_provenance(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    reg = registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    assert registry.installed_via(reg, "crm") == "git"
    assert registry.repo_url_of(reg, "crm") == "https://github.com/acme/crm.git"
    assert reg["crm"]["installedTag"] == "v1.0.0"
    assert registry.state_of(reg, "crm") == registry.ENABLED


def test_installed_via_defaults_to_symlink():
    reg = {"crm": {"state": registry.ENABLED}}
    assert registry.installed_via(reg, "crm") == "symlink"
    assert registry.repo_url_of(reg, "crm") is None


def test_uninstall_git_moves_to_pending_purge_and_keeps_provenance(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    reg = registry.uninstall_git("crm")
    assert registry.state_of(reg, "crm") == registry.PENDING_PURGE
    assert registry.repo_url_of(reg, "crm") == "https://github.com/acme/crm.git"  # kept for Purge


def test_purge_complete_forgets_the_plugin(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git", tag="v1.0.0", version="1.0.0")
    registry.uninstall_git("crm")
    reg = registry.purge_complete("crm")
    assert registry.state_of(reg, "crm") == registry.AVAILABLE
    assert "crm" not in reg
