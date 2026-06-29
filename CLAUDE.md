# CLAUDE.md — PiKaOs-Projects (shared router for all projects)

The **single CLAUDE.md** for everything under `PiKaOs-Projects/`. Every project
([`PiKaOs-Core/`](PiKaOs-Core), [`PiKaOs-Docs/`](PiKaOs-Docs), [`PiKaOs-Plugin/`](PiKaOs-Plugin))
shares these rules. This is a **thin router**: durable always-on rules + a map into the
doc that owns each topic. Read it, then open **only** the doc your task needs (progressive
disclosure) — don't load the whole knowledge base.

> **Repo layout (hard rule).** `PiKaOs-Projects/` is the **public monorepo** — `PiKaOs-Core/` and
> `PiKaOs-App/` are plain **folders** in it (their old separate git repos were collapsed in; plugin
> isolation is enforced by the CI gates, not by repo boundaries). Two things stay **separate git repos**,
> gitignored + nested: **`PiKaOs-Docs/` is PRIVATE** (internal-only knowledge — never in the public repo),
> and the **own-app plugins** under `PiKaOs-Plugin/` (Compare, RedirectMap) are public, own remotes + deploy.
>
> **Where things live (hard rule).** Project **knowledge → `docs/` only** (centralized in
> [`PiKaOs-Docs/docs/`](PiKaOs-Docs/docs)). Each project folder's **`README.md` is for GitHub** — what
> the project is, for humans browsing it — **never** project knowledge. **This file is the only
> CLAUDE.md** — don't re-create per-folder ones; Claude Code auto-loads this from any sub-folder by
> walking up to the monorepo root.

---

## Always-on rules (every project, every task)

1. **Reuse before you build (hard rule).** Never open a task by writing something new. First
   find an existing component / helper / service / pattern / setting to **reuse or extend**
   (search the codebase + read the owning doc); create new only when nothing fits — then
   completely, per the section that owns it. The **smallest change that fits the existing
   design** beats a fresh implementation.
2. **No hardcode — config-driven (hard rule).** System settings are editable from the
   **"จัดการเครื่องมือ"** tools screen + DB, not baked into `.env`/frontend. Don't scatter
   literals; read/extend the file or setting that owns the value.
   **Secrets & keys — any source (hard rule, applies to you the agent).** Treat every credential
   (API key, token, password, private key, connection string) as sensitive **wherever it appears** —
   `.env`, a config file, `.mcp.json`, a pasted chat snippet, a notebook, command output. **Never**
   print / echo / log / paste a real key value back (redact to `****`, keep ≤ last 4 chars); **never**
   hardcode one in code or docs; **never** commit one (only `*.example` placeholders). Real values live
   **only** in gitignored env files (or a secret manager) and are read via config — `Frontend/.env`
   (`VITE_*`) ships to the browser, so a real secret must never go there. If you find a key that is
   committed, logged, or in the frontend bundle: **stop, flag it, treat it as compromised → rotate** —
   don't keep using it. Detail: [pikaos-dev-rules §3](PiKaOs-Docs/docs/pikaos-dev-rules.md).
3. **Registries — read first, update same commit (hard rule).** Single sources of truth the whole
   system reads before acting: **[ports.md](PiKaOs-Docs/docs/architecture/ports.md)** (host ports —
   main `5173/8000`, Compare `5174/8001`, RedirectMap `5175/8002`, …) and
   **[versions.md](PiKaOs-Docs/docs/architecture/versions.md)** (app versions + UAT↔Production drift).
   Read the relevant one before adding/changing/needing a port or bumping/promoting a version; never
   reuse a port; update the registry in the same commit as the change.
4. **Running an app — ask first, every time (hard rule).** Before launching/serving any app or stack,
   **ask: _"Want me to run it, or will you run it yourself?"_** and wait. If the user says you run it →
   the **start script** ([`start.bat`](PiKaOs-Core/start.bat) / `start-*.bat`) or `docker compose up -d`
   **only** — never a hidden/backgrounded `npm run dev`/`vite`/detached dev server. (Compile checks +
   tests don't need to ask.) Detail: [pikaos-dev-rules §0](PiKaOs-Docs/docs/pikaos-dev-rules.md).
5. **Docs discipline.** New knowledge → the doc that owns it under `PiKaOs-Docs/docs/`
   (1 file = 1 concept; spin a section to its own `.md` when it grows). README stays a
   GitHub overview; this router stays thin. Update the doc + its index in the same commit.
6. **`.md` are written in English (hard rule).** All docs/rules are AI-first — English keeps
   them token-cheap and unambiguous. Thai stays only where it's *content* (UI strings, seed
   data, chat, quoted user text), never for doc prose.
7. **Code clarity — write for the next reader (hard rule).** Code is read far more than written;
   optimize for the human/AI who reads it next, not for cleverness. **Clean-code defaults:** small
   single-purpose functions, intention-revealing names, shallow nesting (early-return over deep
   `if/else`), no duplication — but don't over-abstract; the **simplest thing that works (KISS)**.
   **Comments explain *why*** (intent · trade-off · gotcha), never restate *what* the code already
   shows; delete stale comments. **Match the file you're in** — its naming, structure, and comment
   density (consistency over personal taste). Code + code-comments in **English**.
8. **Verify currency before you build (hard rule).** Your training is stale and stacks drift — so the
   moment you'd introduce something new from memory (a library, a package **version**, an external API,
   config/CLI syntax, or a "best-practice" pattern), **search the web first** and confirm it is **current**
   (not deprecated/renamed/EOL — check the latest stable release + that it's still maintained) and
   **stable** (a real release, not alpha/RC or a churning API), then follow what the *current* official
   docs endorse. Only then write — never hand-roll from unverified memory. Pairs with rule 1: reuse first,
   and when you must build new, build on what's current. Record the source + chosen version where the
   choice isn't obvious (→ [versions.md](PiKaOs-Docs/docs/architecture/versions.md) / tech-stack). For
   dependencies this is the [tech-stack §4](PiKaOs-Docs/docs/architecture/tech-stack.md) policy. If you
   **can't reach the web or can't confirm**, say so — **don't assume it's current** (no-invention).
9. **Don't loop — stop & record when a fix isn't working (hard rule).** A *dev loop* = doing the same
   thing again (same edit, same retry, same build/test/error) when it **isn't fixing the problem**. After
   **~2 failed tries of the same approach, STOP** — don't repeat it. Step back: re-read the actual error,
   form a *different* hypothesis, research it (rule 8), or **ask the user** rather than thrash and burn
   tokens. Then **record the problem → root cause → fix in
   [lessons.md](PiKaOs-Docs/docs/process/lessons.md)** in the same commit, and **read lessons.md before**
   starting related work — so the same problem is never re-debugged from scratch.

---

## Projects map

| Project | What it is | GitHub README | Deep docs |
|---|---|---|---|
| [`PiKaOs-Core/`](PiKaOs-Core) | Main app — Vite+React `Frontend/`, FastAPI `Backend/`, 4-stack `deploy/` | [README](PiKaOs-Core/README.md) | [pikaos-dev-rules.md](PiKaOs-Docs/docs/pikaos-dev-rules.md) + [docs/](PiKaOs-Docs/docs/README.md) |
| [`PiKaOs-Docs/`](PiKaOs-Docs) | Central knowledge ( [`docs/`](PiKaOs-Docs/docs) ) + static [`design-system/`](PiKaOs-Docs/design-system) (not built) | [README](PiKaOs-Docs/README.md) | [docs/README.md](PiKaOs-Docs/docs/README.md) · [design guide](PiKaOs-Docs/design-system/Design%20System/README.md) |
| [`PiKaOs-Plugin/PiKaOs-Compare/`](PiKaOs-Plugin/PiKaOs-Compare) | Compare (UAT vs Prod) extracted as its own app — ports `5174/8001` | [README](PiKaOs-Plugin/PiKaOs-Compare/README.md) | [features/compare.md](PiKaOs-Docs/docs/features/compare.md) |
| [`PiKaOs-Plugin/PiKaOs-RedirectMap/`](PiKaOs-Plugin/PiKaOs-RedirectMap) | RedirectMap extracted as its own app — ports `5175/8002` | [README](PiKaOs-Plugin/PiKaOs-RedirectMap/README.md) | [plugin/redirectmap/](PiKaOs-Docs/docs/plugin/redirectmap/README.md) |

> **New session?** Start at [docs/README.md](PiKaOs-Docs/docs/README.md) →
> [session-handoff](PiKaOs-Docs/docs/process/session-handoff.md) →
> [playbook](PiKaOs-Docs/docs/process/playbook.md) + [lessons](PiKaOs-Docs/docs/process/lessons.md),
> then this router for the rules + the map below. Unfamiliar term? →
> [GLOSSARY](PiKaOs-Docs/docs/GLOSSARY.md).

---

## Task router (PiKaOs) — find the rule + the owning doc, then act

Full rules: **[pikaos-dev-rules.md](PiKaOs-Docs/docs/pikaos-dev-rules.md)** (§-numbers below
point into it). Match your task → read what it points to **first**, then work.

| You're asked to… | Read first |
|---|---|
| Run / serve the app | **§0** — **ask first** ("I run it, or you?"), then `start.bat` / `docker compose up -d` |
| Allocate / change a host port (any app) | **§3** + [ports.md](PiKaOs-Docs/docs/architecture/ports.md) |
| Add / extend a UI component | **§1.1** + [`screens-library.jsx`](PiKaOs-Core/Frontend/src/screens/screens-library.jsx) |
| Add / change UI text | **§1.2** (i18n) |
| Touch login / session | **§1.3** (client) + **§4** (flow) |
| Style / theme / tokens | **§1.4** + [design guide](PiKaOs-Docs/design-system/Design%20System/README.md) |
| Work in a big screen (world/extra/secondary) | **§1.6** (barrels) |
| Touch the 3D room / avatars / life-sim | [room-3d.md](PiKaOs-Docs/docs/features/room-3d.md) |
| Add / change a backend endpoint | **§2.1** (layering) + **§2.2** (recipe) |
| Change the DB schema | **§2.3** (migrations) + update [data-model.md](PiKaOs-Docs/docs/architecture/data-model.md) |
| Design a schema / decide whether to **split a DB** | [database-design.md](PiKaOs-Docs/docs/architecture/database-design.md) (clarity + performance + split-on-bounded-context) |
| Pause/resume · new session/move machine · remove a lib/file · audit deps · incident/rollback · release/deploy · expose a plugin · create a skill | [ai-runbooks.md](PiKaOs-Docs/docs/process/ai-runbooks.md) (R1–R8) |
| Build a **big new feature** / start or extract a **plugin** app | **§6** + [plugin/README.md](PiKaOs-Docs/docs/plugin/README.md) — build plugin-first · drop login · own DB+Docker if stateful · re-integration-ready |
| **Bump a version** / **promote** a plugin into main | **§6.4–§6.5** + [versions.md](PiKaOs-Docs/docs/architecture/versions.md) (UAT↔Prod; promote only on explicit approval) |
| Look up a **domain term** | [GLOSSARY.md](PiKaOs-Docs/docs/GLOSSARY.md) |
| Start a **new doc** (feature / plugin / changelog) | [templates/](PiKaOs-Docs/docs/templates/README.md) (copy-to-create + frontmatter standard) |
| Work on Compare (UAT vs Prod) | [compare.md](PiKaOs-Docs/docs/features/compare.md) |
| Work on Sitemap-generate / checklist-audit | [sitemap-generate.md](PiKaOs-Docs/docs/features/sitemap-generate.md) · [checklist-audit.md](PiKaOs-Docs/docs/features/checklist-audit.md) |
| Add / extend seed or app data | **§5** |

---

## Maintaining this router

The **operating contract** — only non-obvious, load-bearing rules + *why*; imperative +
specific; link the source of truth, don't duplicate; scannable (tables, `(hard rule)`);
runnable as written (`[file](path)` links); keep current, delete dead rules. **Keep it thin**
— detail belongs in the owning `docs/` file, not here. Paths in this file are relative to
`PiKaOs-Projects/` (the umbrella folder); paths inside a doc are relative to that doc.
