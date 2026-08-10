"""Server-Core update check (server-core-update spec §3-§4): list `core-v*` release tags on the
monorepo with the same hardened git helper the plugin installer uses (argument-array subprocess,
timeout, no GitHub API), and compute which INSTALLED plugins would survive a given target Core
version. Local data + one ls-remote — no polling, no SSRF surface (the repo URL is a setting).

`core-v*` is a plain annotated git tag and deliberately NOT a GitHub Release: the latest Release
object belongs to the desktop updater, which reads it to find the app binary. Two product lines, two
tag families, one repo — the prefix is what keeps them apart, and `git_installer.sorted_semver_refs`
is the single parser both listings go through so they cannot drift into matching each other.
"""
from __future__ import annotations

from . import git_installer
from .config import settings

CORE_TAG_PREFIX = "core-v"


def _installed_manifests() -> dict:
    """id -> Manifest for every discovered plugin (lazy import — same seam rule as routers/plugins.py:
    Core never reaches up into the composition layer at module-load time)."""
    from .. import plugin_loader
    return plugin_loader.PLUGIN_MANIFESTS


def list_core_tags(repo_url: str | None = None) -> list[str]:
    """Every `core-vX.Y.Z` tag on the release repo, deduped, newest-first ([] on failure).

    No `askpass_token`: the release repo is a fixed public setting, so there is no credential to
    attach and nothing operator-supplied to allowlist. `repo_url` is a test seam, not a route input.
    """
    url = repo_url or settings.core_update_repo
    result = git_installer._run_git(["ls-remote", "--tags", "--", url], timeout=30)
    if result.returncode != 0:
        return []
    return git_installer.sorted_semver_refs(result.stdout, prefix=CORE_TAG_PREFIX)


def latest_core_tag(repo_url: str | None = None) -> str | None:
    tags = list_core_tags(repo_url)
    return tags[0] if tags else None


def version_of(tag: str) -> str:
    """`core-v0.3.0` -> `0.3.0`. Passes anything else through unchanged, so a caller comparing against
    `settings.app_version` never has to know whether it holds a tag or a bare version."""
    return tag[len(CORE_TAG_PREFIX):] if tag.startswith(CORE_TAG_PREFIX) else tag


def is_newer(candidate_version: str, current_version: str) -> bool:
    """Is `candidate_version` a LATER Core than `current_version`? Both bare `X.Y.Z`.

    Versions are compared by parsing, never as strings — `0.10.0` sorts before `0.9.0` as text, and
    the answer here decides whether an admin is told to point a one-way host script at another image.
    A version neither side can parse (a dev build) answers False: "I cannot tell" must never render
    as "an update is available".
    """
    candidate = git_installer._semver_key(candidate_version, "")
    current = git_installer._semver_key(current_version, "")
    return candidate is not None and current is not None and candidate > current


def plugin_compat(target_version: str) -> list[dict]:
    """For each installed plugin: does its manifest `coreVersion` range accept `target_version`?
    Purely local (manifests are on disk) — the preflight gate for a Core update (spec §8.1), so an
    operator sees what a Core bump would strand BEFORE the host script touches anything."""
    from .. import plugin_loader
    return [{"id": pid, "requires": mf.coreVersion,
             "compatible": plugin_loader._satisfies(target_version, mf.coreVersion)}
            for pid, mf in sorted(_installed_manifests().items())]
