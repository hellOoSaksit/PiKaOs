"""Install a plugin from a git remote (install-from-git design §2.2-§2.4).

Clones into a staging directory first, never straight into PLUGINS_DIR — a failure at any later
point (bad manifest, incompatible coreVersion, failed readiness check) just discards the staging
dir, so PLUGINS_DIR never holds a half-installed plugin. Every git invocation is an argument-array
subprocess call (CLAUDE.md rule 10 — no string-built shell); credentials are injected via a
throwaway `GIT_ASKPASS` script for a single call, never embedded in the URL or logged.
"""
from __future__ import annotations

import shutil
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlsplit

from . import kernel_state
from .crypto import decrypt, encrypt

_APP = "app_settings"                              # same kernel-local blob settings_config.py uses
_ALLOWLIST_KEY = "plugin_install_allowed_hosts"     # {value: [host, ...]}
_CREDENTIALS_KEY = "plugin_git_credentials"         # {value: {host: encrypted_token}}


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


def _run_git(args: list[str], *, cwd: str | None = None, askpass_token: str | None = None,
             timeout: int = 60) -> subprocess.CompletedProcess:
    """One argument-array `git` invocation, returned uninterpreted (caller checks `returncode`)."""
    env = None
    askpass_path: str | None = None
    if askpass_token:
        fd, askpass_path = tempfile.mkstemp(prefix="pikaos-askpass-", text=True)
        with open(fd, "w") as f:
            f.write(f'#!/bin/sh\necho "{askpass_token}"\n')
        Path(askpass_path).chmod(0o700)
        env = {"GIT_ASKPASS": askpass_path, "GIT_TERMINAL_PROMPT": "0"}
    try:
        return subprocess.run(["git", *args], cwd=cwd, env=env, capture_output=True, text=True,
                               timeout=timeout)
    finally:
        if askpass_path:
            Path(askpass_path).unlink(missing_ok=True)


def clone_to_staging(repo_url: str, ref: str | None = None) -> Path:
    """Shallow-clone `repo_url` (optionally at `ref`) into a fresh temp staging dir. Raises on a
    disallowed host or a failed clone; discards the staging dir on failure."""
    check_host_allowed(repo_url)
    staging = Path(tempfile.mkdtemp(prefix="pikaos-plugin-install-"))
    args = ["clone", "--depth", "1"]
    if ref:
        args += ["--branch", ref]
    args += [repo_url, str(staging)]
    result = _run_git(args, askpass_token=_credential_for(_host_of(repo_url)))
    if result.returncode != 0:
        shutil.rmtree(staging, ignore_errors=True)
        raise GitInstallError("could not clone the plugin repository")
    return staging


def latest_tag(repo_url: str) -> str | None:
    """The highest semver git tag on `repo_url`'s remote, or None if it has no (semver) tags."""
    result = _run_git(["ls-remote", "--tags", repo_url], askpass_token=_credential_for(_host_of(repo_url)),
                       timeout=30)
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
    result = _run_git(["fetch", "--depth", "1", "origin", "tag", tag], cwd=str(plugin_dir),
                       askpass_token=token)
    if result.returncode != 0:
        raise GitInstallError("could not fetch the update")
    result = _run_git(["checkout", f"tags/{tag}"], cwd=str(plugin_dir))
    if result.returncode != 0:
        raise GitInstallError("could not check out the update")
