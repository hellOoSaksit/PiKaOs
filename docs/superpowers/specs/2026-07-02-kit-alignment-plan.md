# PiKaOs ↔ new-project kit — Alignment Plan

**Date:** 2026-07-02
**Source of truth:** `/home/pika/Documents/MyProject/new-project/` (v0.4.1). PiKaOs itself declares the kit upstream — `PiKaOs-Docs/docs/architecture/plugin-architecture.md:17-19`: *"when the kit and this doc disagree, the kit wins."*
**Method:** read the kit's scaffolder + docs-lint + plugin-architecture example; ran the kit's `docs-lint.py` against `PiKaOs-Docs/docs`; diffed the two `docs-lint.py`; compared manifests, compose fragments, top-level files.

Naming: **Fix-KIT-\*** = PiKaOs diverges → conform to kit · **Propose-KIT-\*** = PiKaOs has it, kit doesn't → fold back into the kit.
Severity: **P0** blocks/red-CI · **P1** should-fix soon · **P2** hygiene.

---

## ✅ Execution status (2026-07-02) — all phases done + verified

| Fix | Done | Note |
|---|---|---|
| Fix-KIT-01 | ✅ | ~230 broken links repointed to plugin-repo paths / removed (dead); `superpowers/` excluded from the linter |
| Fix-KIT-02 | ✅ | `architecture/security.md` created (OWASP table + PiKaOs decisions) + always-on rule 10 + index row |
| Fix-KIT-03 | ✅ | umbrella-root `CLAUDE.md`/`AGENTS.md`/`llms.txt` symlinks restored (gitignored, per `.gitignore` design) — auto-fixed ~27 links |
| Fix-KIT-04 + Propose-KIT-01 | ✅ | one merged `docs-lint.py`: kit's strict checks (fenced-code, unclosed-frontmatter, same-file anchor) + PiKaOs cross-repo/template handling + `superpowers/` exclusion |
| Fix-KIT-05 | ✅ | `CHANGELOG.md` (root), `.github/{SECURITY,CODE_OF_CONDUCT,CONTRIBUTING}.md`, `dependabot.yml` (actions/pip/npm/docker), `scorecard.yml` |
| Fix-KIT-06 | ✅ | all actions SHA-pinned (`ci.yml` + `docs-lint.yml`); both workflows now have `permissions: contents: read` |
| Fix-KIT-07 | ✅ | Tools-Postgres/Redis/MinIO fragments now internal-by-default (no host port publish) |
| Fix-KIT-08 | ✅ (partial) | `kind: capability` added to ai/auth/knowledge; `migrations` → path in ai/knowledge; §3 example corrected (capability + `identity.Provider`). **auth `provides` reverted to `[]`** — see finding below |
| Fix-KIT-09 | ✅ | vendored `new-project/` copies re-synced to kit v0.4.1; kit-only links (`docs-lint.py`, `../examples/…`) repointed to resolve in PiKaOs-Docs |

**Verified:** merged `docs-lint.py` → **56 docs, 0 problems** (handoff + 12 memories within size budget); kit's strict lint residual = only `superpowers/` (excluded by design) + 1 intentional template placeholder. **Backend suite → 81 passed.**

### Finding during Fix-KIT-08 — the loader enforces id-prefixed `provides` (kit-relevant)
The comparison recommended `auth` declare its identity contract in `provides`. But PiKaOs's `plugin_loader._validate` **hard-fails** any `provides` key not prefixed with the plugin's own `id` — and the identity contract is bound under the **kernel** token `identity.Provider` (Core `contracts.py`), which is deliberately NOT `auth.`-prefixed. So `auth` correctly ships `provides: []`; it binds a kernel seam, not a namespaced plugin contract. The original manifest was right; the recommendation was wrong for this model. (Caught by the backend suite — a good argument for Propose-KIT-01-style contract tests.)

---

## Propose-KIT-15 — anti-bloat hygiene guards in docs-lint (added 2026-07-02)

A hygiene-guard layer was added to `docs-lint.py` (commit 5123e7d) and is **NOT in the kit** → a strong
give-back candidate. It machine-enforces that the read-every-session docs can't silently bloat (the real
failure mode that grew `session-handoff.md` to ~1000 lines / ~32k tokens):

| Guard | Limit | Kit-generalizable? |
|---|---|---|
| `session-handoff.md` lines | ≤ 350 (fail) | **Yes** — the kit prescribes `process/session-handoff.md` + docs-lint |
| `session-handoff.md` `SESSION-END STATE` blocks | ≤ 2 (fail) | **Yes** — anti stacked-history |
| curated doc lines | > 600 (warn) | **Yes** — "split when it grows" is a kit rule |
| each memory file lines | ≤ 200 (fail, local only) | Partial — Claude-Code `~/.claude` memories; kit is agent-agnostic |
| `MEMORY.md` index lines | ≤ 120 (fail, local only) | Partial — same |

Recommendation for the kit: fold the **session-handoff + curated-doc** guards into the kit's canonical
`docs-lint.py` (they generalize to any project); ship the **memory** guards as an optional, path-gated
block (`$*_MEMORY_DIR`) since memory is a Claude-Code feature, not a kit primitive. Pairs with
Propose-KIT-01 (the merged multi-repo linter) — both are docs-lint upgrades the kit should absorb.

---

## Objective signal
Running the kit's `docs-lint.py` against `PiKaOs-Docs/docs`: **269 problems in 67 docs** —
- **230 broken links** (all in curated docs; 0 in `superpowers/`) — links to code that MOVED during the refactors (`data-model.md` 32, `session-handoff.md` 29, redirectmap/compare docs → plugin code now in separate repos).
- **28 frontmatter** issues — 8× `type: spec` + 6× `status: approved` (not in the vocab), 18 missing keys, 4 plan files with no frontmatter.
- PiKaOs's own `docs-lint` CI is therefore effectively **red** on the `superpowers/` frontmatter today (it skips cross-repo links, so the 230 are hidden in CI but real in a full checkout).

---

## A. DIVERGENCES — conform PiKaOs to the kit

### Fix-KIT-01 — docs-lint is red: fix broken links + frontmatter (P0)
- **230 broken links** from refactor drift — the same doc-rot flagged in the architecture review. Fix the link targets (point at the new plugin-repo paths / `alembic/versions/`), or delete dead links.
- **`superpowers/specs|plans`** use `type: spec` / `status: approved` and plans have no frontmatter. Two clean options: (a) **move `superpowers/` out of `docs/`** (they're SDD process artifacts, not curated knowledge — like the root `.superpowers/`), or (b) add `spec`/`plan` + `approved`/`superseded` to the vocab (→ Propose-KIT-04). Recommend (a) + exclude from the lint walk.
- Evidence: `python3 new-project/kit/docs-lint.py PiKaOs-Docs/docs`.

### Fix-KIT-02 — add `architecture/security.md` (P0, biggest content gap)
- Kit rule 8 "secure by default" + the OWASP MUST table (`kit/new-project-scaffold.md:192-198, 235-254`) require a scaffolded `architecture/security.md`. PiKaOs has **none** — security is scattered (argon2/JWT in `pikaos-dev-rules.md` §2.1/§4, SSRF in `GLOSSARY.md`). Also add a **secure-by-default always-on rule** to `PiKaOs-Docs/CLAUDE.md` (its 9 rules have none) or repoint rule 2 at the new doc.
- Seed it from the kit's table with PiKaOs's per-stack decisions filled in (SQLAlchemy, pydantic, argon2, `net_guard`, `require_perm`) — **the [2026-07-02 hardening plan](2026-07-02-hardening-and-fix-plan.md) + the Core fixes already done are the raw material.**

### Fix-KIT-03 — move router/entry files to the umbrella root (P1)
- Kit: `CLAUDE.md` / `AGENTS.md` / `llms.txt` **MUST** sit at `[Name]-Project/` root (Claude auto-loads from parents; *"bury it and it won't load"* — `new-project-scaffold.md:107-117`). PiKaOs keeps them in `PiKaOs-Docs/` — this breaks parent-walk from `PiKaOs-Core/…` **and contradicts PiKaOs's own** `PiKaOs-Docs/docs/README.md:136` which claims they're at `PiKaOs-Projects/CLAUDE.md`. Their internal paths are already umbrella-root-relative. Move (or symlink) them up.

### Fix-KIT-04 — replace docs-lint with the kit reference (or port 3 checks) (P1)
- PiKaOs's `docs-lint.py` is missing: **code-fence stripping** before link scan (kit `strip_code()`), **balanced-frontmatter** check ("opened `---` never closed"), **same-file anchor** check. Adopt the kit version — BUT keep PiKaOs's cross-repo + template-body handling (that's Propose-KIT-01; merge, don't lose it).

### Fix-KIT-05 — add the missing top-level community/CI files (P1)
- Absent everywhere: **`CHANGELOG.md`** (root; feed it from the existing `templates/unreleased-block.md`), **`.github/SECURITY.md`**, **`CODE_OF_CONDUCT.md`**, **`CONTRIBUTING.md`**, **`.github/dependabot.yml`** (extend to `pip` + `npm` + `docker` + `actions` since PiKaOs has real code), **`.github/workflows/scorecard.yml`** (OpenSSF). Ties to deploy-spec Fix-DEP-01.

### Fix-KIT-06 — SHA-pin all GitHub Actions (P1)
- Kit `SECURITY.md:29` + `scorecard.yml` pin every action by full commit SHA. PiKaOs `ci.yml` and `docs-lint.yml` use mutable tags (`@v5`). Pin them (Dependabot then bumps the SHAs).

### Fix-KIT-07 — compose fragments: drop hardcoded/published host ports (P1) — overlaps Fix-NET-01
- Kit postgres fragment is **internal-by-default, no host port** (`examples/.../postgres/compose.fragment.yml:12-14`), password required via `${POSTGRES_PASSWORD:?}`. PiKaOs `Tools-Postgres` publishes `"5432:5432"`, `Tools-Redis` `"6379:6379"` — hardcoded + host-exposed, violating no-hardcode (rule 2) + ports-registry (rule 3). Drop the default publish (datastore stays on the compose network) or offset + register in `ports.md`. **Same root as the security finding Fix-NET-01.**

### Fix-KIT-08 — fix manifest ↔ doc/schema drift (P2)
- `migrations` field holds a **prose sentence** in Knowledge/AI manifests; kit schema wants a **path**. Put the note in the doc, make the field a path.
- Knowledge manifest omits `kind` but `plugin-architecture.md` §3 documents it as `kind: app` — reconcile. Add explicit `kind: capability` to capability plugins (AI/Auth/Chat/Knowledge).
- `auth` manifest `provides: []` yet it's the identity platform others `consume` (`auth.IdentityProvider`) — declare what it provides.
- Permission-schema relaxation: PiKaOs's copied `manifest.schema.json` drops the kit's mandatory `id`-prefix on permissions, while `plugin-architecture.md` §6 still says they're prefixed and real plugins DO prefix — re-tighten to the kit rule or document the deviation.

### Fix-KIT-09 — re-sync the vendored kit copies (P2)
- `PiKaOs-Docs/docs/new-project/{new-project-scaffold,knowledge-refactorer}.md` = `updated: 2026-06-20`, `principles.html` = `2026-06-27`, vs kit **2026-07-02 (v0.4.1)**. The stale copies miss exactly the rule-8/security material in Fix-KIT-02. Re-sync.

---

## B. PROPOSE — fold PiKaOs innovations back INTO the kit

1. **Propose-KIT-01 — cross-repo-aware docs-lint.** PiKaOs's `docs-lint.py` checks cross-repo links only when the sibling exists on disk (full checkout validates; CI on the docs repo alone skips + reports the skipped count) and skips template *bodies* while still validating their frontmatter. The kit's version false-fails on any `../../OtherRepo/` link. **Merge PiKaOs's cross-repo + template handling into the kit reference** (alongside the kit's 3 stricter checks from Fix-KIT-04) → one canonical multi-repo-ready linter.
2. **Propose-KIT-04 — SDD `spec`/`plan` vocab.** The kit's `type`/`status` vocab has no home for superpowers SDD artifacts (`spec`, `plan`, `status: approved`/`superseded`). Add them (or a documented "process-artifact, not linted" convention).
3. **Bootstrap gate / console-only rotating install code** (`plugin-architecture.md` §0) — first-run install page protected by a code printed only to server stdout, so a zero-datastore Core is safe before any `auth` plugin exists. Kit has zero-datastore Core but no first-run-install security pattern.
4. **Plugin install-lifecycle UI + `plugin_registry` table** (`architecture/plugin-lifecycle-ui.md`) — Available→Installed→Enabled/Disabled→Uninstalled admin surface. Kit describes runtime enable/disable but not the install UI/registry.
5. **Dynamic permission catalog + RBAC-metadata in manifest** + **optional-RBAC degrade-open provider** (`plugin-architecture.md` §0) — catalog = base ∪ installed-plugin perms; enforcement conditional on a bound provider. Reusable DI patterns.
6. **Worked RBAC reference** (`architecture/rbac.md`) — 31-key catalog, 4 roles, deny-wins math, view/manage/delete split, server-enforced vs FE-only map. Kit names IDOR/authz but has no worked RBAC doc.
7. **Deployment + release/rollback + expand/contract migrations** (`architecture/deploy.md`, `release-and-rollback.md`, and the [enterprise deployment spec](2026-07-01-deployment-architecture-design.md) with its **AI guardrails §0 / human-gated prod**). Kit scaffolds `deploy.md` as a stub with no release spec or expand/contract doc — this is strongly kit-worthy.
8. **UAT clean-slate harness** (`architecture/uat-clean-slate.md`) — from-scratch UAT verification. No kit equivalent.
9. **Buy-vs-build dependency audit artifact** (`architecture/dependency-audit.md`) — hand-rolled piece → replacing lib → SWAP/KEEP verdict. Complements reuse-rule 1 + R4.
10. **Repo-consolidation + extraction playbook** (`monorepo-consolidation.md`, `extraction-plan.md`).
11. **Runnable "plugins outside Core, App composes in" harness** (`link-plugins.sh` + `vite preserveSymlinks` + `import.meta.glob` registry + **per-plugin i18n merge** + Docker bind-mount). Kit describes the composition root abstractly; this is the runnable pattern.
12. **Formal-terminology "converge-on-touch" migration convention** (`GLOSSARY.md`).
13. **Two extra always-on rules** the kit lacks: **"verify currency before you build"** (web-check lib/version is current) and **"don't loop"** (stop after ~2 same-approach failures → new hypothesis / ask, record root-cause in `lessons.md`).
14. **A shipped `docs-check` SKILL** wrapping docs-lint (`PiKaOs-Docs/.claude/skills/docs-check/SKILL.md`) — kit prescribes skills but ships none.

---

## C. ALREADY ALIGNED (leave alone)
Frontmatter schema (identical 7 fields + vocab) · job-first docs tree · single thin `CLAUDE.md` router + `AGENTS.md` + `llms.txt` (only their *location* is wrong, Fix-KIT-03) · registries `ports.md`/`versions.md` · process docs R1–R8 · plugin lifecycle + gated promotion · Core+Plugins contract (manifest / topo-loader / 3 channels / id-namespacing / fault isolation / removal-isolation CI) · plugin kinds capability/tool/app + zero-datastore Core · repo-per-plugin naming · import-linter CI gate · English-only prose · docs-lint wired in CI.

---

## PLAN (phased)

### Phase K0 — green the docs (P0, ~half a day)
1. **Fix-KIT-01** — repair/remove the 230 broken links; move `superpowers/` out of `docs/` (or exclude + add SDD vocab).
2. **Fix-KIT-02** — write `architecture/security.md` from the kit table + seed with the hardening findings already produced; add the secure-by-default always-on rule.
- **Gate:** `docs-lint.py` (both kit + PiKaOs versions) exit 0.

### Phase K1 — structure + supply-chain (P1, ~1 day)
3. **Fix-KIT-03** — move `CLAUDE.md`/`AGENTS.md`/`llms.txt` to the umbrella root.
4. **Fix-KIT-04 + Propose-KIT-01** — merge the two docs-lint versions into one (kit's 3 checks + PiKaOs's cross-repo/template handling); update both repos to use it.
5. **Fix-KIT-05** — add CHANGELOG, SECURITY.md, CODE_OF_CONDUCT, CONTRIBUTING, dependabot (pip+npm+docker+actions), scorecard.
6. **Fix-KIT-06** — SHA-pin all actions.
- **Gate:** CI green with the new gates; router auto-loads from `PiKaOs-Core/`.

### Phase K2 — plugin-contract truth-up (P1/P2, ~1 day)
7. **Fix-KIT-07** — compose fragments internal-by-default (dedupe with Fix-NET-01 from the hardening plan).
8. **Fix-KIT-08** — manifest `migrations`=path, explicit `kind`, `auth` provides its contract, re-tighten permission namespacing (or document the deviation).
9. **Fix-KIT-09** — re-sync vendored kit copies.
- **Gate:** manifest schema validation + `plugin-architecture.md` match the real manifests.

### Phase K3 — give back to the kit (when convenient)
Open PRs to `new-project` for Propose-KIT-01/04 first (they directly reduce PiKaOs's own friction), then the higher-value docs (security-adjacent 3–7, deployment 7, harness 11). Keep each generalized with `[Name]` placeholders.

**Dependency note:** Fix-KIT-07 is the same underlying issue as Fix-NET-01 in the hardening plan, and Fix-KIT-02 is seeded by the Core security fixes already shipped — do them together.
