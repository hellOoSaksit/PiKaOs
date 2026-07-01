from app.core.container import Container
from app.core.contracts import POSTGRES_CONNECTION


def test_register_binds_connection_contract():
    import app.plugins.postgres as tp  # symlinked plugin backend
    c = Container()

    class Ctx:  # minimal PluginContext stand-in
        container = c
        events = None
        session_factory = None
        settings = None
        config = {}

    tp.register(Ctx)
    conn = c.resolve(POSTGRES_CONNECTION)
    assert conn["session_factory"] is not None
    assert conn["engine"] is not None


def test_discovered_as_tool():
    from app.plugin_loader import discover
    m = discover()
    assert m["postgres"].kind == "tool"
    assert "postgres.Connection" in m["postgres"].provides
