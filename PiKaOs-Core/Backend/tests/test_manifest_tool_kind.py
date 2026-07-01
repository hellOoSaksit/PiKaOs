import pytest
from app.plugin_loader import _validate, ManifestError

BASE = {"id": "postgres", "name": "Postgres", "version": "0.1.0", "coreVersion": "^0.1.0"}


def test_kind_defaults_to_capability():
    # id must equal the folder name (Loader §6), so use a folder-matching id with no `kind` field
    m = _validate("knowledge", {**BASE, "id": "knowledge"})
    assert m.kind == "capability"


def test_tool_manifest_parses_new_fields():
    raw = {**BASE, "kind": "tool", "provides": ["postgres.Connection"],
           "secrets": ["database_url"], "compose": "compose.fragment.yml"}
    m = _validate("postgres", raw)
    assert m.kind == "tool"
    assert m.provides == ("postgres.Connection",)
    assert m.secrets == ("database_url",)
    assert m.compose == "compose.fragment.yml"


def test_invalid_kind_rejected():
    with pytest.raises(ManifestError):
        _validate("postgres", {**BASE, "kind": "gadget"})
