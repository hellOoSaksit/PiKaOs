import pytest
from app.core import db_dsn

BUNDLED = "postgresql+asyncpg://pikaos:pikaos@db:5432/pikaos"

def test_bundled_returns_the_default_dsn():
    assert db_dsn.build("bundled", {}) == BUNDLED

def test_pg_fields_assemble_into_an_asyncpg_dsn():
    got = db_dsn.build("pg", {"host": "h", "port": 5432, "user": "u", "password": "p", "dbname": "d"})
    assert got == "postgresql+asyncpg://u:p@h:5432/d"

def test_supabase_connection_string_is_coerced_to_asyncpg():
    got = db_dsn.build("supabase", {"connectionString": "postgresql://u:p@db.abc.supabase.co:5432/postgres"})
    assert got.startswith("postgresql+asyncpg://")

def test_transaction_pooler_is_rejected():
    with pytest.raises(db_dsn.DbDsnError):
        db_dsn.reject_pooler("postgresql+asyncpg://u:p@aws-0-x.pooler.supabase.com:6543/postgres")

def test_direct_connection_passes_the_pooler_guard():
    db_dsn.reject_pooler("postgresql+asyncpg://u:p@db.abc.supabase.co:5432/postgres")   # no raise
