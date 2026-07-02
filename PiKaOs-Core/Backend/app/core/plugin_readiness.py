"""Pre-build readiness gate (install-from-git design §2.3) — run before ANY plugin, git-installed or
dev-symlinked alike, is registered+enabled. PiKaOs doesn't vet third-party plugin code, so this is
intentionally static: dependency resolution and — for a `kind:tool` plugin — that its compose
fragment merges cleanly. Manifest schema + coreVersion are already enforced by `plugin_loader._validate`
before a Manifest object can exist at all, so this check assumes that already passed. Nothing of the
plugin's own code runs here."""
from __future__ import annotations

from dataclasses import dataclass

from . import compose_render
from . import plugin_registry as registry


@dataclass(frozen=True)
class ReadinessResult:
    passed: bool
    reasons: tuple[str, ...] = ()


def check(pid: str, manifest, all_manifests: dict) -> ReadinessResult:
    """Readiness for `pid`, given `manifest` and the full candidate manifest set (including `pid`)."""
    reasons: list[str] = []

    for dep in manifest.dependencies:
        if dep not in all_manifests:
            reasons.append(f"dependency '{dep}' is not resolvable")

    if manifest.kind == "tool" and manifest.compose:
        reg = registry.read()
        installed = {p for p in reg if registry.state_of(reg, p) != registry.AVAILABLE}
        try:
            compose_render.render_compose({"services": {}}, installed | {pid}, all_manifests)
        except Exception as exc:  # a broken fragment must never crash the readiness check itself
            reasons.append(f"compose fragment failed to merge: {exc}")

    return ReadinessResult(passed=not reasons, reasons=tuple(reasons))
