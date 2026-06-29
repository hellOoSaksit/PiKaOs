---
title: RedirectMap — the whole-site File Audit (crawl + compare documents)
type: reference
status: built
keywords: [file audit, whole-site crawl, document compare, pdf, doc, file scan, filename match, only_old, missing on new, BFS crawl, filescan, fileexport, tab, compare table, xlsx]
related: [./overview.md, ./matching.md, ./errors.md, ../../architecture/versions.md]
summary: >
  The File Audit tab (v0.3): crawl the WHOLE old site and the WHOLE new site, gather every linked
  document (PDF/DOC/…), and compare the two full sets by filename so a file that didn't survive the
  migration is caught. Covers the BFS crawl, the filename match, the endpoints/schemas, the tab, and
  the compare-table export. Read this instead of re-reading filescan_service.py.
updated: 2026-06-22
---

# File Audit — whole-site document compare

The **second tab** of the plugin (v0.3), beside the Redirect map. Owns the **whole-site file
audit**: crawl both sites, list every document linked anywhere, compare old vs new. Read this to
understand or change it without re-reading the service. Source of truth:
[`services/filescan_service.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/filescan_service.py)
(crawl + compare), [`services/file_compare_xlsx.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/file_compare_xlsx.py)
(export), [`screens/screens-fileaudit.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-fileaudit.jsx) (UI).

## 1. What it does & why it's separate from Verify

Verify already does a **per-row** file diff: the documents linked on **one** old page vs **one** new
page (the mapping row). That misses a file that **moved to a different page** or **vanished** — it's
only ever compared within a single old→new pair.

File Audit is the **whole-site** view: crawl every page of the old site and every page of the new
site, gather **all** document links into two sets, and compare them **by filename** (not by page, not
by path — the new site reorganises both). So `wha-tax-policy-en.pdf` is matched no matter which page
links it on each side, and a file present on old but **missing on new** (`only_old`) is surfaced —
the migration risk this tab exists to catch. Every file from **both** sites is listed, **no blanks**.

## 2. The crawl (BFS, bounded)

`_crawl_site()` walks one site breadth-first:

1. Start at the base URL; normalize each page key with `_norm_page()` (drop fragment + querystring →
   one fetch per page).
2. Fetch pages in **waves** of `redirect_file_scan_concurrency` (8) via `probe_follow_body` (browser
   UA, SSRF guard, follows redirects, TLS no-verify fallback). A network/blocked/TLS failure on one
   page degrades to "no HTML" — it never kills the crawl.
3. From each page's HTML: `page_inspect.extract_files()` collects document links (first URL per
   filename wins); `_internal_links()` collects **same-origin** `<a href>` page links to keep
   crawling — excluding document files (don't fetch a PDF as a page), `mailto:`/`tel:`/`javascript:`,
   and other hosts.
4. Stop at `maxPages` (request `maxPages`, else `redirect_file_scan_max_pages` = **120**) per site.
   The frontier is capped at `maxPages * 6` so a link-heavy page can't blow up memory.

Returns `({filename: absolute_url}, pages_fetched)` for the site.

> **WAF/JS caveat (important).** A server-side crawler can't run JS or pass a hard bot-wall. A site
> behind AWS WAF (e.g. `wha-group.com`) or a pure SPA hands the crawler a challenge/shell, **not** the
> real HTML — so `<a href>` links can't be read, the page count comes back low, and the file list is
> sparse or empty. That's a property of the target, not a bug. The UI surfaces `faNone` ("may be
> behind a WAF/JS wall — open in a browser"). Same root cause as the `spa` flag in
> [`page_inspect`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/page_inspect.py) /
> [`errors.md`](errors.md).

## 3. The compare (union by filename)

`scan()` crawls old + new, then unions the two filename sets (sorted). Per filename:

| Condition | `status` | Meaning |
|---|---|---|
| on old **and** new | `both` | file survived the migration |
| on old, **not** new | `only_old` | **missing on new** — the migration gap (counted in `onlyOldCount`) |
| on new, **not** old | `only_new` | added on the new site |

Each becomes a `FileItem{filename, oldUrl, newUrl, onOld, onNew, status}`. `FileScanOut` adds the
crawl stats (`oldPagesCrawled`, `newPagesCrawled`, `oldFileCount`, `newFileCount`, `onlyOldCount`,
`count`).

## 4. Endpoints & schemas

Both under `/api/redirect/*` (open), in [`routers/redirect.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/routers/redirect.py),
schemas in [`schemas.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/schemas.py):

- **`POST /filescan`** → `FileScanOut`. Body `FileScanIn{oldBase, newBase, symbol?, maxPages?,
  credentials[]}`. **Cancellable** (wrapped in `_run_cancellable` → client disconnect = 499, stops
  the in-flight crawl). `BlockedURLError` → 400 (SSRF guard rejects an internal target up front).
- **`POST /fileexport`** → `.xlsx` (binary). Body `FileExportIn{files[], symbol?}`. Pure transform.

Per-host **HTTP Basic Auth** (`credentials`) rides along for gated/UAT sites — same `Credential`
shape and host-matching as discover/verify ([`credentials.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/services/credentials.py)).

## 5. The tab & screen (frontend)

- [`App.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/App.jsx) now carries a
  **tab switcher** in the header — `Redirect map` ↔ `File audit` (persisted in `localStorage`
  `redirectmap-tab`). It renders `<Redirect>` or `<FileAudit>` (conditional, so the inactive tab
  unmounts).
- **Shared input (fill once).** The identity fields — **Symbol · new base · old site · Basic-Auth
  credentials** — are **lifted to `App`** (`shared` state) and passed to BOTH tabs, so switching tabs
  doesn't mean retyping them. The Redirect tab's old **list** and File audit's single **old base** are
  the same `olds` array (File audit reads/writes `olds[0]`). It's **in-memory** (not `localStorage`):
  `creds` carry passwords and must never be persisted ([secrets rule](../../../../CLAUDE.md)), and it's
  what survives the unmount-on-switch. Page-local (not shared): the Redirect tab's `sitemapUrl` +
  `matchThreshold`, File audit's `maxPages`, and each tab's results (cleared on F5).
- [`screens-fileaudit.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/screens-fileaudit.jsx)
  is the orchestrator: a form (Symbol · old base · new base · max pages) + the reused
  [`AuthPanel`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/redirect/AuthPanel.jsx),
  stat tiles that double as a status filter (Files · On both · **Missing on new** · Added · Pages
  crawled), and a read-only results table (No. · Filename · Status · Old URL · New URL). Results are
  in-memory (F5 clears). Reuses the UI kit + `cells.jsx` helpers; labels live in
  [`redirect/labels.jsx`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/screens/redirect/labels.jsx)
  under the `fa*` / `tab*` keys (EN + TH). API in [`lib/api.js`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Frontend/src/lib/api.js)
  (`scanFiles`, `exportFileCompare`; the two xlsx exports share a `rawBlob` helper).

## 6. Export format (compare table)

`file_compare_xlsx.build()` emits **one sheet** (`File Audit`): a title + a summary line (counts) +
a header, then one row per file — **No. · ชื่อไฟล์ · สถานะ · URL เว็บเดิม · URL เว็บใหม่**. The
Status cell is colour-tinted like the UI badge (both = green, missing-on-new = red, added = grey) so
`only_old` gaps pop; the URL cells are clickable hyperlinks. Download name:
`{Symbol} - FileAudit - {YYYYMMDD}.xlsx`.

> This is the chosen shape from the build request (a compare table), **not** the per-year single-
> column `URL Link` layout of `Ref/CSA Docutment URL-WHA.xlsx` — that reference was the *input* style
> (a flat list of document URLs), the audit output adds the old/new/status comparison.

## 7. Settings

Env ([`config.py`](../../../../PiKaOs-Plugin/PiKaOs-RedirectMap/Backend/app/config.py)) — these were
declared for the old (dropped) `/files` endpoint and are now **live** again under File Audit:
`redirect_file_scan_max_pages` (120) · `redirect_file_scan_concurrency` (8) · `redirect_file_exts`
(`pdf,doc,docx,xls,xlsx,ppt,pptx,zip,csv,rar,7z`). The crawl also honours the shared probe/SSRF/TLS
settings (timeout, `redirect_ssl_verify`, `redirect_ssrf_block_private`, `redirect_url_allowlist`).

## 8. Data flow

```
App tab "File audit" → <FileAudit>
  form { symbol, oldBase, newBase, maxPages } + creds
    └─> POST /api/redirect/filescan  (cancellable)
          filescan_service.scan(): crawl old + crawl new → 2× {filename: url} → union by filename
            └─> FileScanOut.files[] = FileItem{filename, oldUrl|"", newUrl|"", status}
                  └─> table (filter by status) → "Export Excel"
                        └─> POST /api/redirect/fileexport → compare-table .xlsx
```
