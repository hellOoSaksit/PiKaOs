# CLAUDE.md — PiKaOs-Projects (shared router for all projects)

The **single CLAUDE.md** for everything under `PiKaOs-Projects/`. Every project
([`PiKaOs/`](PiKaOs), [`PiKaOs-docs/`](PiKaOs-docs), [`PiKaOs-Standalone/`](PiKaOs-Standalone))
shares these rules. This is a **thin router**: durable always-on rules + a map into the
doc that owns each topic. Read it, then open **only** the doc your task needs (progressive
disclosure) — don't load the whole knowledge base.

> **Where things live (hard rule).** Project **knowledge → `docs/` only** (centralized in
> [`PiKaOs-docs/docs/`](PiKaOs-docs/docs)). Each repo's **`README.md` is for GitHub** — what
> the project is, for humans browsing the repo — **never** project knowledge. **This file is
> the only CLAUDE.md** — don't re-create per-repo ones; Claude Code auto-loads this from any
> sub-project by walking up to the umbrella root.

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
   don't keep using it. Detail: [pikaos-dev-rules §3](PiKaOs-docs/docs/pikaos-dev-rules.md).
3. **Registries — read first, update same commit (hard rule).** Single sources of truth the whole
   system reads before acting: **[ports.md](PiKaOs-docs/docs/architecture/ports.md)** (host ports —
   main `5173/8000`, Compare `5174/8001`, RedirectMap `5175/8002`, …) and
   **[versions.md](PiKaOs-docs/docs/architecture/versions.md)** (app versions + UAT↔Production drift).
   Read the relevant one before adding/changing/needing a port or bumping/promoting a version; never
   reuse a port; update the registry in the same commit as the change.
4. **Running an app — ask first, every time (hard rule).** Before launching/serving any app or stack,
   **ask: _"Want me to run it, or will you run it yourself?"_** and wait. If the user says you run it →
   the **start script** ([`start.bat`](PiKaOs/start.bat) / `start-*.bat`) or `docker compose up -d`
   **only** — never a hidden/backgrounded `npm run dev`/`vite`/detached dev server. (Compile checks +
   tests don't need to ask.) Detail: [pikaos-dev-rules §0](PiKaOs-docs/docs/pikaos-dev-rules.md).
5. **Docs discipline.** New knowledge → the doc that owns it under `PiKaOs-docs/docs/`
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

---

## Projects map

| Project | What it is | GitHub README | Deep docs |
|---|---|---|---|
| [`PiKaOs/`](PiKaOs) | Main app — Vite+React `Frontend/`, FastAPI `Backend/`, 4-stack `deploy/` | [README](PiKaOs/README.md) | [pikaos-dev-rules.md](PiKaOs-docs/docs/pikaos-dev-rules.md) + [docs/](PiKaOs-docs/docs/README.md) |
| [`PiKaOs-docs/`](PiKaOs-docs) | Central knowledge ( [`docs/`](PiKaOs-docs/docs) ) + static [`design-system/`](PiKaOs-docs/design-system) (not built) | [README](PiKaOs-docs/README.md) | [docs/README.md](PiKaOs-docs/docs/README.md) · [design guide](PiKaOs-docs/design-system/Design%20System/README.md) |
| [`PiKaOs-Standalone/PikaOS-Compare/`](PiKaOs-Standalone/PikaOS-Compare) | Compare (UAT vs Prod) extracted as its own app — ports `5174/8001` | [README](PiKaOs-Standalone/PikaOS-Compare/README.md) | [features/compare.md](PiKaOs-docs/docs/features/compare.md) |
| [`PiKaOs-Standalone/PikaOS-RedirectMap/`](PiKaOs-Standalone/PikaOS-RedirectMap) | RedirectMap extracted as its own app — ports `5175/8002` | [README](PiKaOs-Standalone/PikaOS-RedirectMap/README.md) | [standalone/redirectmap/](PiKaOs-docs/docs/standalone/redirectmap/README.md) |

> **New session?** Start at [docs/README.md](PiKaOs-docs/docs/README.md) →
> [session-handoff](PiKaOs-docs/docs/process/session-handoff.md) →
> [playbook](PiKaOs-docs/docs/process/playbook.md) + [lessons](PiKaOs-docs/docs/process/lessons.md),
> then this router for the rules + the map below. Unfamiliar term? →
> [GLOSSARY](PiKaOs-docs/docs/GLOSSARY.md).

---

## Task router (PiKaOs) — find the rule + the owning doc, then act

Full rules: **[pikaos-dev-rules.md](PiKaOs-docs/docs/pikaos-dev-rules.md)** (§-numbers below
point into it). Match your task → read what it points to **first**, then work.

| You're asked to… | Read first |
|---|---|
| Run / serve the app | **§0** — **ask first** ("I run it, or you?"), then `start.bat` / `docker compose up -d` |
| Allocate / change a host port (any app) | **§3** + [ports.md](PiKaOs-docs/docs/architecture/ports.md) |
| Add / extend a UI component | **§1.1** + [`screens-library.jsx`](PiKaOs/Frontend/src/screens/screens-library.jsx) |
| Add / change UI text | **§1.2** (i18n) |
| Touch login / session | **§1.3** (client) + **§4** (flow) |
| Style / theme / tokens | **§1.4** + [design guide](PiKaOs-docs/design-system/Design%20System/README.md) |
| Work in a big screen (world/extra/secondary) | **§1.6** (barrels) |
| Touch the 3D room / avatars / life-sim | [room-3d.md](PiKaOs-docs/docs/features/room-3d.md) |
| Add / change a backend endpoint | **§2.1** (layering) + **§2.2** (recipe) |
| Change the DB schema | **§2.3** (migrations) + update [data-model.md](PiKaOs-docs/docs/architecture/data-model.md) |
| Design a schema / decide whether to **split a DB** | [database-design.md](PiKaOs-docs/docs/architecture/database-design.md) (clarity + performance + split-on-bounded-context) |
| Pause/resume · new session/move machine · remove a lib/file · audit deps · incident/rollback · release/deploy · expose a standalone · create a skill | [ai-runbooks.md](PiKaOs-docs/docs/process/ai-runbooks.md) (R1–R8) |
| Build a **big new feature** / start or extract a **standalone** app | **§6** + [standalone/README.md](PiKaOs-docs/docs/standalone/README.md) — build standalone-first · drop login · own DB+Docker if stateful · re-integration-ready |
| **Bump a version** / **promote** a standalone into main | **§6.4–§6.5** + [versions.md](PiKaOs-docs/docs/architecture/versions.md) (UAT↔Prod; promote only on explicit approval) |
| Look up a **domain term** | [GLOSSARY.md](PiKaOs-docs/docs/GLOSSARY.md) |
| Start a **new doc** (feature / standalone / changelog) | [templates/](PiKaOs-docs/docs/templates/README.md) (copy-to-create + frontmatter standard) |
| Work on Compare (UAT vs Prod) | [compare.md](PiKaOs-docs/docs/features/compare.md) |
| Work on Sitemap-generate / checklist-audit | [sitemap-generate.md](PiKaOs-docs/docs/features/sitemap-generate.md) · [checklist-audit.md](PiKaOs-docs/docs/features/checklist-audit.md) |
| Add / extend seed or app data | **§5** |

---

## Maintaining this router

The **operating contract** — only non-obvious, load-bearing rules + *why*; imperative +
specific; link the source of truth, don't duplicate; scannable (tables, `(hard rule)`);
runnable as written (`[file](path)` links); keep current, delete dead rules. **Keep it thin**
— detail belongs in the owning `docs/` file, not here. Paths in this file are relative to
`PiKaOs-Projects/` (the umbrella folder); paths inside a doc are relative to that doc.
