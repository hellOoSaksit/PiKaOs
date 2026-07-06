"""app/plugin_loader.py — manifest display fields (description/icon/screenshots) used by the
Plugins UI (install-from-git design §2.1).

    docker compose exec backend pytest tests/test_plugin_loader.py
"""
from __future__ import annotations

from app import modules, plugin_loader


def test_display_fields_default_to_empty():
    mf = plugin_loader._validate("crm", {
        "id": "crm", "name": "CRM", "version": "0.1.0", "coreVersion": "*",
    })
    assert mf.description == ""
    assert mf.icon is None
    assert mf.screenshots == ()


def test_display_fields_are_parsed():
    mf = plugin_loader._validate("crm", {
        "id": "crm", "name": "CRM", "version": "0.1.0", "coreVersion": "*",
        "description": "Customer relationship tracking.",
        "icon": "assets/icon.png",
        "screenshots": ["assets/list.png", "assets/detail.png"],
    })
    assert mf.description == "Customer relationship tracking."
    assert mf.icon == "assets/icon.png"
    assert mf.screenshots == ("assets/list.png", "assets/detail.png")


def test_norm_perm_carries_rationale_from_an_object():
    from app.plugin_loader import _norm_perm
    p = _norm_perm({"key": "crm.export", "name_en": "Export", "rationale": "Download customer records"})
    assert p["key"] == "crm.export"
    assert p["rationale"] == "Download customer records"


def test_norm_perm_defaults_rationale_to_empty_for_a_bare_string():
    from app.plugin_loader import _norm_perm
    assert _norm_perm("crm.view")["rationale"] == ""


def test_deregister_discovered_removes_it(monkeypatch):
    mf = plugin_loader._validate("crm", {
        "id": "crm", "name": "CRM", "version": "0.1.0", "coreVersion": "*",
    })
    seeded_manifests = {"crm": mf}
    seeded_names = ("crm",)
    for target in (plugin_loader, modules):
        monkeypatch.setattr(target, "PLUGIN_MANIFESTS", seeded_manifests)
        monkeypatch.setattr(target, "OPTIONAL_MODULE_NAMES", seeded_names)

    plugin_loader.deregister_discovered("crm")

    assert "crm" not in plugin_loader.PLUGIN_MANIFESTS
    assert "crm" not in plugin_loader.OPTIONAL_MODULE_NAMES
    # the re-export in `modules` must reflect the same removal, not a stale import-time snapshot
    assert "crm" not in modules.PLUGIN_MANIFESTS
    assert "crm" not in modules.OPTIONAL_MODULE_NAMES


# --- topo_order tolerates a stale `ids` set (task-9-review Finding 1) --------------------------------
#
# `main.py:lifespan` snapshots `enabled = modules.enabled_optional_modules()` ONCE at boot and reuses that
# same local variable at shutdown. A plugin can be Purged mid-process (Purge calls `deregister_discovered`,
# mutating `PLUGIN_MANIFESTS`) — so by teardown time the purged id can still be in the stale `enabled` set
# but is gone from `manifests`. Before the fix, `topo_order`'s `manifests[pid]` lookup raised `KeyError`
# while constructing `reversed(topo_order(...))` — BEFORE `shutdown_plugins`'s per-plugin try/except got any
# chance to run — aborting the whole loop and silently skipping every OTHER still-enabled plugin's
# shutdown() too, not just the purged one's.

def test_topo_order_skips_an_id_no_longer_in_manifests():
    """Direct repro of the crash site: `ids` (mirrors a stale `enabled` set) still names a plugin that
    `manifests` (mirrors the current, live `PLUGIN_MANIFESTS` after a purge) no longer has. Must not raise
    `KeyError`, and must still order every id that IS still live."""
    crm = plugin_loader.Manifest(id="crm", name="CRM", version="1.0.0", coreVersion="*")
    sample = plugin_loader.Manifest(id="sample", name="Sample", version="1.0.0", coreVersion="*")
    stale_enabled = {"crm", "sample"}          # captured before "crm" was purged
    live_manifests = {"sample": sample}        # "crm" deregistered (deregister_discovered) since then

    order = plugin_loader.topo_order(stale_enabled, live_manifests)

    assert order == ["sample"]                 # "crm" silently skipped, not KeyError'd


def test_topo_order_still_orders_dependencies_among_live_ids():
    """Regression guard: the live-filtering must not disturb normal dependency ordering — a dependency
    that IS still in `manifests` is still ordered before its dependent."""
    base = plugin_loader.Manifest(id="base", name="Base", version="1.0.0", coreVersion="*")
    dependent = plugin_loader.Manifest(
        id="dependent", name="Dependent", version="1.0.0", coreVersion="*", dependencies=("base",))
    manifests = {"base": base, "dependent": dependent}

    order = plugin_loader.topo_order({"dependent", "base"}, manifests)

    assert order == ["base", "dependent"]


def test_shutdown_plugins_survives_a_stale_enabled_id_purged_mid_process(monkeypatch):
    """End-to-end repro of Finding 1 at the `shutdown_plugins` level (the actual function `main.py`'s
    teardown calls): a stale `enabled` set still names a purged plugin ("crm", deregistered from
    `manifests`) alongside a still-live one ("sample"). Must complete without raising AND must still run
    "sample"'s shutdown() — the bug wasn't just "crashes for the purged plugin", it was "aborts the loop
    before ANY other plugin's shutdown() runs"."""
    import sys
    from types import ModuleType

    sample_calls = []
    sample_mod = ModuleType("app.plugins.sample")
    sample_mod.shutdown = lambda ctx: sample_calls.append(ctx)
    monkeypatch.setitem(sys.modules, "app.plugins.sample", sample_mod)

    sample_mf = plugin_loader.Manifest(id="sample", name="Sample", version="1.0.0", coreVersion="*")
    stale_enabled = {"crm", "sample"}                  # captured before "crm" was purged
    live_manifests = {"sample": sample_mf}             # "crm" deregistered since then

    ctx = plugin_loader.PluginContext(container=object(), events=object())
    errors = plugin_loader.shutdown_plugins(stale_enabled, live_manifests, ctx)

    assert errors == {}                                # no crash, no spurious error for "crm"
    assert len(sample_calls) == 1                       # "sample"'s shutdown() still ran


def test_discover_quarantines_bad_plugins_instead_of_raising(monkeypatch, tmp_path):
    """K1: a malformed / coreVersion-incompatible / broken-dependency plugin is QUARANTINED (recorded with
    a reason, skipped) rather than aborting discovery. discover() runs at import, so a raise would brick
    the whole API + the plugins UI that fixes it. A valid plugin alongside the bad ones still loads."""
    import json

    plugins = tmp_path / "plugins"
    plugins.mkdir()

    def write(folder: str, manifest: dict | None = None, *, raw_text: str | None = None) -> None:
        d = plugins / folder
        d.mkdir()
        (d / "manifest.json").write_text(raw_text if raw_text is not None else json.dumps(manifest))

    write("good", {"id": "good", "name": "Good", "version": "0.1.0", "coreVersion": "*"})
    write("oldcore", {"id": "oldcore", "name": "Old", "version": "0.1.0", "coreVersion": "^99.0.0"})
    write("brokenjson", raw_text="{ not valid json ")
    write("needsbad", {"id": "needsbad", "name": "NeedsBad", "version": "0.1.0",
                       "coreVersion": "*", "dependencies": ["oldcore"]})

    monkeypatch.setattr(plugin_loader, "PLUGINS_DIR", plugins)
    try:
        found = plugin_loader.discover()

        assert set(found) == {"good"}                                    # the valid plugin still loads
        assert set(plugin_loader.QUARANTINED) == {"oldcore", "brokenjson", "needsbad"}
        assert "coreVersion" in plugin_loader.QUARANTINED["oldcore"]
        assert "valid JSON" in plugin_loader.QUARANTINED["brokenjson"]
        assert "quarantined" in plugin_loader.QUARANTINED["needsbad"]     # cascades from oldcore
    finally:
        plugin_loader.QUARANTINED.clear()                                # don't leak into other tests


def test_plugin_states_surfaces_quarantined_with_reason(monkeypatch):
    """/health lists a quarantined plugin (not in PLUGIN_MANIFESTS) with its reason so an operator can see
    and fix it without shelling into the volume (K1)."""
    monkeypatch.setattr(plugin_loader, "QUARANTINED", {"oldcore": "coreVersion '^99.0.0' excludes Core"})
    monkeypatch.setattr(modules, "PLUGIN_MANIFESTS", {})
    states = modules.plugin_states()
    q = [s for s in states if s["id"] == "oldcore"]
    assert q and q[0]["state"] == "quarantined"
    assert "coreVersion" in q[0]["reason"]
