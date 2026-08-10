"""app/core/core_update.py — core-v* tag listing + installed-plugin compat (spec §3-§4), the
`GET /api/core/check-update` route over them, and the in-container preflight CLI (§5 step 4)."""
from __future__ import annotations

import subprocess

import pytest

from app.core import core_update
from tests.conftest import AUTH_HEADER, bind_identity


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


def test_is_newer_parses_instead_of_comparing_strings():
    """`0.10.0` is newer than `0.9.0` and sorts BEFORE it as a string — the whole reason this is a
    parse and not a `!=`. An unparseable running version (a dev build) answers False: "I cannot tell"
    must not render as "an update is available"."""
    assert core_update.is_newer("0.3.0", "0.1.0") is True
    assert core_update.is_newer("0.10.0", "0.9.0") is True
    assert core_update.is_newer("0.3.0", "0.3.0") is False
    assert core_update.is_newer("0.3.0", "0.9.0") is False          # never offer a downgrade
    assert core_update.is_newer("0.3.0", "0.1.0-dev") is False


# --- GET /api/core/check-update -------------------------------------------------------------------

def test_check_update_reports_the_latest_tag_and_the_compat_table(client, monkeypatch, core_repo):
    monkeypatch.setattr(core_update.settings, "core_update_repo", core_repo)
    monkeypatch.setattr(core_update.settings, "app_version", "0.1.0")
    bind_identity(client, perms={"plugins.manage"})
    resp = client.get("/api/core/check-update", headers=AUTH_HEADER)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["currentVersion"] == "0.1.0"
    assert body["latestTag"] == "core-v0.3.0" and body["latestVersion"] == "0.3.0"
    assert body["hasUpdate"] is True and body["reachable"] is True
    assert isinstance(body["pluginCompat"], list)
    assert body["blocked"] == any(not r["compatible"] for r in body["pluginCompat"])


def test_check_update_never_offers_an_older_core_as_an_update(client, monkeypatch, core_repo):
    """A build running AHEAD of the newest published tag (a dev or UAT image) is not out of date.
    The plan's `latestVersion != app_version` would answer "update available" here and point the
    admin's one-way host script at an OLDER Core."""
    monkeypatch.setattr(core_update.settings, "core_update_repo", core_repo)
    monkeypatch.setattr(core_update.settings, "app_version", "0.9.0")
    bind_identity(client, perms={"plugins.manage"})
    body = client.get("/api/core/check-update", headers=AUTH_HEADER).json()
    assert body["latestTag"] == "core-v0.3.0"     # still reported — the admin may still want to see it
    assert body["hasUpdate"] is False


def test_a_reachable_remote_with_no_core_releases_is_not_an_outage(client, monkeypatch, tmp_path):
    """Found in UAT 2026-08-10 against the real repo: it answers `ls-remote` fine and has published
    no `core-v*` tag yet, and the card said "release information is unavailable". That is the state
    of EVERY repo before its first Core release — the first thing a new operator sees — and it also
    hides a genuine outage by making the two look identical."""
    import subprocess
    src = tmp_path / "tagless"
    src.mkdir()
    def g(*args): subprocess.run(["git", *args], cwd=src, check=True)
    g("init", "-q"); g("config", "user.email", "t@t.co"); g("config", "user.name", "t")
    (src / "README.md").write_text("x", encoding="utf-8")
    g("add", "."); g("commit", "-q", "-m", "init")
    g("tag", "-a", "v9.9.9", "-m", "the desktop line, not a Core release")

    monkeypatch.setattr(core_update.settings, "core_update_repo", f"file://{src}")
    bind_identity(client, perms={"plugins.manage"})
    body = client.get("/api/core/check-update", headers=AUTH_HEADER).json()
    assert body["reachable"] is True          # the remote answered
    assert body["latestTag"] is None          # ...it just has no Core release
    assert body["hasUpdate"] is False and body["blocked"] is False


def test_core_tags_separates_cannot_reach_from_nothing_published(tmp_path, core_repo):
    assert core_update.core_tags(core_repo) == (True, ["core-v0.3.0", "core-v0.2.0", "core-v0.1.0"])
    assert core_update.core_tags(f"file://{tmp_path / 'nope'}") == (False, [])


def test_check_update_is_quiet_when_the_remote_is_unreachable(client, monkeypatch, tmp_path):
    """Unreachable is a normal state (offline host, private remote, expired credential), not an error:
    the card renders "could not check" rather than the screen failing to load."""
    monkeypatch.setattr(core_update.settings, "core_update_repo", f"file://{tmp_path / 'nope'}")
    bind_identity(client, perms={"plugins.manage"})
    resp = client.get("/api/core/check-update", headers=AUTH_HEADER)
    assert resp.status_code == 200
    body = resp.json()
    assert body["reachable"] is False and body["hasUpdate"] is False and body["pluginCompat"] == []


def test_check_update_is_forbidden_without_plugins_manage(client):
    """Reads on the update surface carry the write's permission: this one spends an outbound
    `ls-remote` and discloses the release history of a repo the caller may not be allowed to see.
    Gate-first also means the unprivileged call never reaches the network."""
    bind_identity(client, perms=set())
    assert client.get("/api/core/check-update", headers=AUTH_HEADER).status_code == 403


def test_check_update_is_authenticated(client):
    assert client.get("/api/core/check-update").status_code == 401


# --- the preflight CLI ----------------------------------------------------------------------------

def test_preflight_cli_exit_codes(monkeypatch, capsys):
    from app.core import update_preflight
    class MF:
        def __init__(self, cv): self.coreVersion = cv
    monkeypatch.setattr(core_update, "_installed_manifests", lambda: {"a": MF("*")})
    assert update_preflight.main(["0.5.0"]) == 0
    monkeypatch.setattr(core_update, "_installed_manifests", lambda: {"a": MF("9.9.9")})
    assert update_preflight.main(["0.5.0"]) == 1
    out = capsys.readouterr().out
    assert "a" in out and "9.9.9" in out


def test_preflight_cli_takes_a_tag_or_a_bare_version(monkeypatch, capsys):
    """`update.bat` has the tag in hand (`core-v0.5.0`), a human types the version — both must gate on
    the same number rather than on a string that never satisfies any range."""
    from app.core import update_preflight
    class MF:
        def __init__(self, cv): self.coreVersion = cv
    monkeypatch.setattr(core_update, "_installed_manifests", lambda: {"a": MF("^0.5.0")})
    for given in ("core-v0.5.1", "v0.5.1", "0.5.1"):
        assert update_preflight.main([given]) == 0, given


def test_preflight_cli_refuses_a_target_that_is_not_a_release(monkeypatch, capsys):
    """The host script checks out whatever it is handed, so this is the gate that stops
    `update.bat main` — and it is exit 2, NOT the 1 that `--force` is allowed to override: a bad
    target is not an incompatible plugin. `_satisfies` would also raise on a `v`-prefixed string
    rather than answer, so an unrecognised target must never reach the compat pass."""
    from app.core import update_preflight
    class MF:
        def __init__(self, cv): self.coreVersion = cv
    monkeypatch.setattr(core_update, "_installed_manifests", lambda: {"a": MF("*")})
    for junk in ("main", "core-v*", "0.5", "", "core-vX.Y.Z"):
        assert update_preflight.main([junk]) == 2, junk
    assert "not a Core release version" in capsys.readouterr().out


def test_preflight_cli_rejects_a_bad_invocation(capsys):
    from app.core import update_preflight
    assert update_preflight.main([]) == 2
    assert "usage" in capsys.readouterr().out


def test_release_page_url_offers_only_something_a_browser_can_safely_open(monkeypatch):
    """The card links "what changed" from this instead of hardcoding a URL in the renderer — so it
    must refuse the remotes that are not a public web page: a local test fixture would leak a server
    path, and an embedded credential must never reach the client."""
    def url_for(repo):
        monkeypatch.setattr(core_update.settings, "core_update_repo", repo)
        return core_update.release_page_url()
    assert url_for("https://github.com/hellOoSaksit/PiKaOs.git") == "https://github.com/hellOoSaksit/PiKaOs"
    assert url_for("https://git.example.co/team/core") == "https://git.example.co/team/core"
    assert url_for("file:///srv/mirrors/core.git") is None
    assert url_for("git@github.com:hellOoSaksit/PiKaOs.git") is None
    assert url_for("https://user:tok@git.example.co/team/core.git") is None
    assert url_for("") is None


def test_check_update_hands_the_ui_the_repo_link_instead_of_a_hardcoded_one(client, monkeypatch, core_repo):
    monkeypatch.setattr(core_update.settings, "core_update_repo", core_repo)   # a file:// fixture
    bind_identity(client, perms={"plugins.manage"})
    assert client.get("/api/core/check-update", headers=AUTH_HEADER).json()["repoUrl"] is None


def test_normalized_version_reads_every_shape_a_target_arrives_in():
    assert core_update.normalized_version("core-v0.3.0") == "0.3.0"
    assert core_update.normalized_version("v0.3.0") == "0.3.0"
    assert core_update.normalized_version("0.3.0") == "0.3.0"
    assert core_update.normalized_version("main") is None
    assert core_update.normalized_version("core-v*") is None
