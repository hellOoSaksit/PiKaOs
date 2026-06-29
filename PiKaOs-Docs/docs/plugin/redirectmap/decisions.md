---
title: RedirectMap (plugin) — design decisions & alternatives
type: reference
status: built
keywords: [decisions, rationale, many to one, content-aware verdict, browser ua, regex inspect, streaming, no login, xlsx template, lineage]
related: [./overview.md, ./errors.md, ./integration.md, ../compare/README.md]
summary: >
  Why the RedirectMap build looks the way it does and what was tried and rejected. Read before re-litigating
  any choice (many→one shape, content-aware verdict, browser UA, reusing Compare's outbound patterns).
updated: 2026-06-20
---

# Design decisions & alternatives considered

Why the build looks the way it does — and what was tried and rejected (don't re-litigate).

| Decision | Why | Rejected alternative |
|---|---|---|
| **Many old → one new** as the core shape | matches the real consolidation (several old hosts → one new site); 1 row = 1 rule for `web.config` | many↔many pairing — no clean rule mapping; an earlier two-sided "either side can be a list" UI was built then dropped when the real shape proved to be many→one |
| **Content-aware verdict** (read the body, not just the code) | a `200` can be an "Internal Server Error" screen; the status code lies. The override forces `ติดปัญหา` on a soft-error new page | trust the HTTP status (misses soft-errors) |
| **Soft-error scan bounded to first ~800 chars** | error screens put the message up top; avoids flagging a real page that merely *mentions* "not found" deep in content | scan the whole body (false positives) |
| **Browser UA + treat `401/403/405/406/429/503` as not-missing** | WAF/CDN returns those to bots but the page loads in a browser | a custom UA → every WAF page a false 404 |
| **Per-host HTTP Basic Auth, supplied on the request** (matched by host) | UAT/staging sites sit behind a login dialog; one row can mix an open old + a gated new side → creds must be host-scoped, not global | a single global user/pass (leaks creds across hosts); baking creds in config/`.env` (no-hardcode rule; they're secrets); re-using the dead page-login gate (wrong layer — that gated the *tool*, not the *targets*) |
| **System finds the gated sites itself** (auto-add a `401` host to the Login list; prefill host from typed URLs) | the user shouldn't have to know in advance which sites need a login or retype a host — the `401` *is* the signal | make the user discover + type every gated host by hand |
| **Per-row file compare folded into verify** (one deep GET serves status + body + files) | files are linked *inside* pages, not in the sitemap; one fetch does everything per row | a separate **site-wide** file crawl — built, then removed (2026-06-20: `/files` + `files_service.py` deleted) |
| **Stdlib/regex HTML inspect** (`page_inspect`) | **no new Python dep** → image needn't rebuild, runs offline | BeautifulSoup/lxml |
| **Stream verify in chunks of 25** | a whole-sitemap verify in one request overran the proxy timeout (`ERR_EMPTY_RESPONSE`) | one-shot verify |
| **Reuse Compare's `net_guard` + sitemap + probe/UA** | same outbound-to-arbitrary-URL risk and sitemap shape; don't reinvent | a new guard/fetcher (divergence + risk) |
| **No login (plugin)** | the line's contract; keeps deps to 6 and the tool one-click | a page gate — **built, then removed** per user; re-add via the main app's RBAC on merge ([`integration.md`](integration.md)) |
| **Stateless → localStorage + CSV/`.xlsx`** | the tool keeps no server state; mappings live in the browser + the round-trip files | a DB (defeats the whole point of the split) |
| **Read-only results table** (rows from discover/import only) | the system fills status/notes; hand-editing a probed row would desync the verdict | editable cells |
| **Show every URL — the union of both sitemaps** (one-sided rows kept) | the user must see the *whole* picture; a URL with no counterpart is still a fact to act on (old-only = set a target; new-only = a page nothing redirects to) | drop unmatched URLs (hides gaps); only show matched pairs |
| **Notes are one detailed, self-contained line** (HTTP per side + caveats) | the note is the most-read field and the only context in the Excel export — it must explain *why* without opening the row | a terse status word (forces opening the detail / guessing) |
| **`.xlsx` export mirrors the central template exactly** + a `ผลตรวจ` sheet that copies the on-screen table | the checklist sheets must drop into the team workflow unchanged, but the recipient (who never opens the web app) still needs to see the table — so add a screen-mirroring sheet rather than widen the template | only the 7-col template (loses all verify data); widening the template (breaks the team's workflow) |

## Lineage note

RedirectMap is the **second** plugin after [Compare](../compare/README.md). Where Compare's deep
mode does a full body/heading/block diff (`content.py`, `difflib`), RedirectMap's `page_inspect` does
the **lighter** job it needs: file extraction + a body **content/soft-error** signal — no block diff.
On merge these two HTML-inspect modules should converge (see [`integration.md`](integration.md)).
