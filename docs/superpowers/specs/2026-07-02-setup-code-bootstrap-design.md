# Console-only rotating setup code — design

**Date:** 2026-07-02
**Status:** approved, scoped narrowly (see Non-goals)
**Scope:** `PiKaOs-Core/Backend` only. Implements the backend half of the "bootstrap gate" decision in
[plugin-architecture.md §0](../../../PiKaOs-Docs/docs/architecture/plugin-architecture.md) — the
Jupyter-token-style console code that protects the first-run install page before any `auth` plugin
exists. The frontend (`FirstRun.jsx`, `api.js` `setupStatus()`/`verifySetupCode()`) already expects
this contract and is otherwise untouched.

## Why

The frontend first-run screen has shipped since an earlier session, calling `GET /api/setup/status`
and `POST /api/setup/verify-code` — both currently 404 (confirmed: neither `app/core/routers/setup.py`
nor `app/core/setup_state.py` exist; only forward-reference comments in `identity.py`/`contracts.py`/
`composition.py` point at them). Separately, the user reported not being able to find the code in
`docker compose logs` — it was never generated or printed at all.

## Code format

`PIKA-XXXX-XXXX` — 8 symbols drawn from a 32-character safe alphabet (`23456789ABCDEFGHJKMNPQRSTVWXYZ`,
excluding `0/O/1/I/L` to avoid misreads off a terminal). ~40 bits of entropy (32^8 ≈ 1.1×10^12
combinations) — the code rotates every container restart, so brute-forcing it within one boot's
lifetime is not practical; no separate rate-limit is added for this narrow scope (see Non-goals).
Generated with `secrets.choice` (cryptographic RNG, not `random`).

## Generation — once per container boot, before uvicorn starts

**Problem:** the backend runs `--workers 4` in production (`WEB_CONCURRENCY`) — 4 separate OS
processes. Generating the code inside `app/main.py` (import time) would give each worker a different
code, and an operator would have no way to know which one is "the" code.

**Fix:** generate it exactly once, in the entrypoint, before any uvicorn worker spawns — the same
pattern already used for `scripts/compute_enabled.py` (resolve ENABLED_MODULES) and
`scripts/migrate_plugins.py` (run once, sequentially, ahead of `exec uvicorn ...`).

New `Backend/scripts/generate_setup_code.py`:
1. Read `ENABLED_MODULES` from the environment (already resolved by `compute_enabled.py`, which runs
   immediately before this in `docker-entrypoint.sh`).
2. If `"auth"` is in the enabled set: the bootstrap gate is moot (real login exists) — clear any stale
   `setup_code` key from kernel state and exit without printing anything.
3. Otherwise: generate a code, write it to kernel state (`kernel_state.write_json("setup_code", {"code":
   <code>})` — the same JSON-file mechanism already used for the plugin registry, so every worker
   process reads the identical value), and print the boxed banner to stdout.

`docker-entrypoint.sh` calls `python -m scripts.generate_setup_code` right after the `compute_enabled`
step (so it knows the resolved `ENABLED_MODULES`) and before the `if [ -n "${UVICORN_RELOAD}" ]` branch
that execs uvicorn.

## Log display

Box-drawing characters (`═`), fixed 64-column width, code line centered:

```
════════════════════════════════════════════════════════════════
   PiKaOs — First-run setup required

              PIKA-7F3A-K9QD

   Paste this code into the setup screen.
   It rotates on every container restart.
════════════════════════════════════════════════════════════════
```

Printed with a plain `print()` (not the `logging` module) — this must reach stdout unconditionally and
unfiltered, on its own lines, regardless of any log-level/formatter configuration (including the
access-log health-check filter added earlier this session — that filter only touches
`uvicorn.access`, but the banner living outside the logging system entirely removes any doubt).

## API — `Backend/app/core/routers/setup.py` (new)

Mounted in the Base "core" module (`app/modules.py`, alongside `plugins.router`/`settings_config.router`
— always on, not gated by `ENABLED_MODULES`). Both routes are public (`auth: false` on the frontend
already reflects this) — by definition, nothing is authenticated yet at this stage.

- **`GET /api/setup/status`** → `{"needsSetup": bool}`. `needsSetup` is true iff kernel state has a
  `setup_code` entry (i.e., generation didn't skip it for an already-installed `auth`).
- **`POST /api/setup/verify-code`** body `{"code": str}` → `200 {"ok": true}` on match, `401` on
  mismatch or when no code exists (nothing to verify against). Comparison is case-insensitive
  (uppercases both sides — the frontend input has `autoCapitalize="characters"` but a pasted value
  could be lowercase) and constant-time (`hmac.compare_digest`) to avoid a timing side-channel.
  **No side effect** — this release doesn't wire what happens after a successful verify (see
  Non-goals); the endpoint only answers the yes/no question the frontend already expects.

## Testing

- `tests/test_setup_code.py`: `generate_setup_code` module — code format/alphabet, skip-when-auth-
  enabled, kernel-state round-trip. Router tests via `TestClient` — status reflects kernel state,
  verify-code accepts the right code, rejects a wrong one, rejects when no code is set, case-
  insensitive match.
- Manual: `docker compose down -v && docker compose up -d --build` (clean-slate per
  `uat-clean-slate.md`), confirm the boxed code appears exactly once in `docker compose logs backend`,
  `curl /api/setup/status` reflects `needsSetup: true`, `curl -X POST /api/setup/verify-code` with the
  real code returns 200, a wrong code returns 401.

## Non-goals (this pass)

- Wiring `App.jsx`'s `onVerified` to actually reach an install/Modules page — kernel-only mode has no
  reachable destination yet (tracked separately, not started).
- A dedicated rate-limiter/lockout on `verify-code` — the code's entropy already makes brute-forcing it
  within one boot's lifetime impractical; general endpoint rate-limiting is the broader `Fix-SEC-02`
  initiative (`docs/superpowers/specs/2026-07-02-hardening-and-fix-plan.md`), out of scope here.
- Rotating the code on page refresh / logout (the literal wording in plugin-architecture.md §0) — traded
  for rotate-once-per-boot to keep the code identical across all `WEB_CONCURRENCY` worker processes
  without adding cross-process coordination. Still ephemeral (changes every restart), still matches the
  Jupyter-token security property this pattern is modeled on.
