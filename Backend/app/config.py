"""Application settings, loaded from environment (12-factor)."""
from __future__ import annotations

from urllib.parse import urlparse

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
    # The release version of FE+BE+migrations+flags moving as one unit (release-and-rollback.md §7).
    # Declared ONCE here (versions.md registry rule) — surfaced in /api/health, /api/version, and the
    # OpenAPI title. Bump per versions.md §… (MINOR on behaviour/schema, PATCH on fix).
    app_version: str = "0.1.0"
    # Immutable build identity (git sha / CI run). Set at image-build time via the BUILD_HASH ARG→ENV;
    # "dev" on a local checkout. Drives version-skew detection — the SPA compares its own build hash to
    # /api/version and prompts a reload on mismatch (release-and-rollback.md §4).
    build_hash: str = "dev"

    # --- modules: Base + plugins (Modular Monolith — docs/architecture/modularity.md §2.5/§3) ---
    # Which PLUGINS this build loads ON TOP OF the Base. The **Base always loads** (infra + core +
    # engine = the agent runtime); plugins (knowledge/compare/…) are opt-in so a clean/prod deploy is
    # just the Base, ready for plugins later. Values: "" / unset = Base only (DEFAULT) · "*" = all
    # plugins (full build) · comma-list = those plugins. Dev runs the full build via ENABLED_MODULES=*
    # in Backend/.env so plugin code is exercised. See app/modules.py for the registry.
    enabled_modules: str = ""

    # --- database (async SQLAlchemy / asyncpg) ---
    database_url: str = "postgresql+asyncpg://pikaos:pikaos@db:5432/pikaos"

    # --- redis ---
    redis_url: str = "redis://redis:6379/0"

    # --- auth ---
    jwt_secret: str = "change-me-in-.env"
    jwt_alg: str = "HS256"
    # Secret used to derive the at-rest encryption key (app/crypto.py — encrypts LLM API keys
    # stored in llm_connections). Falls back to jwt_secret in dev; set a strong value in prod.
    secret_key: str = ""
    access_ttl_seconds: int = 60 * 15          # 15 minutes
    refresh_ttl_seconds: int = 60 * 60 * 24 * 7  # 7 days
    refresh_cookie_name: str = "pikaos_refresh"
    cookie_secure: bool = False  # True behind HTTPS in production
    perms_cache_ttl_seconds: int = 60  # effective-perms cache (perms:<user_id>) freshness

    # --- Object storage (MinIO / S3-compatible — pluggable via env, not the UI) ---
    # The `minio` client speaks the S3 API, so the SAME code works against MinIO, AWS S3, or any
    # S3-compatible store just by changing these env vars (no code change). `storage_provider` is a
    # label surfaced read-only in the tools tab (minio | s3); switching to AWS S3 = point
    # `minio_endpoint` at `s3.<region>.amazonaws.com`, `minio_secure=true`, set `storage_region` +
    # AWS keys + bucket. These are bootstrap creds → env only (never UI-editable); see the tools-tab
    # Storage panel for status/test-connection only (read-mostly, no secret editing).
    storage_provider: str = "minio"          # minio | s3 (label; the client is S3 either way)
    storage_region: str = ""                 # AWS region for S3 (e.g. ap-southeast-1); MinIO ignores it
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

    # --- agent execution engine (B3 — services/agent_runner.run, run by the arq worker) ---
    # Hard cap on LLM+tool steps per run — a runaway agent can't loop forever / drain quota.
    run_max_steps: int = 24
    # Per-step deadlines (a hung provider/tool can't pin a worker). Enforced with
    # asyncio.wait_for; on timeout the run fails with a `*_timeout` error.
    run_llm_step_timeout_s: float = 120.0
    run_tool_step_timeout_s: float = 60.0
    # Whole-run wall-clock ceiling, checked between steps (belt-and-braces over max_steps).
    run_max_wallclock_s: float = 900.0

    # --- LLM provider (engine — C1, used by the arq worker's agent_runner) ---
    # Which LLM backend the agent loop talks to:
    #   "stub"   = deterministic, free stand-in (B4) — default, so tests/dev run without a model.
    #   "ollama" = local OpenAI-style server (free, private). OpenAI/Anthropic adapters land later.
    # Default stays "stub" → existing behaviour + tests unchanged; flip to "ollama" in .env.
    llm_provider: str = "stub"
    # Base URL of the local LLM server. From inside the backend/worker container the host's
    # Ollama is reachable at host.docker.internal (Docker Desktop on Windows/Mac; on Linux add
    # `extra_hosts: ["host.docker.internal:host-gateway"]` to the worker service).
    llm_base_url: str = "http://host.docker.internal:11434"
    # Model used when an agent doesn't pin its own (`agents.model`). Pull it first: `ollama pull llama3.1`.
    llm_default_model: str = "llama3.1"
    # Per-call HTTP timeout to the LLM server. The agent loop also caps each step via
    # run_llm_step_timeout_s — keep this ≤ that so a hung model surfaces as the step timeout.
    llm_request_timeout_s: float = 120.0
    # Cap on output tokens per LLM call. Anthropic *requires* max_tokens; OpenAI honors it too.
    llm_max_tokens: int = 4096
    # How long the worker caches the active LLM connection before re-reading the DB — so an admin's
    # change in the UI (llm_connections) takes effect within this many seconds, no restart needed.
    llm_config_cache_s: float = 15.0

    # --- embeddings (knowledge RAG — phase E/M2, docs/architecture/knowledge-rag.md §3) ---
    # Which embedder turns markdown chunks (and a search query) into vectors:
    #   "stub"   = deterministic, free, offline stand-in (default — tests/dev run without a model),
    #   "ollama" = local embedding server (`ollama pull bge-m3`), reusing the httpx path (no new dep).
    # Default "stub" keeps existing behaviour; flip to "ollama" in .env to embed for real.
    embed_provider: str = "stub"
    # Embedding model + its output dimension. **Decided once, before the first ingest** — changing
    # the dimension means re-embedding the whole corpus (knowledge-rag.md §3 / E1). bge-m3 = 1024.
    # The dimension is also baked into the doc_chunks.embedding column (migration 0005); keep them equal.
    embed_model: str = "bge-m3"
    embed_dim: int = 1024
    # Embedding server base URL (Ollama). Same host trick as llm_base_url (host.docker.internal).
    embed_base_url: str = "http://host.docker.internal:11434"
    embed_request_timeout_s: float = 60.0
    # Chunking: a markdown section longer than this many characters is split into several chunks
    # (keeping its heading) so no single embedding swallows a huge section. Tune with the model.
    embed_chunk_max_chars: int = 1500
    # Default top-k returned by /api/knowledge/search (and used for agent retrieval, E3).
    embed_search_top_k: int = 5
    # --- RAG retrieval into the agent loop (E3) ---
    # Top-k codex chunks injected as context before an agent run (scoped to the run owner's read
    # permissions — app/plugins/knowledge/retrieval_service.py). 0 = OFF (default → existing behaviour + engine
    # tests unchanged); set >0 to turn agent retrieval on. Re-derived per run/resume, no quota cost.
    engine_retrieval_top_k: int = 0

    # --- ingest enrich B: doc summary (E7, knowledge-rag.md §6.2) ---
    # Summarize the whole markdown once at ingest → stored on documents.summary + embedded as a
    # summary-chunk so high-level queries match it (the coarse "find the file fast" layer). Costs
    # one LLM call per document via the 'summarize' role (llm_connections). OFF by default so
    # ingest stays free/offline (stub) and the existing chunk-count tests are unchanged; turn on
    # once a real summarize provider is configured. The summary is derived metadata, rebuilt from
    # the markdown — a failed/absent summary never fails ingest (the chunks still embed).
    ingest_summary_enabled: bool = False
    # Only the first N characters of a long doc are summarized — bounds cost/latency of the call.
    ingest_summary_max_input_chars: int = 12000

    # --- RAG answer service (E8, knowledge-rag.md §6.5): search → answer + citations ---
    # Default top-k chunks fed to the answer LLM as context (scoped like search). The answer model
    # resolves via the 'answer' role (llm_connections); with no real provider it falls back to the
    # stub, so the endpoint works offline but only synthesizes for real once a provider is set.
    rag_answer_top_k: int = 6
    # Best-effort LLM query-rewrite before retrieval (expand/clarify the question). On failure the
    # original question is used, so this never blocks an answer.
    rag_answer_rewrite: bool = True

    # --- OpenAI / ChatGPT API (provider="openai") — /v1/chat/completions ---
    openai_api_key: str = ""
    openai_base_url: str = "https://api.openai.com/v1"
    openai_default_model: str = "gpt-4o-mini"

    # --- Anthropic / Claude Messages API (provider="anthropic") — /v1/messages ---
    # Default model is the latest Opus per Anthropic guidance; override per-agent via agents.model.
    anthropic_api_key: str = ""
    anthropic_base_url: str = "https://api.anthropic.com"
    anthropic_version: str = "2023-06-01"
    anthropic_default_model: str = "claude-opus-4-8"

    # --- Telegram channel (features/telegram-integration.md) ---
    # The bot TOKEN is NOT here (no-hardcode) — it lives encrypted in telegram_connections, set from
    # the UI. These are only transport tunables. Base is overridable for tests/proxy.
    telegram_api_base: str = "https://api.telegram.org"
    # Long-poll hold time for getUpdates (polling mode) — 30–60s avoids hammering Telegram.
    telegram_poll_timeout_s: float = 50.0
    # Per-call HTTP timeout for Bot API requests (must exceed telegram_poll_timeout_s for getUpdates).
    telegram_request_timeout_s: float = 60.0
    # Reply formatting — MarkdownV2 (escape user content) or HTML; "" = plain text.
    telegram_parse_mode: str = "MarkdownV2"
    # Public base URL of THIS deployment (e.g. https://app.example.com) — used to build the
    # setWebhook callback URL in webhook mode. Empty → webhook mode can't self-register (polling only).
    public_base_url: str = ""

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
        # SECRET_KEY (crypto.py at-rest key). Empty is fine — it derives from the (guarded) JWT_SECRET;
        # but an explicitly-set weak value would otherwise slip past, so check it when present.
        if self.secret_key and (self.secret_key in _DEV_JWT_SECRETS or len(self.secret_key) < 32):
            problems.append("SECRET_KEY is a dev default / too short — set a strong unique secret of >=32 chars, or leave it empty to derive from JWT_SECRET")
        if not self.cookie_secure:
            problems.append("COOKIE_SECURE must be true behind HTTPS in production")
        if self.seed_password in _DEV_SEED_PASSWORDS:
            problems.append("SEED_PASSWORD is the dev default — change it")
        if self.minio_secret_key in _DEV_MINIO_SECRETS:
            problems.append("MINIO_SECRET_KEY is the dev default — change it")
        # Redis holds sessions, the perms cache, and the job queue; an unauthenticated Redis exposed
        # across servers is fully readable. Require a password in production (empty is fine in dev,
        # where Redis is only reachable on the private compose network).
        if not urlparse(self.redis_url).password:
            problems.append("REDIS_URL has no password — set REDIS_PASSWORD and embed it in REDIS_URL (redis://:<pw>@host:6379/0); an unauthenticated Redis must not be exposed across servers")
        return problems


settings = Settings()
