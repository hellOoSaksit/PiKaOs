---
title: Database / ER design rules (clarity + performance + when to split)
type: architecture
status: active
keywords: [database, er diagram, schema design, normalization, foreign key, index, performance, split database, bounded context, migrations]
related: [./data-model.md, ./modularity.md, ./system-design.md, ../pikaos-dev-rules.md]
summary: >
  How to design the schema so it is human-clear AND performant — naming, keys/integrity,
  normalization, indexing, and the rule for when splitting into a separate database is the right
  call. The as-built ER is data-model.md; this file is the design rules behind it.
updated: 2026-06-20
---

# Database / ER design rules

The **as-built** schema (every table/column/FK, table by table) lives in
[data-model.md](data-model.md) — keep it current ([§2.3](../pikaos-dev-rules.md)). **This** file is the
**design rules**: how to shape a schema that a human grasps fast *and* the DB serves fast. Splitting a
database is allowed — but only on a clean seam (see §5). All examples are Postgres (the project DB).

## 1. Clarity first — the schema is read more than it's written

A schema an AI/human can reason about beats a clever one. Defaults:

- **One table = one thing** (one entity or one bounded-context concept). If a table needs "type" columns
  that only apply to some rows, it's probably two tables.
- **Names reveal intent.** `snake_case`; a table is a clear noun; a column says what it holds
  (`created_at`, `owner_id`, `embedding_model`), not `data1`/`flag`. Booleans read as predicates
  (`is_active`, `has_body`). Timestamps end `_at`, FKs end `_id`.
- **Consistent conventions across the whole DB** — same casing, same `_id`/`_at` suffixes, same
  PK name (`id`). Consistency is what lets an agent infer a column without reading the migration.
- **The ER is documented for a non-technical successor** — [data-model.md](data-model.md): each column =
  what it stores, each FK = what happens on delete, a status legend (LIVE/ENGINE/unused/TEST), and an ER
  diagram (mermaid). A stale ER doc is worse than none.

## 2. Keys & integrity — let the DB enforce truth

- **Every table has a primary key** (a surrogate `id` unless a natural key is genuinely stable).
- **Every relationship is a real `FOREIGN KEY`** with an **explicit `ON DELETE`** chosen per the domain:
  `CASCADE` (child is meaningless without the parent — e.g. `run_steps` → `runs`), `SET NULL` (child
  outlives the parent — e.g. a quest's optional `agent_id`), `RESTRICT` (deletion should be blocked).
  Decide it deliberately; don't accept the default by accident.
- **`UNIQUE` constraints** encode real business rules (`UNIQUE(run_id, seq)`), not just indexes.
- **`NOT NULL` by default**; a nullable column should mean something specific (and the ER doc says what
  `NULL` means — e.g. "NULL = the upload was already markdown").
- **Constraints live in the schema, never only in app code** — the DB is the last line of integrity.

## 3. Normalize by default, denormalize on purpose

- **Aim ~3NF**: no duplicated facts, no column that depends on a non-key column. One fact, one place
  (mirrors the no-duplication / single-source-of-truth rule).
- **Denormalize only for a measured read win**, and write a comment + the ER doc note saying why and how
  it's kept in sync (a cached count, a denormalized status). Unjustified denormalization is drift waiting
  to happen.
- **Derived/throwaway data is marked as such** — e.g. pgvector embeddings are a *rebuildable cache*, the
  markdown is truth ([knowledge-rag.md](knowledge-rag.md)); never treat a cache as the source.

## 4. Performance — design for the read you'll actually run

- **Index what you filter/join/sort on.** Always index FK columns and any column in a frequent `WHERE`
  / `ORDER BY`. For a multi-column query, a **composite index** in the right column order beats two
  single-column ones.
- **Don't over-index.** Every index is write cost + storage; add for a real query, not "just in case".
- **Kill N+1 at the query layer** — fetch related rows with a join / eager load in the `repositories/`
  layer ([§2.1](../pikaos-dev-rules.md)), not a loop of per-row queries from a service.
- **Paginate big lists** — prefer **keyset** (`WHERE id < :cursor ORDER BY id LIMIT n`) over `OFFSET`
  for large/growing tables (OFFSET scans+discards). Never return an unbounded result set.
- **Select the columns you need**, not `SELECT *`, on hot paths and wide rows.
- **Every DB call is `async`** (asyncpg) and goes through the pool; no sync DB I/O on the request path.
- **Measure before optimizing** — add the index the slow query plan asks for; don't guess.

## 5. When to split into a separate database (allowed — if the seam is clean)

Splitting is good **when the seam is real**, harmful when it's premature. Split on a **bounded-context
boundary** ([modularity.md](modularity.md)), never mid-aggregate.

**Split when:**
- A **stateful plugin** needs its own data — it gets its **own DB in its own compose project**
  ([§6.2](../pikaos-dev-rules.md)); it must not reach into main's DB.
- A subsystem is delivered as a **per-department local install** ([modularity.md](modularity.md)) — its
  module owns its tables and ships alone.
- A context has a **genuinely independent lifecycle / scaling / isolation** need.

**Don't split when:** it would put a **foreign key across two databases** (you can't enforce it →
app-level joins + eventual-consistency pain), or it's only "feels cleaner". Within one bounded context,
keep one database.

**If you do split — the rules:**
- **No cross-DB foreign keys.** Each DB is integrity-complete on its own. A reference across the seam is
  an **id value the app resolves**, not an FK; expect eventual consistency, not a transaction.
- **One module owns its tables;** other modules reference it by id, FK only *into* the core, per
  [modularity.md](modularity.md).
- **Each DB keeps its own migration chain** ([§2.3](../pikaos-dev-rules.md)) and its own ER section in the
  owning doc. A plugin's schema uses the **same Alembic flow** as main so it folds back cleanly on
  promotion (§6.2).
- **Register it** — a published datastore port goes in [ports.md](ports.md) (internal-by-default, §6.2).

## 6. Changing the schema (the loop)

1. Reuse before adding — can an existing table/column carry it? ([always-on rule 1](../../../CLAUDE.md))
2. Write the **Alembic migration** ([§2.3](../pikaos-dev-rules.md)) — never hand-edit the DB; FK +
   `ON DELETE` + indexes + `UNIQUE` decided up front.
3. **Update [data-model.md](data-model.md) in the same commit** — the table/column, the FK on-delete, the
   ER diagram, the status. This is a hard rule; the as-built doc is the map successors rely on.
4. Verify on the running stack (migration applies + seed runs + tests green).
