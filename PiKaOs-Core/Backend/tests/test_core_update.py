"""app/core/core_update.py — core-v* tag listing + installed-plugin compat (spec §3-§4)."""
from __future__ import annotations

import subprocess

import pytest

from app.core import core_update


@pytest.fixture
def core_repo(tmp_path):
    """A local repo carrying core-v* tags, plus two decoys that must NOT be listed: the desktop
    updater's own `v*` release tag (a DIFFERENT product line — the whole reason core tags carry a
    prefix) and a non-semver tag."""
    src = tmp_path / "core-src"
    src.mkdir()
    def g(*args): subprocess.run(["git", *args], cwd=src, check=True)
    g("init", "-q"); g("config", "user.email", "t@t.co"); g("config", "user.name", "t")
    (src / "README.md").write_text("x", encoding="utf-8")
    g("add", "."); g("commit", "-q", "-m", "init")
    for tag in ("core-v0.1.0", "core-v0.3.0", "core-v0.2.0", "v9.9.9", "not-semver"):
        g("tag", "-a", tag, "-m", tag)   # ANNOTATED: emits both `ref` and `ref^{}`, exercising the dedupe
    return f"file://{src}"


def test_list_core_tags_newest_first_ignoring_desktop_and_junk_tags(core_repo):
    assert core_update.list_core_tags(core_repo) == ["core-v0.3.0", "core-v0.2.0", "core-v0.1.0"]
    assert core_update.latest_core_tag(core_repo) == "core-v0.3.0"


def test_the_two_tag_families_never_appear_in_each_others_listing(core_repo):
    """`v9.9.9` is the desktop updater's line and sorts ABOVE every core tag, so a listing that leaked
    it would also mis-report `latest`. The reverse leak matters just as much: the plugin listing must
    not offer `core-v*` as a switchable plugin version."""
    from app.core import git_installer
    assert "v9.9.9" not in core_update.list_core_tags(core_repo)
    assert git_installer.list_remote_tags(core_repo) == ["v9.9.9"]


def test_list_core_tags_empty_on_unreachable(tmp_path):
    assert core_update.list_core_tags(f"file://{tmp_path / 'nope'}") == []


def test_version_of_strips_the_prefix():
    assert core_update.version_of("core-v1.2.3") == "1.2.3"


def test_plugin_compat_flags_incompatible_ranges(monkeypatch):
    class MF:  # duck-typed manifest: only .coreVersion is read
        def __init__(self, cv): self.coreVersion = cv
    monkeypatch.setattr(core_update, "_installed_manifests",
                        lambda: {"okplug": MF("*"), "pinned": MF("^0.1.0"), "exact": MF("9.9.9")})
    report = core_update.plugin_compat("0.1.5")
    by = {r["id"]: r for r in report}
    assert by["okplug"]["compatible"] is True
    assert by["pinned"] == {"id": "pinned", "requires": "^0.1.0", "compatible": True}
    assert by["exact"]["compatible"] is False
