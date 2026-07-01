"""Compose render — merge enabled tool plugins' compose fragments into one compose document.

The sidecar half of the hybrid install engine (kernel-redesign §3): each enabled `kind: tool` plugin
ships a `compose` fragment; installing/enabling it means its services + volumes appear in the generated
compose. This module is a PURE transform (dict in, dict out) — writing the file and restarting the stack
are separate, later steps. Keeping it pure makes the merge fully unit-testable without Docker.
"""
from __future__ import annotations

import copy
from pathlib import Path

import yaml

from ..plugin_loader import PLUGINS_DIR, Manifest


def merge_fragments(base: dict, fragments: list[dict]) -> dict:
    """Deep-ish merge: union `services` and `volumes` (fragment keys win on collision). Never mutate
    inputs — return a fresh dict."""
    out = copy.deepcopy(base)
    for frag in fragments:
        for section in ("services", "volumes", "networks"):
            if section in frag:
                out.setdefault(section, {}).update(frag[section] or {})
    return out


def load_tool_fragments(enabled: set[str], manifests: dict[str, Manifest]) -> list[dict]:
    """Read the compose fragment of every enabled `kind: tool` plugin that declares one."""
    frags: list[dict] = []
    for pid in sorted(enabled):
        m = manifests.get(pid)
        if not m or m.kind != "tool" or not m.compose:
            continue
        path = PLUGINS_DIR / pid / m.compose.lstrip("./")
        if path.is_file():
            frags.append(yaml.safe_load(path.read_text(encoding="utf-8")) or {})
    return frags


def render_compose(base: dict, enabled: set[str], manifests: dict[str, Manifest]) -> dict:
    """Base compose + all enabled tools' fragments."""
    return merge_fragments(base, load_tool_fragments(enabled, manifests))
