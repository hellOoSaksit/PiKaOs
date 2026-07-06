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


def test_head_sha_returns_the_checked_out_commit(local_repo, monkeypatch, tmp_path):
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])
    staging = git_installer.clone_to_staging(local_repo, ref="v1.0.0")
    sha = git_installer.head_sha(staging)
    assert isinstance(sha, str) and len(sha) == 40
    # matches what git itself reports for that working tree
    expected = subprocess.run(["git", "rev-parse", "HEAD"], cwd=staging,
                              capture_output=True, text=True).stdout.strip()
    assert sha == expected


def test_head_sha_returns_none_for_a_non_git_dir(tmp_path):
    assert git_installer.head_sha(tmp_path) is None


def test_remote_tag_sha_matches_the_checked_out_head(local_repo, monkeypatch):
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])
    staging = git_installer.clone_to_staging(local_repo, ref="v1.0.0")
    assert git_installer.remote_tag_sha(local_repo, "v1.0.0") == git_installer.head_sha(staging)


def test_remote_tag_sha_returns_none_for_a_missing_tag(local_repo):
    assert git_installer.remote_tag_sha(local_repo, "v9.9.9") is None


def test_askpass_script_prints_the_token_verbatim(tmp_path):
    """The legitimate-case proof: the script `_run_git` writes (via `_write_askpass_script`),
    executed directly the same way git would exec it (`sh <script>`, token supplied through the
    `PIKAOS_ASKPASS_TOKEN` env var), must print exactly the token to stdout. This — not a `file://`
    clone — is what actually exercises the script body, because git never invokes `GIT_ASKPASS` for
    `file://` transport (local filesystem access needs no credential resolution; verified by
    replaying the clone against the fixture with `GIT_ASKPASS` set — the script process never
    starts). The two prior tests that drove this through `clone_to_staging` against the `file://`
    fixture therefore never ran the script at all and passed regardless of whether the injection
    bug was fixed — see task-5-report.md Fix Report Round 2."""
    script_path = git_installer._write_askpass_script("some-test-token-value")
    try:
        result = subprocess.run(
            ["sh", str(script_path)],
            env={"PIKAOS_ASKPASS_TOKEN": "some-test-token-value"},
            capture_output=True, text=True, check=True)
    finally:
        script_path.unlink(missing_ok=True)

    assert result.stdout == "some-test-token-value\n"


def test_askpass_script_token_with_shell_metacharacters_does_not_inject(tmp_path):
    """Regression test for Finding 1/5, fixed for real this round: a credential token containing
    shell metacharacters must never be executed as shell source. The old code wrote
    `f.write(f'#!/bin/sh\\necho "{token}"\\n')` — string-interpolating the token straight into the
    script text that git executes via its `#!/bin/sh` shebang — so a backtick or `$(...)` in the
    token would run as an arbitrary shell command. This test executes the actual generated script
    directly (bypassing git and its `file://`-only-skips-askpass quirk entirely) and asserts on its
    real stdout/side-effects: the token must come out unexecuted, and no marker file may appear.
    Verified RED/RE-GREEN: reverting `_write_askpass_script`'s body to the old f-string construction
    makes this test fail (the marker file gets created); restoring the `printf` + env-var version
    makes it pass again — see task-5-report.md Fix Report Round 2."""
    marker_backtick = tmp_path / "pikaos-test-injection-marker-backtick"
    marker_subshell = tmp_path / "pikaos-test-injection-marker-subshell"
    token = f"a`touch {marker_backtick}`b$(touch {marker_subshell})c"

    script_path = git_installer._write_askpass_script(token)
    try:
        result = subprocess.run(
            ["sh", str(script_path)],
            env={"PIKAOS_ASKPASS_TOKEN": token},
            capture_output=True, text=True, check=True)
    finally:
        script_path.unlink(missing_ok=True)

    assert result.stdout == f"{token}\n"   # raw token, never interpreted as shell source
    assert not marker_backtick.exists()    # no shell command executed
    assert not marker_subshell.exists()


def test_clone_to_staging_with_stored_credential_still_succeeds(local_repo, monkeypatch):
    """Lighter integration test: proves the credential-lookup plumbing (`_credential_for`, decrypt,
    passing `askpass_token` through to `_run_git`) doesn't break a clone — NOT a proof that the
    injection fix holds (git never calls `GIT_ASKPASS` for `file://` transport at all, so this path
    can't exercise the script body; that proof lives in the `test_askpass_script_*` tests above)."""
    monkeypatch.setattr(git_installer, "allowed_hosts", lambda: [""])  # file:// has an empty host
    git_installer.set_credential("", "some-test-token-value")

    staging = git_installer.clone_to_staging(local_repo, ref="v1.0.0")

    assert (staging / "manifest.json").is_file()


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
