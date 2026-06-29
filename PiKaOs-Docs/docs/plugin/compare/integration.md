---
title: Compare (plugin) — merge-back plan
type: process
status: design
keywords: [merge-back, integration, re-gate auth, shell, rbac, engine divergence, dead code, port registry, single source of truth]
related: [./overview.md, ./errors.md, ../../features/compare.md, ../../architecture/ports.md]
summary: >
  The 🟡 plan for folding plugin Compare back into main PiKaOs — what to re-gate, re-attach,
  dedupe, and drop, plus the engine-divergence risk. Read before integrating or retiring the app.
updated: 2026-06-20
---

# Compare (plugin) — merge-back into the main PiKaOs system

This app exists to **feed improvements back** into PiKaOs (or be re-absorbed). The in-PiKaOs feature
it was lifted from is [`../../features/compare.md`](../../features/compare.md). When integrating:

1. **Re-add the auth gate** — `Depends(get_current_user)` on all four endpoints; restore the token /
   refresh-on-401 logic in `api.js`. The plugin deliberately dropped it (open endpoints —
   [`decisions.md`](decisions.md)).
2. **Re-attach the shell** — nav id `compare` (Workspace group), RBAC, i18n wiring, dashboards — none
   of which ship here.
3. **Engine = single source of truth.** The `services/*` + `schemas.py` compare code here is a
   **copy** of the main repo's. ⚠️ **Divergence risk:** a fix made in one copy is invisible to the
   other. When you change the compare engine, change **both**, or re-extract this app from main.
   Long-term, factor the engine into a shared package both consume.
4. **Drop the dead code** ([`errors.md`](errors.md) §6) before it propagates back — the leftover
   auth/health schemas and the stale `/api/compare/render` docstring.
5. **Deps/config are additive** — the main repo already has the full stack; the trimmed
   `requirements.txt` / `config.py` here are *subsets*, so merging adds nothing to remove on the
   main side.
6. **Port registry** — if the plugin is retired, free **5174/8001** in
   [`../../architecture/ports.md`](../../architecture/ports.md) (same commit).

> Tests: the parent ships `tests/test_compare.py` (injected `MockTransport` client). The plugin
> services still accept the `_client` param, so the moment Compare merges back the existing tests
> cover it unchanged — port the file rather than rewriting.
