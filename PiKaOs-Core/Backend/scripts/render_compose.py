"""Compose render CLI — the local-dev analog of render_requirements.py, for docker-compose
(kernel-redesign.md §3, "install engine = HYBRID").

Local dev runs this on the HOST, before any container exists, so unlike the in-container install flow
(`app/core/compose_render.py`, used when an admin toggles a plugin through the running Modules UI —
that code reads the live plugin registry, which lives in the `kernelstate` Docker volume and is not
reachable from the host), this script falls back to the SAME default the entrypoint itself uses when no
registry has been written yet: `ENABLED_MODULES` in Backend/.env ("" / "*" / a comma list — mirrors
`app/plugin_loader.enabled_optional_modules()`).

Determines which linked `kind: tool` plugins are enabled, then lets `docker compose config` do the
actual merge (real multi -f deep-merge — understands `!override`, env interpolation, etc.) instead of
reimplementing YAML merge semantics here. Pure stdlib on the Python side: no PyYAML/pydantic needed on
the host, same "any python3 runs it" goal as render_requirements.py. Needs `docker` on PATH (already a
hard requirement for this whole project).

    python scripts/render_compose.py            # → writes ../deploy/docker-compose.generated.yml
    python scripts/render_compose.py --prod     # → writes ../deploy/docker-compose.generated.prod.yml

--prod swaps the kernel base for docker-compose.prod.yml (immutable image, multi-worker uvicorn, nginx
frontend, loopback ports) and writes a separate generated file. Tool-fragment discovery + the
`docker compose config` merge are identical to dev — only the base and output path change.
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
CORE = BACKEND.parent
PLUGINS_DIR = BACKEND / "app" / "plugins"
DEPLOY = CORE / "deploy"
BASE_COMPOSE = DEPLOY / "docker-compose.dev.yml"
PROD_COMPOSE = DEPLOY / "docker-compose.prod.yml"
OUT_COMPOSE = DEPLOY / "docker-compose.generated.yml"
OUT_COMPOSE_PROD = DEPLOY / "docker-compose.generated.prod.yml"

_ENABLED_MODULES_RE = re.compile(r"^ENABLED_MODULES=(.*)$")


def _discovered_manifests() -> dict[str, dict]:
    """{plugin_id: manifest_dict} for every `app/plugins/<id>/manifest.json` (symlinked plugin repos,
    dropped by link-plugins.sh). Plain `json.load` — no schema validation, this only ever reads
    `kind`/`compose`; the running app is the real validator."""
    found: dict[str, dict] = {}
    if not PLUGINS_DIR.is_dir():
        return found
    for child in sorted(PLUGINS_DIR.iterdir()):
        manifest_path = child / "manifest.json"
        if manifest_path.is_file():
            found[child.name] = json.loads(manifest_path.read_text(encoding="utf-8"))
    return found


def _enabled_modules_raw() -> str:
    """`ENABLED_MODULES` from Backend/.env, falling back to .env.example so a fresh checkout (no real
    .env copied yet) still renders something sensible."""
    for name in (".env", ".env.example"):
        path = BACKEND / name
        if not path.is_file():
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            m = _ENABLED_MODULES_RE.match(line.strip())
            if m:
                return m.group(1).strip()
    return ""


def _resolve_enabled(raw: str, discovered: set[str]) -> set[str]:
    """Mirrors `app.plugin_loader.enabled_optional_modules()`: "" = none, "*" = every discovered
    plugin, else a comma list intersected with what's discovered (an unknown name is ignored, never
    fatal)."""
    if raw == "*":
        return set(discovered)
    if raw == "":
        return set()
    return {p.strip() for p in raw.split(",") if p.strip()} & discovered


def _tool_fragments(enabled: set[str], manifests: dict[str, dict]) -> list[Path]:
    """The compose-fragment path of every enabled `kind: tool` plugin that declares one, sorted for a
    deterministic, reproducible merge order."""
    frags = []
    for pid in sorted(enabled):
        m = manifests[pid]
        if m.get("kind") == "tool" and m.get("compose"):
            frags.append(PLUGINS_DIR / pid / m["compose"])
    return frags


def main() -> None:
    parser = argparse.ArgumentParser(description="Render the merged docker-compose file for PiKaOs.")
    parser.add_argument(
        "--prod",
        action="store_true",
        help="Render the production base (docker-compose.prod.yml) → docker-compose.generated.prod.yml.",
    )
    args = parser.parse_args()
    base = PROD_COMPOSE if args.prod else BASE_COMPOSE
    out = OUT_COMPOSE_PROD if args.prod else OUT_COMPOSE

    manifests = _discovered_manifests()
    enabled = _resolve_enabled(_enabled_modules_raw(), set(manifests))
    fragments = _tool_fragments(enabled, manifests)

    missing = [str(p) for p in fragments if not p.is_file()]
    if missing:
        sys.exit(f"[render_compose] fragment file(s) missing: {', '.join(missing)}")

    files = [base, *fragments]
    cmd = ["docker", "compose"] + [arg for f in files for arg in ("-f", str(f))] + ["config"]
    result = subprocess.run(cmd, cwd=DEPLOY, capture_output=True, text=True)
    if result.returncode != 0:
        sys.exit(f"[render_compose] docker compose config failed:\n{result.stderr}")

    # `docker compose config` inlines every env_file value as a literal `environment:` entry, so the
    # output contains RESOLVED secrets (JWT_SECRET, DB/MinIO creds, …). It is gitignored — the header
    # warns a human not to paste it into an issue/chat.
    out.write_text(
        f"# GENERATED by Backend/scripts/render_compose.py{' --prod' if args.prod else ''} — DO NOT EDIT BY HAND.\n"
        f"# Edit deploy/{base.name} (kernel base) or a plugin's compose.fragment.yml instead, then\n"
        "# re-run this script (start.bat does it automatically).\n"
        "# ⚠ SECRETS INSIDE: resolved env values are inlined here — never share/paste this file.\n"
        + result.stdout,
        encoding="utf-8",
    )
    tool_ids = sorted(p.parent.name for p in fragments)
    mode = "prod" if args.prod else "dev"
    print(f"[render_compose:{mode}] enabled tools: {', '.join(tool_ids) or '(none)'} -> {out}")


if __name__ == "__main__":
    main()
