"""Application settings, loaded from environment (12-factor)."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # --- core ---
    app_name: str = "PiKaOs API"
    environment: str = "development"

    # --- database (async SQLAlchemy / asyncpg) ---
    database_url: str = "postgresql+asyncpg://pikaos:pikaos@db:5432/pikaos"

    # --- redis ---
    redis_url: str = "redis://redis:6379/0"

    # --- auth ---
    jwt_secret: str = "change-me-in-.env"
    jwt_alg: str = "HS256"
    access_ttl_seconds: int = 60 * 15          # 15 minutes
    refresh_ttl_seconds: int = 60 * 60 * 24 * 7  # 7 days
    refresh_cookie_name: str = "pikaos_refresh"
    cookie_secure: bool = False  # True behind HTTPS in production

    # --- MinIO / S3 ---
    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "pikaos"
    minio_secret_key: str = "pikaos-secret"
    minio_secure: bool = False
    minio_bucket: str = "pikaos"

    # --- CORS (frontend dev origin) ---
    cors_origins: str = "http://localhost:5173"

    # default password for seeded users (dev only)
    seed_password: str = "pikaos123"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
