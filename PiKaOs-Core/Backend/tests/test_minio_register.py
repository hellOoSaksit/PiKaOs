from app.core.container import Container
from app.core.contracts import STORAGE


def test_register_binds_storage_contract():
    import app.plugins.minio as m
    c = Container()

    class Ctx:
        container = c
        events = None
        session_factory = None
        settings = None
        config = {}

    m.register(Ctx)
    facade = c.resolve(STORAGE)
    assert facade is not None
    for fn in ("status", "ensure_bucket", "put_object", "get_object",
               "presigned_get", "remove_object", "ping"):
        assert callable(getattr(facade, fn))


def test_discovered_as_tool():
    from app.plugin_loader import discover
    m = discover()
    assert m["minio"].kind == "tool"
    assert "minio.Storage" in m["minio"].provides
