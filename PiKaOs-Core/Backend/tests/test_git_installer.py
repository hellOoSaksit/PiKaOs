"""app/core/git_installer.py — host allowlist, credential storage, and git subprocess calls
(install-from-git design §2.2-§2.4). Clone/fetch tests use a local bare repo (no network).

    docker compose exec backend pytest tests/test_git_installer.py -v
"""
from __future__ import annotations

import os
import subprocess

import pytest

from app.core import git_installer, kernel_state


@pytest.fixture(autouse=True)
def _isolate_kernel_state(monkeypatch, tmp_path):
    monkeypatch.setattr(kernel_state.settings, "kernel_state_dir", str(tmp_path / "state"))


@pytest.fixture
def local_repo(tmp_path):
    """A local bare git repo with one tagged commit — stands in for a remote over `file://`."""
    src = tmp_path / "src"
    src.mkdir()
    subprocess.run(["git", "init", "-q"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.email", "t@t.co"], cwd=src, check=True)
    subprocess.run(["git", "config", "user.name", "t"], cwd=src, check=True)
    (src / "manifest.json").write_text(
        '{"id":"crm","name":"CRM","version":"1.0.0","coreVersion":"*"}', encoding="utf-8")
    subprocess.run(["git", "add", "."], cwd=src, check=True)
    subprocess.run(["git", "commit", "-q", "-m", "init"], cwd=src, check=True)
    subprocess.run(["git", "tag", "v1.0.0"], cwd=src, check=True)
    return f"file://{src}"


def test_host_allowlist_rejects_by_default(monkeypatch):
    with pytest.raises(git_installer.GitInstallError):
        git_installer.check_host_allowed("https://github.com/acme/crm.git")


def test_host_allowlist_accepts_a_listed_host(monkeypatch):
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: ["github.com"])
    git_installer.check_host_allowed("https://github.com/acme/crm.git")  # no raise


def test_host_allowlist_is_exact_not_substring(monkeypatch):
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: ["github.com"])
    with pytest.raises(git_installer.GitInstallError):
        git_installer.check_host_allowed("https://evil-github.com/acme/crm.git")


def test_credential_round_trips_encrypted(tmp_path):
    git_installer.set_credential("github.com", "ghp_secrettoken")
    raw = kernel_state.read_json("app_settings", {})["plugin_git_credentials"]["value"]["github.com"]
    assert "ghp_secrettoken" not in raw            # stored encrypted, not plaintext
    assert git_installer._credential_for("github.com") == "ghp_secrettoken"


def test_clone_to_staging_rejects_disallowed_host(local_repo):
    with pytest.raises(git_installer.GitInstallError):
        git_installer.clone_to_staging(local_repo)


def test_clone_to_staging_clones_an_allowed_repo(local_repo, monkeypatch):
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])  # file:// has an empty host
    staging = git_installer.clone_to_staging(local_repo, ref="v1.0.0")
    assert (staging / "manifest.json").is_file()


def test_latest_tag_returns_highest_semver(local_repo):
    subprocess.run(["git", "clone", "-q", local_repo, "/tmp/pikaos-test-tag-src"], check=True)
    subprocess.run(["git", "tag", "v1.2.0"], cwd="/tmp/pikaos-test-tag-src", check=True)
    subprocess.run(["git", "push", "origin", "v1.2.0"], cwd="/tmp/pikaos-test-tag-src", check=True)
    assert git_installer.latest_tag(local_repo) == "v1.2.0"


def test_clone_to_staging_uses_askpass_credential_end_to_end(local_repo, monkeypatch):
    """Exercises the `if askpass_token:` branch in `_run_git` end to end (previously untested —
    Finding 2): a credential stored for the `file://` fixture's host ("") must make it through the
    GIT_ASKPASS script without corrupting the git invocation."""
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])  # file:// has an empty host
    git_installer.set_credential("", "some-test-token-value")

    staging = git_installer.clone_to_staging(local_repo, ref="v1.0.0")

    assert (staging / "manifest.json").is_file()


def test_clone_to_staging_askpass_token_with_shell_metacharacters_does_not_inject(
        local_repo, monkeypatch, tmp_path):
    """Regression test for Finding 1/5: a credential token containing shell metacharacters must
    never be executed as shell source. The old code wrote `echo "{token}"` straight into a
    `#!/bin/sh` script — git executes that file via its shebang, so a token containing a backtick
    or `$(...)` would run as an arbitrary shell command. If this test ever starts creating the
    marker files, the injection is back."""
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])  # file:// has an empty host
    marker_backtick = tmp_path / "pikaos-test-injection-marker-backtick"
    marker_subshell = tmp_path / "pikaos-test-injection-marker-subshell"
    token = f"a`touch {marker_backtick}`b$(touch {marker_subshell})c"
    git_installer.set_credential("", token)

    staging = git_installer.clone_to_staging(local_repo, ref="v1.0.0")

    assert (staging / "manifest.json").is_file()     # clone still succeeded
    assert not marker_backtick.exists()               # no shell command executed
    assert not marker_subshell.exists()


def test_run_git_askpass_env_preserves_path():
    """Regression test for Finding 3: passing `env=` to `subprocess.run` replaces the ENTIRE
    subprocess environment, so a naive `env = {"GIT_ASKPASS": ..., ...}` would strip PATH — the
    `git` executable itself would then fail to resolve (subprocess looks up bare command names via
    the *passed* env's PATH, not the parent process's), raising `FileNotFoundError` instead of
    running at all. Confirm the credentialed path still finds + runs `git`."""
    result = git_installer._run_git(["--version"], askpass_token="unused-token")
    assert result.returncode == 0


def test_clone_to_staging_removes_staging_dir_on_timeout(local_repo, monkeypatch):
    """Regression test for Finding 4: `_run_git` can raise (e.g. `subprocess.TimeoutExpired`)
    instead of returning a non-zero `returncode` — the staging dir must still be discarded, and
    the raw exception must not escape as something other than `GitInstallError` (rule 10: clients
    get generic errors, never raw subprocess detail)."""
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])  # file:// has an empty host
    seen_staging: dict[str, str] = {}

    def _boom(args, **kwargs):
        # clone_to_staging's argv always ends in [..., repo_url, str(staging)] — capture it so the
        # test can assert the directory is gone afterwards.
        seen_staging["path"] = args[-1]
        raise subprocess.TimeoutExpired(cmd="git", timeout=60)

    monkeypatch.setattr(git_installer, "_run_git", _boom)

    with pytest.raises(git_installer.GitInstallError):
        git_installer.clone_to_staging(local_repo, ref="v1.0.0")

    assert seen_staging["path"]
    assert not os.path.exists(seen_staging["path"])
