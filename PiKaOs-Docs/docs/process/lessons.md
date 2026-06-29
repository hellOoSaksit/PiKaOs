---
title: Lessons — experience, lessons learned, and decision log
type: process
status: active
keywords: [decision log, lessons, locked decisions, known risks, traps, rbac, ssrf, input trust, memory]
related: [./playbook.md, ./session-handoff.md, ./improvement-plan.md, ../pikaos-dev-rules.md]
summary: >
  Cross-chat project memory: locked decisions, risks not yet fixed, and spot-specific traps.
  Open before starting related work; record any new lesson here in the same pass.
updated: 2026-06-27
---

# Lessons — experience, lessons learned, and decision log

> Cross-chat project memory: "what was decided / where we slipped up / don't repeat the mistake".
> Open before starting related work (see the loop in [`playbook.md`](playbook.md)). Find a new lesson → record it here in the same pass.

## A. Locked decisions (decision log)

Format: **[date] topic → what was agreed · because · owning doc**

- **[2026-06-12] Multi-tenancy = single org, multiple departments** → add `department_id` to every scopable table
  **from the first migration** · because backfilling later hurts far more · [system-design §7.1](../architecture/system-design.md#71-department-scoping--multi-tenancy--one-org-many-departments).
- **Dynamic widget: check only the marker + flag manual** → **no headless browser** · because the cost/fragility
  isn't worth it for compare/audit · [compare.md](../features/compare.md), [checklist-audit.md](../features/checklist-audit.md).
- **Compare = stateless** → no DB, no `repositories/` layer · because the Production sitemap is already the source of truth
  · [compare.md](../features/compare.md).
- **Compare parses HTML with stdlib only** → no added dependency · because of the strict dependency policy
  ([tech-stack §4](../architecture/tech-stack.md)) · [compare.md §6](../features/compare.md).
- **Room: data model frozen** → `guildos.rooms.v2` (`floor[]`/`struct[]`/`objects[]`) + `FURN` keys/footprints/`draw3d`
  must not change · because it feeds 2 renderers at once · [room-3d.md](../features/room-3d.md).
- **[2026-06-15] RBAC = server-side, server is the source of truth** → effective = role_perms ∪ grant − deny
  (deny wins), admin = all perms · **map users by `username`** not email (`@guildos.io` on the seed side causes drift) ·
  Redis cache `perms:<id>` TTL 60s → **must call `rbac_service.invalidate()` when editing a role/override** ·
  **every write endpoint from now on declares `Depends(require_perm("..."))`** (CLAUDE.md §2.2) · risk-mitigation §2.
- **[2026-06-16] Redis down = degrade, not crash (A9 graceful degradation)** → the read-path that every authed request
  runs through tolerates a Redis outage: deny-list **fail-open** (can't check revoke → let it through, because the access token is short-lived
  15m, limited gap + warning log), perms cache miss → read DB directly; logout/cache-bust = best-effort (don't raise) ·
  login/refresh still depend on Redis (raise for real) · because availability > immediate revoke for an internal tool ·
  **if prod needs to be stricter → switch `is_access_denied` to fail-closed / add a config flag** ·
  [`redis_client.py`](../../../PiKaOs-Core/Backend/app/redis_client.py), [`tests/test_resilience.py`](../../../PiKaOs-Core/Backend/tests/test_resilience.py).
- **[2026-06-22] Config scope = two tiers (where settings live)** → **Tools / system config — the
  "จัดการเครื่องมือ" screen, including the Menu Manager nav arrangement — is GLOBAL**: one shared
  value, stored server-side, every user on every device sees the same ([`app_settings`](../../../PiKaOs-Core/Backend/app/routers/settings_config.py)
  table, key per setting). **The "ตั้งค่าระบบ" Settings screen (theme / language / lexicon / personal
  prefs) is PER-USER**: it follows the person across machines → a **user-scoped** server store (keyed
  by `user_id`), not per-browser localStorage. Because admin-owned system config must be uniform for
  everyone, while personal prefs must travel with the user. localStorage stays **only** as an offline
  render cache, never the source of truth. Status: global tier built (`app_settings`, nav); per-user
  tier still **planned** (Settings is localStorage today — see [session-handoff](session-handoff.md)).

## B. Input trustworthiness (rules learned the hard way)

- **Structured IA source files (emmx/drawio/xmind) are trustworthy** — but **PDFs/images must always be human-reviewed**
  (vision-read makes mistakes). Example: `corporate-website-standard.json` (WD emmx) is still `verified:false`
  because the DFS-reconstruct from binary is pending review against MindMaster — see [session-handoff.md](session-handoff.md).
- Thai CSVs can break (encoding) → re-export as UTF-8 before converting.

## C. Known risks, not yet fixed (don't forget before going to prod)

- ✅ **[P0] SSRF — fixed (2026-06-15, A7)** in [`net_guard.py`](../../../PiKaOs-Core/Backend/app/services/net_guard.py)
  (upfront 400 + event hook to block redirects). Remaining: DNS-rebinding (pin IP). **Use this same guard when building audit Discovery.**
- **[P1]** compare/audit still has no permission + no per-user rate-limit → A1 (RBAC) is done = **unblocked**:
  next step is to add `require_perm("compare.run")` on the 3 endpoints + rate-limit via Redis (compare-hardening §2).
- Details + full fix design → [compare-hardening.md](../features/compare-hardening.md).
- **Stack hardening**: ✅ [2026-06-15] `minio` now pinned by digest (docker-compose.yml) + ✅ A4 boot asserts
  (prod using a default secret → dies on boot, `config.production_violations()` + main.lifespan).
  ✅ [2026-06-16] `passlib` → `argon2-cffi==25.1.0` (existing argon2id hashes verify fine — the 6 existing user logins are OK, no crypt deprecation).
  Outstanding: frontend lint/test/typecheck, CI — [tech-stack §3](../architecture/tech-stack.md).
- Full list + fix order: [risk-mitigation.md](../architecture/risk-mitigation.md) (15 items) ·
  [improvement-plan.md](improvement-plan.md) (phases A–F).

## D. Spot-specific traps (open the owning doc before touching)

- **Compare** — proxy timeout 120s (deep mode must stream in batches); GET fallback loads the full body → [compare.md §6](../features/compare.md).
- **Room 3D** — no tone mapping (ACES/Neutral washes colors out); shadow camera must fit room bounds or large rooms have no shadows;
  shared geos/mats **must not be disposed** → [room-3d.md](../features/room-3d.md).
- **i18n** — new strings go into `en-formal` + `th-formal` first; other packs inherit via the 4-layer fallback (CLAUDE.md §1.2).
- **Screen barrels** — edit the module, not the barrel; use `wt`/`st` together, don't re-declare (CLAUDE.md §1.6).
- **Spacing/styling a shared component → use `className`, not `style`** — the `Panel` component
  ([`components.jsx`](../../../PiKaOs-Core/Frontend/src/components/components.jsx)) only accepts
  `title/en/icon/right/className/ornate/bodyPad`; an inline `style={{...}}` is **silently dropped**.
  To put a gap between blocks (or style one), pass a CSS **class** (e.g. `.permcat-block { margin-bottom: 22px }`)
  via `className` — verified live: a `style={{marginBottom}}` on `<Panel>` produced no gap at all. Rule of
  thumb: before passing `style` to any shared wrapper, check its props forward it; most here take `className` only.

## E. Problems hit & how they were fixed (don't re-debug — don't loop)

Running log of real problems and what actually fixed them, so the same issue is never re-debugged from
scratch — and the **anti-loop** record from CLAUDE.md always-on rule 9 (when a fix repeats without working,
stop and write the root cause here). **Check this section before related work; add a row in the same commit
you fix something non-obvious.**

Format: **[date] problem (symptom) → root cause → fix · owning doc/code**

- **`<Panel>` silently drops inline `style`** (symptom: `style={{marginBottom}}` produced no gap at all) →
  **root cause:** the shared `Panel` forwards only `title/en/icon/right/className/ornate/bodyPad` — an inline
  `style` is dropped → **fix:** style via a CSS **class** passed through `className` (e.g.
  `.permcat-block { margin-bottom: 22px }`) ·
  [components.jsx](../../../PiKaOs-Core/Frontend/src/components/components.jsx) (also a §D trap; date not recorded).
- **[2026-06-27] A Dockerfile `HEALTHCHECK` baked into a *shared* image fails every non-matching container
  built from it** (symptom: `pikaos-ai-worker-1` stuck `health: starting` → would go `unhealthy`; log =
  `curl: (7) Failed to connect to localhost:8000`) → **root cause:** the new backend-image HEALTHCHECK probes
  `/api/version`, but the **worker** runs no HTTP server — and the AI-tier worker (`docker-compose.ai.yml`)
  had no per-service override, so it inherited the image probe and could never pass → **fix:** override the
  worker healthcheck wherever the backend image runs as a worker — `arq app.worker.WorkerSettings --check`
  (arq's own Redis-backed liveness). Done in **both** `docker-compose.backend.yml` and `.ai.yml`; they must
  stay mirrored. **Lesson:** a healthcheck in a shared image is a *default for the primary role only* — audit
  every other service built `FROM` it · [release-and-rollback.md §2](../architecture/release-and-rollback.md) ·
  [docker-compose.ai.yml](../../../PiKaOs-Core/deploy/docker-compose.ai.yml).
- **[2026-06-27] Sandboxed Docker caches the bind mount → in-container `pytest` runs STALE host edits**
  (symptom: edited `tests/test_modules.py` on the host, but `docker compose exec backend pytest` kept
  failing on the OLD test names; `md5sum` host ≠ container, and `stat` showed different mtimes even though
  `docker inspect` listed the bind mount `Backend -> /app`) → **root cause:** this engine mounts via a
  cached layer (`/proc/mounts` shows `/run/host_mark/... fakeowner`, i.e. a userns/virtiofs-style sandbox),
  so host writes propagate to the container with a lag — some files refresh, others stay stale → **fix:**
  `docker compose restart <svc>` to flush the mount cache before trusting an in-container test run (a plain
  re-exec is not enough). **Lesson:** when verifying host edits inside a container here, restart (or
  `md5sum` host-vs-container) first — don't trust that a bind mount is instantly coherent ·
  [docker-compose.sim.yml](../../../PiKaOs-Core/deploy/docker-compose.sim.yml).
- **[2026-06-29] `restart` is NOT always enough — a *newly edited* file can stay frozen at its FIRST
  version through restarts** (symptom, Phase 2: edited `tests/test_isolation.py` twice on the host, but
  `exec backend sed -n` showed the container still serving the very first version after `restart` + a health
  wait; pytest kept failing on stale code) → **root cause:** same cached/virtiofs bind mount as the row above,
  but the cache survived a container `restart` (the mount layer wasn't re-established) → **fix:**
  `docker compose ... up -d --force-recreate <svc>` (recreate the container, not just bounce the process) — the
  container then immediately saw the current host file. **Lesson:** escalate `restart` → `--force-recreate`
  when an in-container `sed`/`md5sum` proves the file is still stale; always diff host-vs-container before
  re-running, never assume restart flushed it · [docker-compose.sim.yml](../../../PiKaOs-Core/deploy/docker-compose.sim.yml).
