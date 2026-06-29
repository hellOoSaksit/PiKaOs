---
title: RedirectMap — the discover & fuzzy-matching engine
type: reference
status: built
keywords: [discover, matching, fuzzy, path similarity, SequenceMatcher, difflib, matchThreshold, auto-pick, candidates, collision, domain-swap, one-sided rows, exact match, Match %]
related: [./overview.md, ./errors.md, ./decisions.md, ../../architecture/versions.md]
summary: >
  How Discover turns two sitemaps into proposed old→new mapping rows: path-similarity scoring
  (difflib), the user-adjustable auto-pick threshold (matchThreshold, default 95), exact-match
  shortcut, candidate list, target-collision flag, one-sided rows, and the no-new-sitemap
  domain-swap fallback. Read this instead of re-reading discover_service.py.
updated: 2026-06-22
---

# Matching engine — how Discover builds old→new rows

Owns the **fuzzy old→new matching** that powers *Pull sitemaps + verify* (🚀). Read this to
understand or change matching **without re-reading the whole service**. Source of truth is the code:
[`services/discover_service.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/discover_service.py)
(scoring + assembly) and [`schemas.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/schemas.py)
(`DiscoverIn` / `MappingRow` / `MatchCandidate`).

## 1. What it does

`POST /api/redirect/discover` reads **both** sitemaps — the OLD site (the URLs that need redirecting)
and the NEW site (the URLs that actually exist now) — and for **each** old URL finds the **closest
real new URL by path similarity**, reporting a **Match %** (0–100). So old `/investor-relations` maps
to the real new `/en/investor-relations` even when the path isn't identical, and the user sees how
confident the pick is. Stateless: sitemaps in, proposed rows out, nothing persisted.

If the new sitemap can't be read, every row degrades to a **same-path domain swap** (Match % = `—`,
no candidates). See §6.

## 2. The algorithm (path-similarity scoring)

1. **Normalize** each URL to its path with the trailing slash stripped — `_norm_path()`. So `/a/b`
   and `/a/b/` collapse to the same key `/a/b`. The path is the *only* thing compared (host/query
   ignored — both sides are already on their own origin).
2. **Index** real new URLs by normalized path into `new_by_path` (first wins on duplicate paths).
3. **Score** with `difflib.SequenceMatcher(autojunk=False)` — `_ranked_matches()`. The matcher's
   `seq2` is fixed to the old path so difflib caches the heavy work, then each new path is scored via
   `matcher.ratio()` (0–1). Results are sorted descending; the top **5** (`_MAX_CANDIDATES`) become
   the row's `candidates`.

> **Why difflib, not a Levenshtein lib:** stdlib (no dep — the whole tool is 6 deps), and
> `ratio()` on the path string is "good enough" to rank closest-by-shape. The user always sees the
> top-5 candidates and the chosen one, so a wrong auto-pick is one click to fix — the score only has
> to *rank* well, not be metrically perfect. Rationale: [`decisions.md`](decisions.md).

## 3. The auto-pick threshold (`matchThreshold`) — the adjustable % {#match-threshold}

The single knob the user turns. **At or above** `matchThreshold` the closest new URL is **auto-filled**
into `newUrl`; **below** it the row is left **blank** so the user picks from `candidates` instead of
trusting a weak guess. The (low) score is still kept on the row so the table flags how poor the best
match was.

| | |
|---|---|
| **Where set** | Discover panel slider + number input (0–100). Sent on the request as `DiscoverIn.matchThreshold`. |
| **Default** | **95** (strict) — frontend `disc.matchThreshold` in [`screens-redirect.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-redirect.jsx). |
| **Server fallback** | If a request omits it (e.g. an API caller), the backend uses `settings.redirect_match_min_score` (env default **60**). UI always sends a value, so 60 is the API-only path. |
| **Effect of raising** | Stricter — more rows left blank for manual pick (fewer wrong auto-picks). |
| **Effect of lowering** | Looser — more rows auto-filled with the nearest match (more to double-check). |

> **History:** before v0.2.2 this gate was the fixed env constant `redirect_match_min_score` (60),
> not user-visible. v0.2.2 moved it into the UI as `matchThreshold` and raised the default to 95.
> See [`versions.md`](../../architecture/versions.md). The env constant stays as the no-UI fallback —
> [no-hardcode rule](../../../../CLAUDE.md): the UI owns the value, the env owns the default.

## 4. Per-old-URL decision (the core loop)

For each old URL, with a non-empty new sitemap:

- **Exact path exists on the new site** (`new_by_path[op]`) → `newUrl` = that URL, **score = 100.0**.
  `candidates[0]` is the exact match, then the next-closest paths for context.
- **No exact path** → take the top ranked fuzzy match `(bp, ratio)`; `score = round(ratio*100, 1)`.
  - `score >= matchThreshold` → `newUrl` = `new_by_path[bp]` (auto-pick).
  - `score <  matchThreshold` → `newUrl` = `""` (blank — user chooses from `candidates`).
- Either way `candidates` = the top-5 new URLs by similarity (best first), each `{url, score}`.

## 5. Collision flag + one-sided rows

- **Target collision** (`MappingRow.collision`): after all rows are built, any **non-blank** `newUrl`
  chosen as the best match for **more than one** old URL is flagged. A cue that the match was
  *forced* — the new site has no distinct page per old one. Worth a manual look; not an error.
- **New-only rows**: real new-site URLs that **no** old URL mapped to are appended as rows with an
  empty `oldUrl` (nothing to redirect from). So the table covers **the union of BOTH sites**. Verify
  later marks these `ไม่ต้อง Redirect`. (Old-only — an old URL with no decent new match — is the blank
  `newUrl` case above; verify marks it `ติดปัญหา`.)

## 6. Fallback: no new sitemap → domain swap

If the new sitemap is missing/blocked (best-effort — it must **not** fail the run), there's nothing
to match against, so every old URL becomes a **same-path domain swap**: `_swap_origin()` keeps the
path + query and swaps scheme+host onto the new base. `matchScore = None` → the UI shows `—` and no
candidates. This 404s when the new site reorganised paths, which is exactly why reading the new
sitemap (and fuzzy-matching) is the default.

## 7. How the Match % is shown & reused downstream

- **Table badge** — `MatchBadge` in [`cells.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/redirect/cells.jsx):
  ≥90 green · ≥60 orange · <60 red · `null` → `—`. Same colours in the row-detail candidate list
  ([`RowDetail.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/redirect/RowDetail.jsx)).
- **Sort** — the table's "Lowest match first" sort surfaces the weakest matches for review (blanks
  last).
- **Verify caveat** — `matchScore` rides along to verify; `_match_caveat()` in
  [`verify_service.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/verify_service.py)
  appends a Thai warning when the matched path is far from the old one (≥90 none · ≥60 "check it" ·
  <60 "probably the wrong page"). **Note:** these badge/caveat bands (90/60) are *display* thresholds,
  **independent** of `matchThreshold` (the auto-pick gate) — changing the slider does not recolour
  the badge.

## 8. Data flow (frontend ↔ backend)

```
DiscoverPanel slider ──> disc.matchThreshold (default 95)
  screens-redirect.jsx doRun(): body = { oldBase, newBase, symbol, credentials, matchThreshold }
    └─> POST /api/redirect/discover  (one call per old site, deduped within the run)
          discover_service.discover(): min_score = payload.matchThreshold ?? settings.redirect_match_min_score
            └─> DiscoverOut.rows[] = MappingRow{ oldUrl, newUrl|"", matchScore, candidates[], collision }
                  └─> table → Verify → web.config → xlsx
```

`min_score` is the **only** consumer of `matchThreshold` in the backend (one line in
`discover()`); everything else about a row is set by the loop in §4.
