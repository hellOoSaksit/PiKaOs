---
title: Compare/Sitemap Hardening — Risks + Mitigations
type: feature
status: design
keywords: [ssrf, net_guard, rate-limit, authz, hardening, outbound http, redirect, gzip sitemap, security]
related: [./compare.md, ../architecture/risk-mitigation.md, ../process/lessons.md, ../process/improvement-plan.md]
summary: >
  Owns the security risks of the outbound-HTTP compare/audit path + their mitigation design.
  Read before opening compare/audit to real users.
updated: 2026-06-20
---

# Compare/Sitemap Hardening — Risks + Mitigations

> Compare/Audit is **the only path where the backend fires HTTP out to a user-supplied URL** ([compare.md](compare.md) reiterates).
> This file collects the security risks of this path + the mitigation design — **read before opening compare/audit to real users**.
> Short summary in [`../process/lessons.md §C`](../process/lessons.md); system-wide risks in [risk-mitigation.md](../architecture/risk-mitigation.md).

## Current Understanding

3 endpoints in [`routers/compare.py`](../../../PiKaOs-Core/Backend/app/routers/compare.py) — `POST /api/compare`,
`/api/compare/deep`, `/api/compare/render` — all `Depends(get_current_user)` (login required)
but **nothing else**: no per-permission, no rate-limit, and **no filtering of the URL destination**.
[`compare_service.py`](../../../PiKaOs-Core/Backend/app/services/compare_service.py) fires `httpx` directly at
the user-supplied `prodBase`/`uatBase`/`sitemapUrl` (`_probe`, `render_page`, `fetch_page`,
`fetch_sitemap_urls`) without checking the host.

## 1. [P0] SSRF — server can fire at internal hosts — ✅ fixed (A7)

> **[2026-06-15] Implemented** in [`services/net_guard.py`](../../../PiKaOs-Core/Backend/app/services/net_guard.py):
> upfront `assert_public_url()` (router → HTTP 400) + an httpx request event hook that fires on every request
> including redirects (`guarded_event_hooks()`), toggle `compare_ssrf_block_private` + allowlist `compare_url_allowlist`.
> Test: [`tests/test_net_guard.py`](../../../PiKaOs-Core/Backend/tests/test_net_guard.py) (network-free). Remaining: **DNS-rebinding**
> (resolve→pin IP) not yet done — see note in `assert_public_url`. Original design details below.

### Observation
- `swap_origin()` / `compare()` accept `uatBase`, `prodBase`, `sitemapUrl` as any netloc →
  a user enters `http://169.254.169.254/...` (cloud metadata), `http://minio:9000`, `http://localhost`,
  `http://10.x/`, an internal redirect — and the server fires at it.
- `render_page()` **returns the full HTML** (`RenderOut.html`, `follow_redirects=True`) → not just a probe
  but **reads the content** of an internal host back to the user = SSRF that can actually read data (the most severe in this set).
- `_probe()` does HEAD→GET, deep mode loads the body + follows images/links → every path fires at the user's URL.

### Recommendation — one central guard (phase A7) shared by compare + audit
- An `assert_public_url(url)` function in a new `services/` file (e.g. `net_guard.py`): parse → resolve DNS →
  reject if the IP is private/loopback/link-local/reserved (`ipaddress.ip_address(...).is_private` etc.),
  reject schemes other than http/https, and (optional) an allowlist of hosts for that job.
- Call the guard **before every request** — both the entry URL and **after every redirect** (use an httpx event hook
  or `follow_redirects=False` and check `Location` yourself layer by layer) because internal redirects are the main vector.
- `render_page` is especially strict: because it returns the body — it must at minimum pass the guard + consider limiting content-type/size (already has `compare_render_max_chars`).
- config: `compare_ssrf_block_private` (default `True`), `compare_url_allowlist` (empty = allow all public hosts).

### Pros / Cons / Impact
- **Pros**: closes all SSRF vectors at a single point, reused by audit's Discovery (`checklist-audit.md §3.0`).
- **Cons**: DNS-resolve adds slight latency; must watch for DNS-rebinding (resolve once then pin the IP to connect to).
- **Impact**: add the guard file + fix the 3 spots that create `httpx.AsyncClient` in compare_service; test mock adds a private-IP case.

## 2. [P1] No fine-grained authz + no rate-limit

### Observation
Just being logged in lets you fire compare/render → a single user firing a thousand times = using the backend as a proxy/DoS amplifier
(each compare fires the whole sitemap set × 2 sides, concurrently up to `compare_max_concurrency`).

### Recommendation
- Bind `require_perm("compare.run")` once server-side RBAC (phase A1) is ready.
- Rate-limit per user via Redis (e.g. token bucket — use the existing `redis_client.py`) per endpoint;
  value in config (`compare_rate_per_min`).
- **Impact**: add a dependency to the 3 routes + a helper in `redis_client.py`; does not touch the comparison logic.

## 3. [P2/P3] Robustness — not security but worth keeping

- [P2] No support for `sitemap.xml.gz` (gzip sitemap index) → some sites can't be read. Fix in `sitemap.py`.
- [P3] `max_sitemaps` / some limits are hardcoded → move into `config.py` to make them adjustable.
- [P3] The GET fallback in `_probe()` loads the full body to check status → use `stream=True`/read only the status to reduce bandwidth.

## Order of work

- ✅ **A7 (SSRF)** — done 2026-06-15 (§1). Remaining: DNS-rebinding pin-IP.
- ⬜ **§2 (authz + rate-limit)** — wait for A1 (RBAC) then bind `require_perm("compare.run")` + rate-limit via the existing Redis.
- ⬜ **§3 (robustness)** — do when a real site hits the problem.

Overall ordering reference: [improvement-plan.md phase A](../process/improvement-plan.md).
