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


def _defaults() -> Settings:
    """Settings as a **fresh install** would build them — the code defaults, nothing ambient.

    Every other test here passes explicit kwargs, so it can't see the environment. A test that asserts a
    *default* is the one case that can, and `_env_file=None` alone is not enough: it stops `.env` being
    read but pydantic-settings still layers OS environment variables on top. That matters because CI runs
    pytest **inside the dev container**, whose compose deliberately sets BIND_HOST=0.0.0.0,
    ALLOW_OPEN_LAN=1 and SEED_DEV_USERS=1 — so an un-isolated assert here checks the dev stack's config
    and calls it "the default". Callers `monkeypatch.delenv` the vars they assert on.
    """
    return Settings(_env_file=None)


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


# --- G2: open auth mode must not be reachable on a non-loopback interface (roadmap-v3 T1) ---
# In open mode an anonymous caller is owner-admin and can POST /api/plugins/install directly, so a
# public bind is the real RCE surface. The guard refuses that combo unless the operator acknowledges it.

def test_open_mode_on_public_bind_is_flagged():
    s = Settings(bind_host="0.0.0.0", allow_open_lan=False)
    assert s.open_mode_lan_violation("open") is not None


def test_open_mode_on_loopback_is_safe():
    # the desktop / a direct local run binds loopback — open mode there exposes nothing to the LAN
    assert Settings(bind_host="127.0.0.1").open_mode_lan_violation("open") is None
    assert Settings(bind_host="localhost").open_mode_lan_violation("open") is None
    assert Settings(bind_host="::1").open_mode_lan_violation("open") is None


def test_login_mode_on_public_bind_is_safe():
    # a normal (auth-required) deployment binding all interfaces is fine — credentials still gate it
    assert Settings(bind_host="0.0.0.0").open_mode_lan_violation("login") is None


def test_public_bind_acknowledged_is_allowed():
    # explicit opt-in (e.g. a dev box or an intentional LAN kiosk) suppresses the guard
    assert Settings(bind_host="0.0.0.0", allow_open_lan=True).open_mode_lan_violation("open") is None


def test_bind_host_defaults_to_loopback(monkeypatch):
    # safe-by-default: a bare run / naive deploy binds loopback until the operator opts into LAN
    for var in ("BIND_HOST", "ALLOW_OPEN_LAN"):
        monkeypatch.delenv(var, raising=False)
    s = _defaults()
    assert s.bind_host == "127.0.0.1"
    assert s.allow_open_lan is False


def test_seed_dev_users_defaults_off(monkeypatch):
    """Fresh installs must never ship the shared dev credential; dev stacks opt in via SEED_DEV_USERS."""
    monkeypatch.delenv("SEED_DEV_USERS", raising=False)
    assert _defaults().seed_dev_users is False
