"""Tests for boot-time production safety checks (A4).

Pure — constructs Settings directly with explicit values (kwargs override env/.env),
no server or network.

    docker compose exec backend pytest tests/test_config.py
"""
from __future__ import annotations

from app.core.config import Settings

_SAFE = dict(
    jwt_secret="a-strong-unique-secret-value-123456",
    cookie_secure=True,
    seed_password="another-strong-password",
    minio_secret_key="a-strong-minio-secret",
    redis_url="redis://:a-strong-redis-pw@redis:6379/0",
)


def test_dev_defaults_flagged_in_production():
    s = Settings(environment="production", jwt_secret="change-me-in-.env",
                 cookie_secure=False, seed_password="pikaos123", minio_secret_key="pikaos-secret")
    v = s.production_violations()
    assert any("JWT_SECRET" in x for x in v)
    assert any("COOKIE_SECURE" in x for x in v)
    assert any("SEED_PASSWORD" in x for x in v)
    assert any("MINIO_SECRET_KEY" in x for x in v)
    assert s.is_production


def test_short_jwt_secret_flagged():
    s = Settings(environment="production", **{**_SAFE, "jwt_secret": "short"})
    assert any("JWT_SECRET" in x for x in s.production_violations())


def test_jwt_secret_below_32_flagged():
    # PyJWT 2.13 warns on <32-byte HMAC keys for SHA256 — A4 now requires >=32 chars in prod
    s = Settings(environment="production", **{**_SAFE, "jwt_secret": "x" * 20})
    assert any("JWT_SECRET" in x for x in s.production_violations())


def test_unauthenticated_redis_flagged_in_production():
    s = Settings(environment="production", **{**_SAFE, "redis_url": "redis://redis:6379/0"})
    assert any("REDIS_URL" in x for x in s.production_violations())


def test_no_violations_when_secure():
    s = Settings(environment="production", **_SAFE)
    assert s.production_violations() == []


def test_development_is_not_production():
    s = Settings(environment="development")
    assert not s.is_production
    assert s.environment == "development"


def test_prod_alias_recognized():
    assert Settings(environment="prod").is_production
    assert Settings(environment="PRODUCTION").is_production
