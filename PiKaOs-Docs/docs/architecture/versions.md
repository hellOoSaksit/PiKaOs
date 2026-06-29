---
title: Version registry (plugin UAT ↔ main Production)
type: reference
status: active
keywords: [version, registry, semver, promotion, UAT, production, plugin, drift]
related: [../pikaos-dev-rules.md, ../plugin/README.md, ./ports.md]
summary: >
  Single source of truth for every app's version and the UAT(plugin) ↔ Production(main)
  drift. Read before bumping a version or promoting a plugin into main. The rule lives in
  pikaos-dev-rules §6.4–§6.5; this file is the registry.
updated: 2026-06-27
---

# versions.md — version registry for the whole system (read before every bump / promotion)

> **Single source of truth for app versions + UAT↔Production drift.** Each app declares its version
> **once in code** (`Backend/app/config.py` → `app_version` → surfaced in `/api/version` + `/api/health`
> + the OpenAPI title + the doc header — never hardcode it elsewhere). This file records the **current** version of
> every copy and what is **pending promotion**. The rule is [pikaos-dev-rules §6.4–§6.5](../pikaos-dev-rules.md)
> — this file is the "registry", the dev-rules are the "rule".

## Reservation table (versions)

| App | UAT (plugin) | Production (main) | Pending promotion | Source of truth |
|---|---|---|---|---|
| **PiKaOs** (main platform) | — (is Production) | **0.1.0** (now declared in `config.py` `app_version`; surfaced at `/api/version` + `/api/health`) | — | `PiKaOs-Core/Backend/app/config.py` `app_version` |
| **PiKaOs-Compare** | **0.1.2** | — (own-app only; in-main module removed 2026-06-29) | whole feature → main (0.1.1 = internal refactor, no behavior change: dedupe coverage client/host-auth/check-pair, drop dead import; split the screen into compare/ components — helpers · DeepDetail · CoverageTable · AuthModal · SitesModal · 0.1.2 = swap `difflib`→`rapidfuzz` for `bodySim` text similarity (maintained C++ lib; faster on long page bodies; Indel-based ratio ≈ difflib, may differ at the margin)) | `PiKaOs-Compare/Backend/app/config.py` `app_version` |
| **PiKaOs-RedirectMap** | **0.4.0** | — (not yet integrated) | whole feature → main (0.2 = deep verify: per-row file compare + thin-body / soft-error / SPA + WAF detect; per-host Basic Auth; SSL incomplete-chain auto-fallback; WAF/rate-limit blocked-retry; fuzzy discover with candidate picker + low-score blank-out + target-collision flag; in-memory rows with manual save/load snapshot; 5-sheet xlsx export (worklist + full file lists per side); dropped the separate `/files` endpoint · 0.2.1 = internal refactor, no behavior change: dedupe probe retry loop, split verify verdict logic, break the screen into components · 0.2.2 = schema change: Discover takes a user-adjustable `matchThreshold` (default 95) — the auto-pick gate moved from the fixed 60% env default into the UI · 0.3.0 = new **File Audit** tab: whole-site crawl of both sites → every linked document compared by filename (`POST /filescan` + `/fileexport`), compare-table xlsx · 0.4.0 = new **Swap check** tab (3rd tool): pull the old sitemap → pure same-path domain swap → follow-redirect probe → final status + landing URL, reusing `/discover` (new `swapOnly` flag) + `/verify` with **no new engine/endpoint** — pass = lands on a real 200 (incl. via the new server's own redirect), 404 just reported · 0.4.1 = swap `difflib`→`rapidfuzz` for Discover path matching (maintained C++ lib; far faster; Indel-based ratio ≈ difflib, scores may differ at the margin → can shift a borderline auto-pick at `matchThreshold`)) | `PiKaOs-RedirectMap/Backend/app/config.py` `app_version` |

> "Production (main)" = **—** means the plugin has **not been merged into main yet**, so there is no
> Production copy to drift from — the version gate (§6.5) only starts once a feature lives in **both**.
> Until then the plugin is simply at its own version and the whole app is "pending promotion".

## Rules

1. **`vMAJOR.MINOR[.PATCH]`** declared **once** in `config.py` (`app_version`). `/api/version`, `/api/health`,
   the OpenAPI title, the README and the doc header all read from it — `grep -rn "<old version>"` after a bump to
   confirm nothing hardcodes it ([no-hardcode — CLAUDE.md always-on rule 2](../../../CLAUDE.md)).
2. **Bump MINOR** on a behaviour / endpoint / schema change; **PATCH** on a fix; the version a copy
   reports must equal what its code actually does.
3. **UAT advances freely; Production waits.** Bumping the plugin (UAT) updates **this table's UAT
   column only** — the Production column does **not** move until promotion.
4. **Drift is documented, never silent.** While UAT > Production, the plugin's doc carries an
   `## Unreleased — pending promotion to main` changelog (template:
   [../templates/unreleased-block.md](../templates/unreleased-block.md)); summarise it in the **Pending
   promotion** column above.
5. **Promote only on explicit user approval** ("update Production / promote vX"): fold code + the pending
   changelog into main + main docs (`docs/features/<x>.md`), bump the **Production** column to the new
   version, clear the plugin's `Unreleased` section + the Pending column, and the two **reconverge**
   — all in the **same commit** (this table included).

> Related: [ports.md](ports.md) (host-port registry — the sibling pattern), [pikaos-dev-rules §6](../pikaos-dev-rules.md)
> (plugin lifecycle), [plugin/README.md](../plugin/README.md) (the line contract).
