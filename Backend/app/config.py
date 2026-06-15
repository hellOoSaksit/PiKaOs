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

    # --- UAT vs Production sitemap comparison ---
    # Per-request HTTP timeout when probing URLs. Kept modest so a few slow/dead
    # hosts can't push total runtime past the dev-proxy timeout (Frontend/vite.config.js).
    compare_timeout_seconds: float = 10.0
    # By default the WHOLE sitemap is probed in parallel (all elements at once).
    # This is the hard safety ceiling on simultaneous URL probes; a request may ask
    # for fewer via `concurrency`, but never more than this.
    compare_max_concurrency: int = 200
    compare_max_urls: int = 2000            # safety cap on URLs pulled from a sitemap
    # --- deep mode (fetch full HTML + compare body/title/meta/images/links) ---
    compare_deep_limit: int = 100           # default # of pages to deep-compare
    compare_deep_max_limit: int = 500       # hard ceiling on deep pages
    compare_deep_concurrency: int = 8       # pages deep-compared in parallel (each = many sub-requests)
    compare_deep_img_cap: int = 15          # max images probed per page
    compare_deep_link_cap: int = 20         # max internal links probed per page
    compare_body_sim_threshold: float = 0.98  # below this = body content differs
    compare_deep_text_chars: int = 2000     # body text returned per side for the client-side diff
    # --- proxy render (show pages that block iframe embedding via same-origin srcdoc) ---
    compare_render_max_chars: int = 1_500_000  # cap on proxied HTML returned to the client

    # --- SSRF guard (compare/audit fetch user-supplied URLs — the only outbound path) ---
    # Reject URLs that resolve to private/loopback/link-local/reserved IPs. Keep ON in
    # any shared/prod environment; turn off only for a trusted internal-only deployment.
    compare_ssrf_block_private: bool = True
    # Optional comma-separated host allowlist (exact host or ".suffix" match). Empty = any
    # public host. Set this to lock compare to known domains.
    compare_url_allowlist: str = ""

    # --- CORS (frontend dev origin) ---
    cors_origins: str = "http://localhost:5173"

    # default password for seeded users (dev only)
    seed_password: str = "pikaos123"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def compare_allowlist(self) -> list[str]:
        return [h.strip().lower() for h in self.compare_url_allowlist.split(",") if h.strip()]


settings = Settings()
