"""Application settings, loaded from environment (12-factor)."""
from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict

# Known insecure dev defaults that must never reach production (checked at boot — A4).
_DEV_JWT_SECRETS = {"change-me-in-.env", "dev-secret-change-me"}
_DEV_SEED_PASSWORDS = {"pikaos123"}
_DEV_MINIO_SECRETS = {"pikaos-secret"}


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
    perms_cache_ttl_seconds: int = 60  # effective-perms cache (perms:<user_id>) freshness

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
    # Polite default # of URLs probed in parallel when a request doesn't specify
    # `concurrency`. Kept modest so a real WAF/CDN-fronted site (Cloudflare etc.)
    # doesn't rate-limit/drop our burst → false "unreachable"/404 noise. A request
    # may ask for more via `concurrency`, but never above compare_max_concurrency.
    compare_default_concurrency: int = 8
    # Hard safety ceiling on simultaneous URL probes — a request can't exceed this.
    compare_max_concurrency: int = 200
    compare_max_urls: int = 2000            # safety cap on URLs pulled from a sitemap
    # Transient-failure retries per probe (connect/read errors only — a WAF drops a
    # few under load even at modest concurrency); 0 disables. Linear backoff.
    compare_probe_retries: int = 1
    compare_probe_backoff_seconds: float = 0.4
    # --- deep mode (fetch full HTML + compare body/title/meta/images/links) ---
    compare_deep_limit: int = 5             # default # of pages to deep-compare (deep is heavy + slow on
                                            # WAF/CDN sites; start small, the user can raise it per run)
    compare_deep_max_limit: int = 500       # hard ceiling on deep pages
    compare_deep_concurrency: int = 8       # pages deep-compared in parallel (each = many sub-requests)
    compare_deep_img_cap: int = 15          # max images probed per page
    compare_deep_link_cap: int = 20         # max internal links probed per page
    compare_body_sim_threshold: float = 0.98  # below this = body content differs
    compare_deep_text_chars: int = 2000     # body text returned per side for the client-side diff
    compare_deep_max_blocks: int = 150      # content blocks returned per side for the block-by-block diff

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

    @property
    def is_production(self) -> bool:
        return self.environment.strip().lower() in ("production", "prod")

    def production_violations(self) -> list[str]:
        """Insecure settings that must be fixed before running in production.

        Empty list = safe. Enforced at startup (main.lifespan) so a misconfigured
        prod deploy fails fast and loudly instead of running with dev secrets (A4).
        """
        problems: list[str] = []
        if self.jwt_secret in _DEV_JWT_SECRETS or len(self.jwt_secret) < 32:
            problems.append("JWT_SECRET is a dev default / too short — need a strong unique secret of >=32 chars (PyJWT 2.13 warns on shorter HMAC keys for SHA256)")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true behind HTTPS in production")
        if self.seed_password in _DEV_SEED_PASSWORDS:
            problems.append("SEED_PASSWORD is the dev default — change it")
        if self.minio_secret_key in _DEV_MINIO_SECRETS:
            problems.append("MINIO_SECRET_KEY is the dev default — change it")
        return problems


settings = Settings()
