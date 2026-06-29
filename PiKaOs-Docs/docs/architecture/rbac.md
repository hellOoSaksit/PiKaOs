---
title: RBAC — permissions, roles, and the split model
type: architecture
status: built
keywords: [rbac, permissions, roles, require_perm, can, effective perms, deny wins, granularity, split]
related: [./data-model.md, ./risk-mitigation.md, ../pikaos-dev-rules.md]
summary: >
  The as-built access-control model: the permission catalog, the four roles, how effective perms
  resolve (role ∪ grants − denies, deny wins, admin = all), where it is actually enforced
  (server require_perm vs frontend can()), and which coarse permissions were/can be split finer.
updated: 2026-06-22
---

# RBAC — permissions, roles, and the split model

PiKaOs access control is **permission-based**, not role-based at the call site: every guarded
action checks a single permission key (e.g. `codex.delete`); roles are just named bundles of those
keys. **The server is the source of truth** (risk-mitigation §2) — the frontend mirrors the same
seed only for instant UI feedback.

## The model

`effective = role's default perms ∪ per-user grants − per-user denies` — **a deny always wins over a
grant**, and the `admin` role implicitly holds **every** permission in the catalog (no explicit
rows). Backend resolution + Redis cache live in
[`services/rbac_service.py`](../../../PiKaOs-Core/Backend/app/services/rbac_service.py)
(`resolve_perms` is pure → unit-testable; `get_effective_perms` caches `perms:<user_id>`, dropped by
`invalidate()` on any role/override change). The same math is mirrored client-side in
[`data-users.jsx`](../../../PiKaOs-Core/Frontend/src/data/data-users.jsx) `resolvePerms()`.

A guard is a one-line dependency:
`@router.post(..., dependencies=[Depends(require_perm("agent.create"))])`
([`deps.py`](../../../PiKaOs-Core/Backend/app/deps.py) `require_perm`). The frontend gate is `can(k)`
in [`App.jsx`](../../../PiKaOs-Core/Frontend/src/App.jsx) (`can = (k) => mePerms.has(k)`).

## Enforcement reality (important)

Only the document/LLM/storage edges have **real server-side** `require_perm` guards today
(`codex.*`, `llm.*`, `infra.manage`). The other ~24 permissions are **frontend-only gates** —
agents / rooms / users / roles / quests are still localStorage-driven with no backend write
endpoints yet. So splitting a frontend-only permission is cheap now (no backend wiring), but stays
cosmetic until the matching backend endpoint exists. New write endpoints must add `require_perm`
(server = source of truth).

## Permission catalog (31 keys / 6 groups)

Source of truth: backend [`scripts/seed.py`](../../../PiKaOs-Core/Backend/scripts/seed.py)
`SEED_PERMISSIONS`, mirrored in [`data-users.jsx`](../../../PiKaOs-Core/Frontend/src/data/data-users.jsx)
`PERMISSIONS`. Seed is idempotent — re-running adds missing perm/role-perm rows.

| Group | Keys | Server-enforced? |
|---|---|---|
| **Agents** (9) | `agent.create` · `agent.appearance` · `character.manage` · `options.manage` · `rules.manage` · `agent.config` · `profile.manage` · `agent.edit.any` · `agent.delete.any` | FE-only (no BE endpoint yet) |
| **Work** (2) | `quest.run` · `task.delete` | FE-only |
| **Knowledge** (3) | `codex.view` · `codex.manage` · `codex.delete` | ✅ all three ([knowledge.py](../../../PiKaOs-Core/Backend/app/routers/knowledge.py)) |
| **Workflows** (1) | `workflow.manage` | FE-only |
| **Room** (7) | `room.build` · `room.place` · `room.move` · `room.reset` · `room.create` · `room.template` · `room.delete` | FE-only |
| **Admin** (9) | `token.manage` · `user.view.any` · `user.manage` · `role.manage` · `audit.view` · `llm.view` · `llm.manage` · `llm.assign` · `infra.manage` | `llm.*`+`infra.manage` ✅; rest FE-only |

## Roles

System roles (immutable; admin can add custom roles via the matrix). Source: `SEED_ROLE_PERMS`.

| Role | Perm count | Notes |
|---|---|---|
| `admin` | all 31 | implicit — `resolve_perms` returns the whole catalog |
| `manager` | 22 | members' work + codex (view/manage/delete) + read users/audit; no account/LLM admin |
| `member` | 9 | own agents, run quests, codex view/manage/delete, basic room |
| `viewer` | 1 | `codex.view` only (read-only) |

Per-user overrides (`user_perms`, allow=grant/deny) tune individuals on top of the role — e.g.
`kitt` is granted `audit.view`, `ploy` is denied `quest.run`.

## Granularity — the view/manage/delete axis

The cleanest way to make a coarse permission finer is to model a **read / write / destroy** axis per
resource instead of one `*.manage` key that gates everything.

### Done (2026-06-22)

- **`codex.manage` → `codex.view` + `codex.manage` + `codex.delete`.** Reads (`GET /search`,
  `/docs`, `/docs/{id}`) now require `codex.view` (was: any authenticated user); upload + reindex
  keep `codex.manage`; deleting a document is the separate `codex.delete`. Non-breaking: every seed
  role that could read keeps `codex.view`, and every role that could write keeps `codex.delete`.
- **`llm.manage` → `llm.view` + `llm.manage` + `llm.assign`.** Listing connections/roles requires
  `llm.view`; creating/updating/activating/deleting a connection requires `llm.manage`; binding a
  connection to a system role (engine/search/summarize) requires `llm.assign`. **Convention:** a
  role granted a write perm should also hold `llm.view`, or the admin panel (loads the list on
  mount) would 403. Today only `admin` holds any `llm.*`, so nothing regressed.

### Remaining candidates (not yet done)

| Coarse key | Bundles | Could split into | Priority |
|---|---|---|---|
| `workflow.manage` | the whole workflows domain | `workflow.view` · `workflow.edit` · `workflow.delete` · `workflow.toggle` | medium (FE-only) |
| `user.manage` | create + edit + suspend | `user.create` · `user.edit` · `user.suspend` (`token.manage` already splits quota) | medium (FE-only) |
| `role.manage` | role definitions + the perm matrix + per-user overrides | `role.manage` (role defs) · `user.perm.override` (grant/deny per user) | medium (FE-only) |
| `infra.manage` | read status + active connection test | `infra.view` · `infra.test` | low (both read-ish) |

Already well-factored (no split needed): the 9 **Agents** keys, the 7 **Room** verbs, `quest.run` /
`task.delete`, and `token.manage` / `user.view.any` / `audit.view`.

## File map

| Concern | File |
|---|---|
| Permission catalog + role→perm seed | [`Backend/scripts/seed.py`](../../../PiKaOs-Core/Backend/scripts/seed.py) `SEED_PERMISSIONS` / `SEED_ROLE_PERMS` |
| FE mirror of the catalog + resolver | [`Frontend/src/data/data-users.jsx`](../../../PiKaOs-Core/Frontend/src/data/data-users.jsx) `PERMISSIONS` / `ROLE_PERMS_SEED` / `resolvePerms` |
| Effective-perm math + Redis cache | [`Backend/app/services/rbac_service.py`](../../../PiKaOs-Core/Backend/app/services/rbac_service.py) |
| Server guard (`require_perm`) + `/me` | [`Backend/app/deps.py`](../../../PiKaOs-Core/Backend/app/deps.py) · [`routers/auth.py`](../../../PiKaOs-Core/Backend/app/routers/auth.py) `GET /api/auth/me` |
| FE gate (`can`) + route guards | [`Frontend/src/App.jsx`](../../../PiKaOs-Core/Frontend/src/App.jsx) |
| Roles/perm matrix + per-user override UI | [`Frontend/src/screens/screens-rbac.jsx`](../../../PiKaOs-Core/Frontend/src/screens/screens-rbac.jsx) |
| DB tables (`roles`/`permissions`/`role_perms`/`user_perms`) | [`data-model.md`](./data-model.md) · migration [`0001_baseline.py`](../../../PiKaOs-Core/Backend/alembic/versions/0001_baseline.py) |
