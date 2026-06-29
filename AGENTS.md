# AGENTS.md — entry point for AI agents (tool-agnostic)

This repo's operating contract for **any** AI agent lives in **[CLAUDE.md](CLAUDE.md)** (the single
shared router for every project under `PiKaOs-Projects/`). Read it first — it holds the always-on
rules + a task router into the owning docs.

**Start here, in order:**
1. [CLAUDE.md](CLAUDE.md) — always-on rules + the task router (find the rule + the owning doc, then act).
2. [PiKaOs-Docs/docs/README.md](PiKaOs-Docs/docs/README.md) — the docs map (progressive disclosure).
3. [PiKaOs-Docs/docs/GLOSSARY.md](PiKaOs-Docs/docs/GLOSSARY.md) — domain terms.
4. [PiKaOs-Docs/docs/process/session-handoff.md](PiKaOs-Docs/docs/process/session-handoff.md) — current status.

**Registries (read before reserving anything):**
[ports.md](PiKaOs-Docs/docs/architecture/ports.md) (host ports) ·
[versions.md](PiKaOs-Docs/docs/architecture/versions.md) (app versions / UAT↔Production drift).

**Hard rules in one breath:** reuse before you build · no hardcoded settings (config-driven) · read the
port + version registries first · run apps via their start script (never a backgrounded dev server) ·
docs in English, 1 file = 1 concept, update the owning doc in the same commit · **verify a lib/version/API
is current + stable on the web before building from memory** · **don't loop** — stop after ~2 failed
same-approach tries and record the problem→fix in `lessons.md`. Full text: [CLAUDE.md](CLAUDE.md).

> This file is a thin pointer so non-Claude agents find the router; **knowledge is not duplicated here.**
> The detail lives in `PiKaOs-Docs/docs/`.
