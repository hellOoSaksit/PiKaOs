---
title: RedirectMap (plugin) — merge-back plan
type: process
status: design
keywords: [merge-back, integration, auth gate, rbac, config-driven, dedupe with compare, dead code, ports, reuse vs rebuild]
related: [./overview.md, ./errors.md, ../compare/integration.md, ../../architecture/modularity.md]
summary: >
  The 🟡 plan for folding RedirectMap into main PiKaOs beside Compare — what carries over, what must change
  (auth, shell, config, dedupe), and a reuse-vs-rebuild call. Read before integrating or retiring the app.
updated: 2026-06-20
---

# Merge-back into the main system

RedirectMap is meant to fold into PiKaOs as a module beside Compare. This is the plan, written now
while the decisions are fresh, so the move is mechanical. See the module model in
[`../../architecture/modularity.md`](../../architecture/modularity.md).

## What carries over as-is

- **Backend services** are clean, stateless, DB-free: `verify_service · probe · page_inspect ·
  credentials · sitemap · webconfig · checklist_xlsx`. They drop into the main app's `services/` unchanged.
- **`net_guard` is already shared** with Compare — the main app has its own copy; reuse it, don't add another.
- **The screen** is self-contained (local i18n, no world/data-layer deps), so it ports as one
  `screens-redirect.jsx` + its `lib/api.js` calls.

## What must change on the way in

1. **Auth.** The plugin is open. **Don't re-add a local gate** — the main app already has the real
   thing (`routers/auth.py`, JWT, RBAC). Mount the router behind `Depends(get_current_user)` + a
   permission, exactly like Compare ([`../compare/integration.md`](../compare/integration.md)), and
   ride the app token in `api.js`. A page-login gate was built here and removed — don't resurrect it.
   **Note the two are unrelated:** the **target-site HTTP Basic Auth** (`credentials.py`, per-host
   user/pass for a gated UAT site being *probed*) is an outbound concern that carries over **as-is** —
   it is not the tool's own RBAC login. Keep both.
2. **Shell / nav.** Register the router under the main router; add a nav id (Workspace group); the
   screen becomes a routed screen, not the whole app.
3. **Settings → config-driven.** `redirect_*` move into the main `config.py`, and per the no-hardcode
   rule the tunables (timeouts, concurrency, `redirect_body_min_chars`, the `_ERROR_SIGNS` list)
   should be editable from the **"จัดการเครื่องมือ"** tools screen + DB, not just `.env`.
4. **Dedupe with Compare.** Both probe sitemaps, fetch HTML, SSRF-guard. Converge: one `sitemap.py`,
   one `net_guard.py`, one probe/UA policy, one doc-link extractor. RedirectMap's `page_inspect`
   (soft-error + has-body) and Compare's `content.py` (block diff) should become one HTML-inspect
   module. **Divergence risk** is the same as Compare's — fix in both copies or share a package.
5. **Drop the dead code** ([`errors.md`](errors.md) §7) before it propagates back.
6. **Ports.** On merge, free **5175/8002** in [`../../architecture/ports.md`](../../architecture/ports.md).

## Reuse vs rebuild — quick call

| Concern | Decision |
|---|---|
| Verify / detection logic (`verify_service`, `page_inspect`) | **Reuse** — port verbatim |
| SSRF guard, sitemap fetch, probe/UA | **Reuse + dedupe** against the main app's copy |
| Auth | **Drop the local one; use the main app's** RBAC gate |
| Settings | **Rehome** into main `config.py` + the tools screen (config-driven) |
| Site-wide file scan (`/files`, `files_service.py`) | ✅ **removed** (2026-06-20) |
| `kind` (WD/IR) tag | ✅ **dropped** from the schema (2026-06-20) |
| Frontend screen | **Reuse** as a routed, auth-aware screen |
