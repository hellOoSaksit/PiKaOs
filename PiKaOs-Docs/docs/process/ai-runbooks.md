---
title: AI runbooks — recurring task playbooks
type: process
status: active
keywords: [runbook, use case, pause resume, handoff, session, move machine, remove lib, dead code, dependency audit, version]
related: [./session-handoff.md, ./playbook.md, ../pikaos-dev-rules.md, ../architecture/tech-stack.md, ../architecture/versions.md]
summary: >
  Step-by-step runbooks for the recurring operational tasks an AI agent hits on this project —
  pause/resume work, start a fresh session / move machine, remove a lib or unused file, audit
  dependencies/versions. Each is trigger → steps → done-check, so execution is deterministic.
updated: 2026-06-20
---

# AI runbooks — recurring task playbooks

The [playbook](playbook.md) is the *general* work loop; this file holds the **specific recurring
tasks** as concrete runbooks (trigger → steps → done-check). Follow the matching one verbatim — they
exist so the same task is done the same safe way every time, by any agent, across sessions.

---

## R1 — Pause a feature/project and resume it later

**Trigger:** stopping mid-feature; will continue in a future session.

**Pause (leave a clean checkpoint):**
1. **Write a [session-handoff](session-handoff.md) Work-status entry** dated today: what's done, what's
   *pending*, the exact next step, and any load-bearing gotcha. This is the resume anchor.
2. **Leave the code runnable or clearly fenced.** Don't commit half-applied edits that break the build;
   if a step is incomplete, mark it with a `TODO(<what>/<why>)` at the spot, and list it in the handoff.
3. **If a plugin moved ahead of main**, record the gap: bump its version (§6.5), add the
   `## Unreleased — pending promotion to main` block ([template](../templates/unreleased-block.md)), and
   update [versions.md](../architecture/versions.md).
4. **Update the owning doc in the same commit** (docs-discipline) so the docs match where you stopped.

**Resume:**
1. Read [session-handoff](session-handoff.md) Work-status (top entry) → the "next step".
2. Read [playbook](playbook.md) + [lessons](lessons.md) (don't repeat past traps).
3. Open only the doc the task needs via the [router](../../../CLAUDE.md) task-router.
4. Re-verify the checkpoint still holds (build/tests/`docs-lint`) before adding new work.

**Done when:** an agent with zero memory can read the handoff and continue without asking.

---

## R2 — Start a fresh session / move to a new machine

**Trigger:** new chat, new clone, or a different computer.

**Orient (read, in order):**
1. [session-handoff](session-handoff.md) — current status + starting prompt.
2. [playbook](playbook.md) + [lessons](lessons.md) — how to work + known traps.
3. [router `CLAUDE.md`](../../../CLAUDE.md) — always-on rules + task-router. Unknown term → [GLOSSARY](../GLOSSARY.md).

**Set up the machine:**
1. Each project is its own git repo under the `PiKaOs-Projects/` umbrella, which is itself a **thin
   meta-repo** — it tracks only the shared root files (`CLAUDE.md` · `AGENTS.md` · `llms.txt` ·
   `.claude/skills`) and **gitignores the child repos** (they have their own remotes; an `.ignore` file
   re-includes them for ripgrep search). Clone what you need.
2. **Env files are gitignored** — copy each `*.example` to its real name (`Backend/.env`, `Frontend/.env`,
   `.env.ai` for main; `.env` for a plugin). Never commit a real `.env` ([§3](../pikaos-dev-rules.md)).
3. **Running the app — ask first** ([§0](../pikaos-dev-rules.md)): _"want me to run it, or will you run
   it yourself?"_ → if you run it, use `start.bat` (main) / `start-*.bat` or `docker compose up -d`
   (plugin); never a backgrounded/hidden dev server. Compile checks + tests don't need to ask.
4. **Check the registries before touching ports/versions** — [ports.md](../architecture/ports.md),
   [versions.md](../architecture/versions.md).

**Done when:** the relevant stack starts from its script and `docs-lint` + tests pass on the new machine.

---

## R3 — Remove a library or an unused file (dead-code cleanup)

**Trigger:** a lib/file/endpoint/field looks unused, or a doc flags it as dead.

**Steps (verify before deleting — never delete blind):**
1. **Find every reference.** `grep` the symbol/file across the **whole** repo (backend + frontend +
   tests + docs): the name, its imports, its route path, its schema. List all hits.
2. **Check for entanglement.** A "dead" thing is often wired into a live path (e.g. a schema also used by
   a live endpoint, an optional param the frontend never sends). Read each caller; confirm the live paths
   don't depend on it. If entangled, map the full unit that must go together.
3. **Confirm truly unused** — no caller, or the only callers are themselves dead. When in doubt, keep it
   and flag, don't guess.
4. **Remove the whole unit in one commit** — code + its schema + its frontend client + its imports + the
   file itself.
5. **Verify:** `py_compile` the touched backend modules (and `npm run build` for frontend); re-`grep` the
   symbols → expect zero residual references.
6. **Update docs in the same commit** (docs-discipline): drop/resolve the item in the owning doc's
   "known issues", and fix any surface/endpoint/file lists that mentioned it.
7. **Removing a *dependency*** (not just a file): also delete it from `requirements.txt`/`package.json`,
   and update [tech-stack.md](../architecture/tech-stack.md) in the same commit (§R4 + the dep policy).

> Worked example (2026-06-20): RedirectMap's dead `/files` endpoint — `files_service.py`, the
> `FilesIn/FileItem/FilesOut` schemas, the `ExportIn.files` param + `_sheet_files` plumbing, and the
> `scanFiles()` client — were entangled with the *live* export path (`ExportIn`/`checklist_xlsx.build`).
> Confirmed the frontend export sends only `{rows}` (never `files`), so the unit was isolatable; removed
> together; `py_compile` clean; docs synced.

**Done when:** zero residual refs, build/compile green, docs updated.

---

## R4 — Audit dependencies / versions

**Trigger:** adding/upgrading a lib, a security/bump request, or a periodic check.

**Steps:**
1. **Read the dep policy first** — [tech-stack.md](../architecture/tech-stack.md) (even "add nothing" is
   recorded). Reuse-before-add ([always-on rule 1](../../../CLAUDE.md)): can an existing lib do it?
2. **App version vs registry** — each app's version is `app_version` in its `config.py` → `/api/health`;
   it must match what the code does and the row in [versions.md](../architecture/versions.md). No version
   literal hardcoded elsewhere (`grep` to confirm).
3. **Plugin deps come FROM main (§6.6).** For a plugin, match each shared lib's **version** to
   main's pin; don't drift. `grep` the dep in main's `requirements.txt`/`package.json` and align.
4. **Upgrade = isolated work.** One major bump per change; run the full check (tests + build); never bundle
   a bump into a feature PR ([tech-stack §4](../architecture/tech-stack.md)).
5. **A shared-lib/engine bump in main must propagate to every plugin that copies it** (§6.6) — same
   commit, plugin version bumped; if it would break a plugin, coordinate or hold, and record the
   gap in [versions.md](../architecture/versions.md).
6. **Update [tech-stack.md](../architecture/tech-stack.md) in the same commit** for any add/remove/bump.

**Done when:** versions are consistent (code ↔ health ↔ registry ↔ main pins), tests/build green, the dep
doc reflects reality.

### Safe upgrade + rollback (the "can't crash the system" loop)

The goal: adopt/bump a library **without** risking a system-down — so we can prefer good maintained libs
over hand-rolled code ([dependency-audit.md](../architecture/dependency-audit.md)) and let upkeep fall on
the library, not us. Rollback is layered, each layer cheap:

1. **Pin = single source of the version** — every dep is `name==X.Y.Z` in `requirements.txt` /
   `package.json`. Reverting a bad upgrade is restoring **one line**.
2. **Branch + one dep at a time** — never bundle a bump with a feature, so a revert is surgical.
3. **The gate is the test suite** — bump → rebuild the image → run **full `pytest` + `vite build` +
   a login/health smoke**. The helper [`scripts/upgrade-dep.sh`](../../../PiKaOs-Core/scripts/upgrade-dep.sh)
   automates it: backs up the pin, applies the new one, rebuilds + tests in docker, and **auto-restores
   the old pin on any failure** — leaving a clean tree. Green → it leaves the change staged for you to commit.
4. **Commit only on green; never push unverified** — CI (`.github/workflows`) re-runs the gate on push as
   a second net. A bump that goes red never lands.
5. **Production rollback = redeploy the previous image tag** (R6 / [versions.md](../architecture/versions.md));
   app data is untouched (the bump is code-only). For a shared lib, propagate to every plugin (§6.6) or
   record the held gap.

**Hard stops:** do NOT adopt a library that is **AGPL, abandoned, or has a recent supply-chain incident**,
regardless of how good it looks (see the audit's risk flags). A documented *locked decision* is overridden
only with explicit approval.

**Done (upgrade):** the bump is on its own commit, the full gate is green locally + in CI, tech-stack.md +
versions.md are updated, and the one-line rollback path is obvious.

---

## R5 — Production incident & rollback

**Trigger:** a deploy/change broke a running stack, or a migration went bad.

**Steps (restore first, diagnose second):**
1. **Find the bad change** — the last deploy / commit / migration. Check `/api/health` + logs (Docker
   Desktop or `docker compose -p <stack> logs -f`).
2. **Roll back fast** — redeploy the last-good image/commit (`git checkout <good>` → rebuild the stack);
   restore service *before* debugging. Don't root-cause in a broken prod.
3. **Bad migration** — `alembic downgrade -1` **only if** the migration is reversible with no data loss;
   if it's data-destructive, restore from backup instead. Revert [data-model.md](../architecture/data-model.md)
   to match if the schema rolled back.
4. **Hotfix** — smallest safe change on a branch → verify (tests + build + `docs-lint`) → deploy →
   backport to `develop`.
5. **Record it** — a [lessons.md](lessons.md) entry (what broke · root cause · fix · guard added) + a
   [session-handoff](session-handoff.md) note. If a plugin↔main divergence (§6.4/§6.6) caused it, note
   it in [versions.md](../architecture/versions.md). Add a CI guard if one would have caught it.

**Done when:** service restored, root cause in lessons.md, a guard added where possible.

---

## R6 — Release / deploy / promote to Production

**Trigger:** cut a version, deploy, or promote a plugin into main.

**Steps:**
1. **Pre-flight (all green):** tests + build + [`docs-lint`](../../scripts/docs-lint.py); version bumped
   and [versions.md](../architecture/versions.md) updated (§6.5); no uncommitted `.env`/secrets; prod
   guard refuses dev defaults in `ENVIRONMENT=production` ([§3](../pikaos-dev-rules.md)).
2. **Promoting a plugin → main** (only on explicit approval, §6.5): re-gate auth, re-attach
   shell/nav/RBAC/i18n, move settings to the tools screen + DB, fold the schema (+ data-model.md), dedupe
   the shared engine (§6.4), drop dead code; bump **main**'s version; clear the plugin's `Unreleased`.
3. **Deploy** per [deploy.md](../architecture/deploy.md) (4-stack / split servers); migrations run on
   boot (`alembic upgrade head` → seed). Bring stacks up in order via the start script.
4. **Verify live** — health endpoints + a smoke check of the changed path (not just "container up").
5. **Record** — a [session-handoff](session-handoff.md) entry; keep the rollback path ([R5](#r5--production-incident--rollback)) ready.

**Done when:** live + smoke-verified + recorded, with a known rollback.

---

## R7 — Expose an open (no-login) plugin safely

**Trigger:** putting a plugin on a shared network / the internet. **The plugin line drops login
by contract (§6)** — the app itself is open, so the boundary is yours to add.

**Steps:**
1. **Put a boundary in front** — a reverse proxy with auth (Basic/SSO) or a network limit (VPN / IP
   allowlist). Never expose the bare app.
2. **SSRF guard ON** — confirm `*_SSRF_BLOCK_PRIVATE=true`; set the URL allowlist if it should only reach
   known hosts (`net_guard`). Never expose with the guard off.
3. **Lock CORS** — `CORS_ORIGINS` = the real frontend origin, never `*`.
4. **Secrets** — per-host target creds ride on the request only (never persisted/logged); no committed
   `.env`.
5. **Rate-limit** at the proxy if it's public (the app has no built-in limiter).
6. **On merge into main** — drop this external gate and use the main app's RBAC instead (§6.5;
   [compare-hardening.md](../features/compare-hardening.md) for the threat model).

**Done when:** the open app sits behind an auth/network boundary, SSRF on, CORS locked.

---

## R8 — Create / manage a skill (`.claude/skills/<name>/SKILL.md`)

**Trigger:** the same multi-step workflow gets invoked **repeatedly** (rule of thumb ≥ ~3 times), OR
it's high-value + error-prone + would benefit from one-command invocation, OR you judge a recurring task
should be a one-tap `/command`. A one-off or a trivial single command is **not** a skill.

**Steps:**
1. **Confirm it earns a skill** — recurring + multi-step + benefits from a stable named entry. If it has
   a [runbook](#) (R#), the skill should **wrap** it, not restate it.
2. **Create `.claude/skills/<name>/SKILL.md`** at the umbrella root with frontmatter `name` +
   `description`. The **`description` is the trigger** — write WHEN to use it, so the agent (and the
   Skill tool) picks it correctly. Keep the body **thin**: the steps, and links to the owning
   runbook/doc/script — **don't duplicate logic** (single source of truth).
3. **It's invocable as `/<name>`** via the Skill tool. Point it at the script/doc that does the work.
4. **Keep it current** — if the underlying runbook/script changes, update the skill (docs-discipline).
   If it becomes load-bearing, add a row where it's discoverable.

> First example: **`docs-check`** ([`.claude/skills/docs-check/SKILL.md`](../../../.claude/skills/docs-check/SKILL.md))
> wraps `scripts/docs-lint.py` — created because the docs-lint run recurred many times. A runbook is the
> *steps*; a skill is the *invocable entry* — promote a frequently-run runbook into a skill.

## Adding a runbook

A recurring task that an agent keeps re-deriving → add an `R#` here (trigger → steps → done-check),
link it from the relevant rule, and add a row to the [docs index](../README.md) process table if it
becomes load-bearing. Keep each runbook to what's **non-obvious + safety-critical**; the general loop
stays in [playbook.md](playbook.md).
