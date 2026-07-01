from types import SimpleNamespace
from app.core import db as dbmod
from app.core.container import Container
from app.core.contracts import POSTGRES_CONNECTION


def _fake_request(container):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(container=container)))


def test_uses_bound_factory():
    sentinel = object()
    c = Container()
    c.bind(POSTGRES_CONNECTION, {"engine": object(), "session_factory": sentinel})
    assert dbmod._session_factory_from(_fake_request(c)) is sentinel


def test_falls_back_when_unbound():
    assert dbmod._session_factory_from(_fake_request(Container())) is dbmod.SessionLocal


def test_falls_back_when_no_container():
    # request.app.state has no `container` attribute → AttributeError → fallback
    req = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    assert dbmod._session_factory_from(req) is dbmod.SessionLocal
