from starlette.testclient import TestClient

from app.core.composition import build_container, teardown_container
from app.core.contracts import POSTGRES_CONNECTION
from app.core.db import SessionLocal
from app.core.container import Container


def test_build_container_binds_postgres_connection():
    container, bus, result = build_container({"postgres"}, SessionLocal)
    assert isinstance(container, Container)
    conn = container.resolve(POSTGRES_CONNECTION)
    assert conn is not None and conn.get("session_factory") is not None
    assert not result.degraded            # postgres.register() must not raise


def test_build_container_empty_enabled_binds_nothing():
    container, bus, result = build_container(set(), SessionLocal)
    assert container.resolve(POSTGRES_CONNECTION) is None   # kernel mode: nothing bound
    assert result.booted == []


def test_teardown_container_runs_clean():
    container, bus, _ = build_container({"postgres"}, SessionLocal)
    errors = teardown_container(container, bus, {"postgres"}, SessionLocal)
    assert errors == {}                   # postgres has no shutdown() → no errors


def test_lifespan_populates_app_state(monkeypatch):
    import app.main as main
    # enable the postgres tool for this run so the container binds its connection
    monkeypatch.setattr(main.modules, "enabled_optional_modules", lambda: {"postgres"})
    with TestClient(main.app) as client:            # entering runs the lifespan startup
        assert client.get("/").status_code == 200
        assert main.app.state.container.resolve(POSTGRES_CONNECTION)["session_factory"] is not None
