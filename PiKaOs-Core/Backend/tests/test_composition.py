"""Composition-root tests (composition.py) — the shared step that builds the plugin DI tier for a
process. Exercised plugin-free with the synthetic `sampletool` tool (conftest): a tool's register()
binds its Connection contract into the container, an empty enabled-set binds nothing, teardown is clean,
and the app lifespan populates `app.state.container`. Postgres proves its OWN binding in its repo
(test_postgres_register)."""
from starlette.testclient import TestClient

from app.core.composition import build_container, teardown_container
from app.core.container import Container


def test_build_container_binds_tool_connection(sample_plugins):
    # a kind:tool plugin CREATES its resource in register() and binds it under its contract.
    container, bus, result = build_container({"sampletool"})
    assert isinstance(container, Container)
    conn = container.resolve(sample_plugins.tool_contract)
    assert conn is not None and conn.get("session_factory") is not None
    assert not result.degraded            # register() must not raise


def test_build_container_empty_enabled_binds_nothing(sample_plugins):
    container, bus, result = build_container(set())
    assert container.resolve(sample_plugins.tool_contract) is None   # kernel mode: nothing bound
    assert result.booted == []


def test_teardown_container_runs_clean(sample_plugins):
    container, bus, _ = build_container({"sampletool"})
    errors = teardown_container(container, bus, {"sampletool"})
    assert errors == {}                   # the tool has no shutdown() → no errors


def test_lifespan_populates_app_state(sample_plugins, monkeypatch):
    import app.main as main
    # enable the synthetic tool for this run so the container binds its connection
    monkeypatch.setattr(main.modules, "enabled_optional_modules", lambda: {"sampletool"})
    with TestClient(main.app) as client:            # entering runs the lifespan startup
        assert client.get("/").status_code == 200
        assert main.app.state.container.resolve(sample_plugins.tool_contract)["session_factory"] is not None
