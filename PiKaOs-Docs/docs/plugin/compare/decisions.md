---
title: Compare (plugin) — design choices & alternatives
type: reference
status: built
keywords: [decisions, rationale, stream batches, no iframe preview, stdlib parser, chrome exclusion, concurrency, per-host auth, ssrf]
related: [./overview.md, ./errors.md, ./integration.md, ../../features/compare.md]
summary: >
  Why the Compare build looks the way it does and what was tried and rejected. Read before re-litigating
  any architectural choice (streaming, no headless render, polite concurrency, per-host auth, dropped auth gate).
updated: 2026-06-20
---

# Compare (plugin) — design choices & alternatives

Why the build looks the way it does — and what was tried and rejected. Read before re-litigating
any of these; the rationale is load-bearing.

| Decision | Why | Rejected alternative |
|---|---|---|
| **Stream in batches** (plan→batch; deep in 2s) | a big sitemap in one request overran the 180s proxy timeout → `ERR_EMPTY_RESPONSE` (260-URL site ≈185s) | one-shot `/api/compare` — kept only for back-compat |
| **No iframe rendered preview** | can't faithfully show a JS+API SPA: a static server snapshot runs no JS; running the page's JS client-side **CORS-blocks its own data `fetch`** (opaque iframe origin) so it never hydrates | direct iframe → server proxy snapshot → `sandbox="allow-scripts"` — **all removed**. Faithful rendering needs a **server-side headless browser** = **deliberate non-goal** (keeps compare dependency-light, no Chromium). The structured diff is the source of truth; "open in new tab" shows the live site. |
| **Stdlib `html.parser`** for extraction | **no new Python dep** → image needn't rebuild, runs in tests offline | BeautifulSoup / lxml |
| **Exclude page chrome** (`nav/header/footer/aside` + ARIA landmarks) from the body diff | the nav mega-menu dominates, differs per site, and inflated `bodySim` → meaningless noise | diffing raw page text |
| **Block-by-block + heading-outline diff + scroll-to-text jump-links** | pinpoints *which* paragraph/heading differs on *which* side and jumps to it on the live page — **no JS dependency** (native `#:~:text=`) | flat word diff (kept only as a legacy fallback) |
| **Compare downloadable files by filename** | host/path differ across sites but the file is "the same document"; catches a stale UAT asset (`…2024.pdf` vs `…2025.pdf`) | compare by URL (would always differ) |
| **Polite concurrency + retries + shared sub-semaphore** | tames WAF/CDN rate-limiting that fakes failures (`unreachable`/404, "all links broken") | high concurrency — **backfires** (more throttling → slower + more false "broken") |
| **Per-host auth dispatch** (`_HostAuth` keyed by `request.url.host`) | PROD & UAT can need different/one-sided logins; a credential must reach **only its own origin**, never the other side or a redirected third party | one global credential |
| **Saved creds in plaintext `localStorage`** | explicit user request; acceptable only because this is a local/internal tool. Live auth stays **in-memory only**; saving is opt-in | don't persist creds (rejected by user) / encrypt (no key store in a static frontend) |
| **Two-layer SSRF guard** | `assert_public_url` rejects bad input up front (clear 400); the httpx event hook re-checks **every redirect hop** (a 302 to an internal host degrades to a normal fetch failure) | single up-front check — misses redirects |
| **Stateless → split out as a plugin** | compare keeps no state, so the extraction is clean (no DB/redis/minio to carry) — the cleanest cut of the modularity idea | leaving it only inside the monolith |
| **Drop the auth gate in this build** | a self-contained, no-friction local tool; security is delegated to a network boundary / reverse proxy if exposed | ship JWT auth without the rest of the platform (defeats the "just run it" goal) |
