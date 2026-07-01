import asyncio
from types import SimpleNamespace
from app.core.routers import storage as storage_router
from app.core.contracts import STORAGE
from app.core.container import Container


def _req(container):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(container=container)))


class _StubStorage:
    def status(self):
        return {"provider": "minio", "endpoint": "minio:9000", "bucket": "pikaos",
                "secure": False, "region": None, "reachable": True}


def test_status_uses_bound_facade():
    c = Container()
    c.bind(STORAGE, _StubStorage())
    out = asyncio.run(storage_router._status(_req(c)))
    assert out.provider == "minio" and out.reachable is True


def test_status_reports_none_when_unbound():
    out = asyncio.run(storage_router._status(_req(Container())))
    assert out.provider == "none" and out.reachable is False


def test_storage_helper_never_raises_without_container():
    req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))  # no .container
    assert storage_router._storage(req) is None
