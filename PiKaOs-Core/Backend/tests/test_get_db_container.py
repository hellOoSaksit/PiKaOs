"""get_db is now a sqlalchemy-free seam: it resolves postgres.Connection off the app container and yields
a session from its factory, or raises if the postgres tool is unbound. (No more SessionLocal fallback —
the zero-datastore kernel owns no engine.)"""
import asyncio
from types import SimpleNamespace

import pytest

from app.core import db as dbmod
from app.core.container import Container
from app.core.contracts import POSTGRES_CONNECTION


def _fake_request(container):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(container=container)))


class _FakeSession:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


def test_yields_session_from_bound_factory():
    sentinel = _FakeSession()
    c = Container()
    c.bind(POSTGRES_CONNECTION, {"engine": object(), "session_factory": lambda: sentinel})

    async def _drive():
        gen = dbmod.get_db(_fake_request(c))
        session = await gen.__anext__()
        assert session is sentinel
        await gen.aclose()

    asyncio.run(_drive())


def test_raises_when_unbound():
    async def _drive():
        gen = dbmod.get_db(_fake_request(Container()))
        with pytest.raises(RuntimeError):
            await gen.__anext__()

    asyncio.run(_drive())
