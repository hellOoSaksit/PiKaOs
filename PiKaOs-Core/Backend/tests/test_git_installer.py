"""app/core/git_installer.py — host allowlist, credential storage, and git subprocess calls
(install-from-git design §2.2-§2.4). Clone/fetch tests use a local bare repo (no network).

    docker compose exec backend pytest tests/test_git_installer.py -v
"""
from __future__ import annotations

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
