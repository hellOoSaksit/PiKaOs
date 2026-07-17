"""Install a plugin from a git remote (install-from-git design §2.2-§2.4).

Clones into a staging directory first, never straight into PLUGINS_DIR — a failure at any later
point (bad manifest, incompatible coreVersion, failed readiness check) just discards the staging
dir, so PLUGINS_DIR never holds a half-installed plugin. Every git invocation is an argument-array
subprocess call (CLAUDE.md rule 10 — no string-built shell); credentials are injected via a
throwaway `GIT_ASKPASS` script for a single call, never embedded in the URL or logged.
"""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from . import kernel_state
from .crypto import decrypt, encrypt

log = logging.getLogger("pikaos.plugins.git_installer")

_APP = "app_settings"                              # same kernel-local blob settings_config.py uses
# Installer-owned keys in the shared `app_settings` blob. K4 (2026-07-06) additionally reserved them
# out of the generic `/api/settings/global/{key}` KV so an `options.manage` caller could not read the
# credentials or widen the host allowlist. G1 (2026-07-14) removed that KV tier outright, so the reserve
# list it fed went with it: no route takes a caller-supplied `app_settings` key any more — the settings
# API's only writer (`put_nav`) hardcodes "nav", and these two keys are written here, behind the
# plugins.manage-gated installer routes.
_ALLOWLIST_KEY = "plugin_install_allowed_hosts"     # {value: [host, ...]}
_CREDENTIALS_KEY = "plugin_git_credentials"         # {value: {host: encrypted_token}}
_STDERR_LOG_LIMIT = 2000                            # cap so one runaway git error can't flood the log


class GitInstallError(Exception):
    """A git-install step failed. The router turns this into a generic 4xx — the real subprocess
    stderr / filesystem detail is never in the message (rule 10: clients get generic errors)."""


def _app_value(key: str):
    entry = kernel_state.read_json(_APP, {}).get(key)
    return entry.get("value") if isinstance(entry, dict) else None


def allowed_hosts() -> list[str]:
    """The admin-configured git host allowlist — empty (fail-closed) until an admin adds one."""
    value = _app_value(_ALLOWLIST_KEY)
    return list(value) if isinstance(value, list) else []


def _host_of(repo_url: str) -> str:
    """The hostname from either an `https://host/...` or a `git@host:...` scp-style URL."""
    if "://" in repo_url:
        return urlsplit(repo_url).hostname or ""
    if "@" in repo_url and ":" in repo_url:
        return repo_url.split("@", 1)[1].split(":", 1)[0]
    return ""


def check_host_allowed(repo_url: str) -> None:
    """Raise unless `repo_url`'s host is in the allowlist. Exact (case-insensitive) match only —
    never substring — so `evil-github.com` can't ride on a `github.com` entry."""
    host = _host_of(repo_url)
    if host.lower() not in {h.lower() for h in allowed_hosts()}:
        raise GitInstallError(f"host '{host}' is not in the plugin-install allowlist")


def set_credential(host: str, token: str) -> None:
    """Encrypt + store a git credential (PAT/deploy key) for `host` — one token covers every
    allowlisted repo under that host (§2.4)."""
    store = kernel_state.read_json(_APP, {})
    creds = dict((store.get(_CREDENTIALS_KEY) or {}).get("value") or {})
    creds[host.lower()] = encrypt(token)
    store[_CREDENTIALS_KEY] = {"value": creds}
    kernel_state.write_json(_APP, store)


def _credential_for(host: str) -> str | None:
    creds = _app_value(_CREDENTIALS_KEY) or {}
    token = creds.get(host.lower())
    return decrypt(token) if token else None


def _write_askpass_script(token: str) -> Path:
    """Write the throwaway `GIT_ASKPASS` script that resolves `token` and return its path. Split
    out of `_run_git` so the script body can be tested directly (by executing it via
    `subprocess.run(["sh", path], env=...)`) without going through git at all — see
    `test_askpass_script_*` in test_git_installer.py.

    `token` is NEVER string-interpolated into the script text (git executes this file via its
    `#!/bin/sh` shebang, so anything written here is parsed as shell source — a token containing
    `` ` `` or `$(...)` would otherwise be arbitrary command injection). The script instead only
    echoes the `PIKAOS_ASKPASS_TOKEN` environment variable, which the caller (`_run_git`) sets to
    `token` when it invokes `git` with this script as `GIT_ASKPASS` — the shell expands it at
    runtime rather than at write time, so `token`'s value never becomes part of the script source.
    """
    fd, askpass_path = tempfile.mkstemp(prefix="pikaos-askpass-", text=True)
    with open(fd, "w") as f:
        # `printf '%s\n'` (not `echo`) is exact regardless of a leading `-` or backslashes.
        f.write('#!/bin/sh\nprintf \'%s\\n\' "$PIKAOS_ASKPASS_TOKEN"\n')
    Path(askpass_path).chmod(0o700)
    return Path(askpass_path)


def _run_git(args: list[str], *, cwd: str | None = None, askpass_token: str | None = None,
             timeout: int = 60) -> subprocess.CompletedProcess:
    """One argument-array `git` invocation, returned uninterpreted (caller checks `returncode`)."""
    env = None
    askpass_path: str | None = None
    if askpass_token:
        askpass_path = str(_write_askpass_script(askpass_token))
        env = {**os.environ, "GIT_ASKPASS": askpass_path, "GIT_TERMINAL_PROMPT": "0",
               "PIKAOS_ASKPASS_TOKEN": askpass_token}
    try:
        return subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, text=True,
                               timeout=timeout)
    finally:
        if askpass_path:
            Path(askpass_path).unlink(missing_ok=True)


def _log_git_failure(step: str, result: subprocess.CompletedProcess) -> None:
    """Log the subprocess detail a `GitInstallError` deliberately hides from the client (rule 10:
    clients get generic errors, stack traces/subprocess detail stay in server logs). Safe to log
    verbatim: credentials never flow through the URL or the command line — `_run_git` hands the
    token to git via a throwaway `GIT_ASKPASS` script (see `_write_askpass_script`). Git spawns that
    script as its OWN child process and reads the token from *that* process' stdout directly; it is
    never echoed back into the outer `git` process' stdout/stderr, which is the only thing `_run_git`
    (and therefore `result` here) ever captures."""
    stderr = (result.stderr or "").strip()
    if len(stderr) > _STDERR_LOG_LIMIT:
        stderr = stderr[:_STDERR_LOG_LIMIT] + "... (truncated)"
    log.warning("git %s failed (exit %s): %s", step, result.returncode, stderr)


def clone_to_staging(repo_url: str, ref: str | None = None) -> Path:
    """Shallow-clone `repo_url` (optionally at `ref`) into a fresh temp staging dir. Raises on a
    disallowed host or a failed clone; discards the staging dir on failure."""
    check_host_allowed(repo_url)
    staging = Path(tempfile.mkdtemp(prefix="pikaos-plugin-install-"))
    args = ["clone", "--depth", "1"]
    if ref:
        args += ["--branch", ref]
    # `--` ends option parsing so a repo_url/staging path that happens to start with `-` can never
    # be parsed as a git flag (argument injection — Finding 5).
    args += ["--", repo_url, str(staging)]
    try:
        result = _run_git(args, askpass_token=_credential_for(_host_of(repo_url)))
    except Exception:
        # `_run_git` can raise (e.g. `subprocess.TimeoutExpired`) instead of returning a non-zero
        # `returncode` — the staging dir must still be discarded, and no raw exception detail
        # should escape this module's error boundary (rule 10: clients get generic errors).
        shutil.rmtree(staging, ignore_errors=True)
        raise GitInstallError("could not clone the plugin repository")
    if result.returncode != 0:
        _log_git_failure("clone", result)
        shutil.rmtree(staging, ignore_errors=True)
        raise GitInstallError("could not clone the plugin repository")
    return staging


def latest_tag(repo_url: str) -> str | None:
    """The highest semver git tag on `repo_url`'s remote, or None if it has no (semver) tags."""
    result = _run_git(["ls-remote", "--tags", "--", repo_url],
                       askpass_token=_credential_for(_host_of(repo_url)), timeout=30)
    if result.returncode != 0:
        return None
    tags: list[tuple[tuple[int, int, int], str]] = []
    for line in result.stdout.splitlines():
        ref = line.rsplit("refs/tags/", 1)[-1].removesuffix("^{}")
        parts = ref.lstrip("v").split(".")
        if len(parts) == 3 and all(p.isdigit() for p in parts):
            tags.append(((int(parts[0]), int(parts[1]), int(parts[2])), ref))
    return max(tags)[1] if tags else None


def fetch_and_checkout(plugin_dir: Path, repo_url: str, tag: str) -> None:
    """Fetch + check out `tag` in an already-installed plugin directory (the update flow, §2.2)."""
    token = _credential_for(_host_of(repo_url))
    # `--` before the positional repository/refspec args stops a `tag` value starting with `-`
    # from being parsed as a git flag (argument injection — Finding 5).
    result = _run_git(["fetch", "--depth", "1", "--", "origin", "tag", tag], cwd=str(plugin_dir),
                       askpass_token=token)
    if result.returncode != 0:
        _log_git_failure("fetch", result)
        raise GitInstallError("could not fetch the update")
    # `checkout` is the opposite: `git checkout -- <ref>` switches into "restore paths" mode and
    # never touches HEAD, so `--` must come AFTER the ref (git-checkout(1)) — confirmed empirically.
    result = _run_git(["checkout", f"tags/{tag}", "--"], cwd=str(plugin_dir))
    if result.returncode != 0:
        _log_git_failure("checkout", result)
        raise GitInstallError("could not check out the update")


def head_sha(plugin_dir: Path) -> str | None:
    """The full commit SHA currently checked out in `plugin_dir`, or None if it isn't a git working
    tree (e.g. a dev symlink to a non-repo, or git itself failing). This is the immutable pin we record
    at install/update time — a tag can be force-moved later, a commit SHA cannot (marketplace.md W2)."""
    result = _run_git(["rev-parse", "HEAD"], cwd=str(plugin_dir), timeout=15)
    if result.returncode != 0:
        return None
    sha = result.stdout.strip()
    return sha or None


def remote_tag_sha(repo_url: str, tag: str) -> str | None:
    """The COMMIT SHA `tag` resolves to on `repo_url`'s remote, or None if the tag is absent. An
    annotated tag has two ls-remote lines — `<sha> refs/tags/<tag>` (the tag object) and
    `<sha>^{} refs/tags/<tag>^{}` (the commit it dereferences to); we want the commit, so the `^{}`
    line wins when present (it's what `git checkout tags/<tag>` lands HEAD on, so it matches
    `head_sha` after an install). Used to detect a tag that was moved after we pinned it (W2)."""
    result = _run_git(["ls-remote", "--tags", "--", repo_url, tag, f"{tag}^{{}}"],
                      askpass_token=_credential_for(_host_of(repo_url)), timeout=30)
    if result.returncode != 0:
        return None
    deref: str | None = None
    plain: str | None = None
    for line in result.stdout.splitlines():
        parts = line.split()
        if len(parts) != 2:
            continue
        sha, ref = parts
        if ref.endswith("^{}"):
            deref = sha
        elif ref == f"refs/tags/{tag}":
            plain = sha
    return deref or plain
