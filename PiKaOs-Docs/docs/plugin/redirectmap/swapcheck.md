---
title: RedirectMap — the Swap-check tab (v0.4)
type: reference
status: built
keywords: [swap check, domain swap, swapOnly, follow redirect, final url, 404, browser-like, google, pure swap, reuse discover verify, third tab]
related: [./README.md, ./overview.md, ./matching.md, ./errors.md, ../../architecture/versions.md]
summary: >
  The third tab: pull the OLD sitemap, swap every URL's domain onto the new base (same path, no fuzzy
  match), then probe each FOLLOWING redirects — like a browser/Google. Pass = lands on a real 200
  (incl. via the new server's own redirect); 404 is just reported. Built ENTIRELY by reusing
  /discover (new swapOnly flag) + /verify — no new engine, service, or endpoint.
updated: 2026-06-23
---

# Swap check — same-path domain swap + follow-redirect probe

The **third** RedirectMap tab ([`screens-swapcheck.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-swapcheck.jsx)),
the **simplest** of the three. It answers one question per old URL: *"swap this onto the new domain —
does that page actually load, and where does it land?"*

> **Mental model = Google / a browser.** We don't *guess* the new path. We take the old URL, swap the
> domain (keep the path verbatim), then **follow redirects** like a browser. If the new server already
> redirects the swapped path to the real page (e.g. `/en/job-pool-preview` → `/en/job-pool`), we land
> on a `200` and call it a **pass** — the server did the resolving, we just confirmed it. If the path
> 404s, we **report the 404** and stop (the team fixes the path); we do **not** strip suffixes or fuzzy-match.

## 1. Why it's not a new engine

Everything it needs already existed — this tab is **wiring + a flag + a screen**, no new backend logic
([reuse-before-build](../../../../CLAUDE.md) §1):

| Step | Reused from |
|---|---|
| Pull the old sitemap | `sitemap.fetch_sitemap_urls` (via `/discover`) |
| Same-path domain swap | `discover_service._swap_origin` |
| Follow-redirect probe → final status + landing URL | `probe.probe_follow` (via `/verify`) |
| Interpret 200 / 404 / WAF-blocked | `verify_service` (`newStatus`, `newFinalUrl`, `newOk`, `_BLOCKED_CODES`) |
| SSRF guard · per-host Basic Auth · cancel-on-disconnect | `net_guard` · `credentials` · `_run_cancellable` |

**The only new backend code** is one flag — `DiscoverIn.swapOnly` (default `False`). When set, `discover()`
**skips reading the new sitemap** so every row is a pure `_swap_origin` (no fuzzy match, `matchScore = None`).
Without it, Discover would try the new sitemap and *fuzzy-match* `…job-pool-preview` to `…job-pool` at ~75%
(< the 95 threshold → blank), which is **not** what this tab wants. See [matching.md §6](matching.md).

## 2. The flow (frontend orchestration)

```
newBase + old list ──► for each old site:
   POST /discover { oldBase, newBase, symbol, credentials, swapOnly:true }   → swapped rows (oldUrl, newUrl=swapped)
        dedupe by oldUrl across sites
   POST /verify   { rows, credentials, deepCheck:false }  (in chunks of 25)  → newStatus, newFinalUrl, newOk
        per row → bucket + result pill
```

`deepCheck:false` — Swap-check only needs the **final status + landing URL**, not the body/file deep pass,
so it runs the cheap status probe. The verdict logic in `_derive_verdict` is identical either way.

## 3. The result buckets (frontend `swResult`)

The new status code maps to one of three buckets (each a stat-tile filter + a coloured pill):

| Bucket | When | Pill (TH) |
|---|---|---|
| **pass** | final status is `2xx`. If the final URL ≠ the swapped URL (server redirected us), the pill reads "↪ เด้งไปหน้าจริง" | ✅ ผ่าน / ↪ เด้งไปหน้าจริง |
| **notfound** | `404` / `410` — the swapped path doesn't exist on the new site (**reported, nothing more**) | 🚫 ไม่พบหน้า |
| **check** | blocked (`401/403/405/406/429/503` = WAF/login), other `4xx/5xx`, or unreachable — a human must look | ⚠ เช็กเอง / error / เข้าถึงไม่ได้ |

"Redirected?" is decided by comparing the **normalized** swapped URL vs `newFinalUrl` (lowercased host,
trailing slash stripped) — so a bare trailing-slash difference doesn't read as a redirect.

## 4. UI notes

- **Identity fields are shared** with the other two tabs (Symbol · new base · old list · Basic-Auth creds,
  lifted to [`App.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/App.jsx)) — switch
  tabs and the data carries over. Symbol is **optional** here (only names the export); new base + ≥1 old are required.
- **Table** — `# · Old URL · Swapped URL · HTTP · Final URL · Result`. The Final URL cell shows `↪ <url>`
  only when the server redirected; otherwise `—`.
- **Export** reuses `/export` (the checklist xlsx) — filename `{Symbol} - SwapCheck - {YYYYMMDD}.xlsx`.
- 401 hosts found during the run auto-populate the **Basic-Auth** section (same behaviour as the Redirect tab).

## 5. Not in scope (by decision)

No suffix-stripping, no fuzzy fallback, no web.config from this tab — a `404` is **reported as-is**. If the
team later wants an auto-resolver (try `-preview`/`-uat` removed, or fall back to a sitemap candidate), it
would layer on top of this tab; it was deliberately left out of v0.4 to keep the tool "browser-truthful".
