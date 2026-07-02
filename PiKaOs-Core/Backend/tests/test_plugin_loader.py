"""app/plugin_loader.py — manifest display fields (description/icon/screenshots) used by the
Plugins UI (install-from-git design §2.1).

    docker compose exec backend pytest tests/test_plugin_loader.py
"""
from __future__ import annotations

from app import plugin_loader


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
