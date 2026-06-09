"""App configuration loaded from environment (.env)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Postgres connection (sync driver — psycopg3)
    database_url: str = "postgresql+psycopg://pikaos:pikaos@localhost:5433/pikaos"

    # Crawl behaviour
    crawl_timeout: float = 12.0
    crawl_user_agent: str = "PiKaOs-SitemapBot/0.1 (+https://pikaos.local)"
    crawl_max_terms: int = 600  # cap candidate page-terms extracted per scan

    # Headless fallback: render with Chromium when the static lxml pass is thin
    crawl_render_enabled: bool = True
    crawl_min_terms: int = 8       # below this, trigger the headless fallback
    crawl_render_timeout: float = 20.0

    # Matching
    default_pass_threshold: int = 70  # confidence >= => "complete"
    unclear_band: int = 18            # [pass-band, pass) => "unclear"

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
