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


def test_set_git_install_records_the_commit_sha(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    reg = registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git",
                                   tag="v1.0.0", version="1.0.0", sha="a" * 40)
    assert registry.installed_sha_of(reg, "crm") == "a" * 40


def test_installed_sha_is_none_for_a_legacy_row_without_it(monkeypatch, tmp_path):
    """An entry written before SHA-pinning (or a symlink install) has no installedSha — reads as None,
    never a KeyError."""
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    reg = registry.set_git_install("crm", repo_url="https://github.com/acme/crm.git",
                                   tag="v1.0.0", version="1.0.0")   # no sha=
    assert registry.installed_sha_of(reg, "crm") is None
    assert registry.installed_sha_of({}, "missing") is None


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


# --- registry version history (auto-update §5.2): the rollback memory -------------------------------

def test_set_git_install_appends_version_history(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.0.0", version="1.0.0", sha="aaa", by="u_admin")
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.1.0", version="1.1.0", sha="bbb", by="u_admin")
    reg = registry.read()
    hist = registry.version_history_of(reg, "crm")
    assert [h["tag"] for h in hist] == ["v1.0.0", "v1.1.0"]
    assert hist[-1]["sha"] == "bbb" and hist[-1]["by"] == "u_admin" and hist[-1]["at"]


def test_version_history_is_capped_at_20(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    for i in range(25):
        registry.set_git_install("crm", repo_url="https://x/r.git", tag=f"v1.0.{i}", version=f"1.0.{i}", sha=str(i))
    hist = registry.version_history_of(registry.read(), "crm")
    assert len(hist) == 20
    assert hist[0]["tag"] == "v1.0.5" and hist[-1]["tag"] == "v1.0.24"


def test_previous_tag_of_skips_the_current_tag(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.0.0", version="1.0.0")
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.1.0", version="1.1.0")
    reg = registry.read()
    assert registry.previous_tag_of(reg, "crm") == "v1.0.0"
    # switching BACK: previous becomes v1.1.0 (the newest entry that differs from current)
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.0.0", version="1.0.0")
    assert registry.previous_tag_of(registry.read(), "crm") == "v1.1.0"


def test_previous_tag_of_none_for_single_or_unknown(monkeypatch, tmp_path):
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    assert registry.previous_tag_of(registry.read(), "ghost") is None
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.0.0", version="1.0.0")
    assert registry.previous_tag_of(registry.read(), "crm") is None


def test_set_git_install_no_op_reinstall_does_not_grow_history(monkeypatch, tmp_path):
    """A retrying/polling caller hitting update with no new release must not evict the real rollback
    target from the capped list (fix round 1, Important 1) — same tag AND same sha appends nothing."""
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.1.0", version="1.1.0", sha="bbb")
    for _ in range(20):
        reg = registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.1.0", version="1.1.0", sha="bbb")
    hist = registry.version_history_of(reg, "crm")
    assert len(hist) == 1
    assert registry.previous_tag_of(reg, "crm") is None   # nothing to roll back to — as expected here


def test_set_git_install_force_moved_tag_still_records_a_row(monkeypatch, tmp_path):
    """Same tag name, new commit (a force-moved release) is NOT a no-op — the sha changed, so it must
    still land in history even though the tag string didn't."""
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.1.0", version="1.1.0", sha="bbb")
    reg = registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.1.0", version="1.1.0", sha="ccc")
    hist = registry.version_history_of(reg, "crm")
    assert [h["sha"] for h in hist] == ["bbb", "ccc"]


def test_set_git_install_starts_history_from_a_legacy_row_with_no_versionHistory_key(monkeypatch, tmp_path):
    """An entry that already EXISTS (written by `set_state`, pre-dating this feature) has no
    `versionHistory` key at all yet — distinct from `pid` having no entry whatsoever."""
    from app.core import kernel_state
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path))
    registry.set_state("crm", registry.INSTALLED, version="1.0.0")
    reg = registry.set_git_install("crm", repo_url="https://x/r.git", tag="v1.0.0", version="1.0.0")
    hist = registry.version_history_of(reg, "crm")
    assert len(hist) == 1 and hist[0]["tag"] == "v1.0.0"


def test_version_history_of_ignores_malformed_shapes():
    """A hand-corrupted (or future-incompatible) state file must not raise — the whole-field-not-a-list
    and per-element-not-a-dict guards, pinned so a later refactor can't drop them silently."""
    assert registry.version_history_of({"crm": {"versionHistory": "junk"}}, "crm") == []
    reg = {"crm": {"versionHistory": [{"tag": "v1"}, "junk"]}}
    assert registry.version_history_of(reg, "crm") == [{"tag": "v1"}]
