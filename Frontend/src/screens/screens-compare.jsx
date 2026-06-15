/* PiKaOs — COMPARE CONTENT (UAT vs Production).
   The SOURCE side's sitemap is the source of truth; each URL is domain-swapped
   onto the TARGET base and both sides are probed for coverage. A direction toggle
   flips which side is source (Production → UAT, or UAT → Production). Calls the
   backend POST /api/compare (via lib/api.js). All UI text comes from t("compare.*"). */
import React from 'react';
const { useState } = React;
import { Btn, Empty, PageHead, Panel, StatTile } from '../components/components.jsx';
import Switch from '../components/ui/Switch.jsx';
import { ApiError, compareDeep, compareRender, compareSites } from '../lib/api.js';

const DEEP_BATCH = 10;   // pages deep-compared per streamed request (keeps each call fast)

const DEEP_TONE = {
  identical: "on", content_diff: "warn", meta_diff: "info",
  images_missing: "warn", links_broken: "warn", mixed: "warn", unfetchable: "busy",
};

/* Map a thrown error (usually ApiError) to a friendly, localized message. */
function errMessage(e, t) {
  if (e instanceof ApiError) {
    if (e.status === 0) return t("compare.err.network");       // backend unreachable / timed out
    if (e.status === 401 || e.status === 403) return t("compare.err.auth");
    if (e.status === 502) return e.message || t("compare.err.sitemap");  // backend detail
    if (e.status === 422 || e.status === 400) return t("compare.err.input");
    return e.message || t("compare.failed");
  }
  return (e && e.message) || t("compare.failed");
}

/* Build the sitemap URL for `base`. Sitemaps are derived automatically from each
   base URL — no manual field. Defaults to <base>/sitemap.xml; `field` is an
   optional override (full URL or bare path) kept for flexibility. */
function sitemapFor(base, field) {
  let path = (field || "").trim();
  if (/^https?:\/\//i.test(path)) {
    try { const u = new URL(path); path = u.pathname + u.search; } catch (e) { path = ""; }
  }
  if (!path || path === "/") path = "/sitemap.xml";
  if (!path.startsWith("/")) path = "/" + path;
  try { return new URL(path, base).toString(); } catch (e) { return base.replace(/\/+$/, "") + path; }
}

/* Group the six fine-grained states into the filter categories shown to the user.
   prod_error + error collapse into the "other" bucket. */
function catOf(state) {
  if (state === "missing_on_uat") return "missing";
  if (state === "broken_on_uat") return "broken";
  if (state === "match" || state === "redirect") return state;
  return "other";   // prod_error · error
}

const STATE_TONE = {
  match: "on", redirect: "info", missing_on_uat: "warn",
  broken_on_uat: "warn", prod_error: "busy", error: "warn",
};

/* Percent-encoded URLs (e.g. Thai slugs) are unreadable and unbreakable — decode
   for display; callers keep it on one line so iframe columns stay aligned. */
function decodeUrl(u) { try { return decodeURIComponent(u); } catch (e) { return u; } }

/* Word-level diff (LCS) → [type, word] where type is eq | del (only in source) |
   add (only in target). Used to color the body comparison. */
function wordDiff(src, tgt) {
  const a = (src || "").split(/\s+/).filter(Boolean);
  const b = (tgt || "").split(/\s+/).filter(Boolean);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { out.push(["eq", a[i]]); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push(["del", a[i]]); i++; }
    else { out.push(["add", b[j]]); j++; }
  }
  while (i < n) out.push(["del", a[i++]]);
  while (j < m) out.push(["add", b[j++]]);
  return out;
}

/* Expanded deep-diff: field-level diff (color), body word-diff, image/link counts,
   and opt-in side-by-side iframes of both pages. */
function DeepDetail({ d, srcUrl, tgtUrl, srcShort, tgtShort, t }) {
  const [frames, setFrames] = useState(false);
  // proxy-render: url -> { state: "loading"|"ok"|"error", html }. Lets us preview a
  // page that blocks cross-origin framing by re-serving its HTML same-origin.
  const [proxy, setProxy] = useState({});
  const renderProxy = async (url) => {
    setProxy(p => ({ ...p, [url]: { state: "loading" } }));
    try {
      const out = await compareRender({ url });
      setProxy(p => ({ ...p, [url]: out.ok ? { state: "ok", html: out.html } : { state: "error" } }));
    } catch (e) {
      setProxy(p => ({ ...p, [url]: { state: "error" } }));
    }
  };
  const m = (meta, k) => (meta && meta[k]) || "";
  const fields = [
    ["Title", d.srcTitle, d.tgtTitle],
    ["H1", d.srcH1, d.tgtH1],
    ["description", m(d.srcMeta, "description"), m(d.tgtMeta, "description")],
    ["canonical", m(d.srcMeta, "canonical"), m(d.tgtMeta, "canonical")],
    ["og:title", m(d.srcMeta, "og:title"), m(d.tgtMeta, "og:title")],
    ["og:image", m(d.srcMeta, "og:image"), m(d.tgtMeta, "og:image")],
  ];
  const words = (d.srcText || "").split(/\s+/).length + (d.tgtText || "").split(/\s+/).length;
  const diff = (d.srcText && d.tgtText && (d.bodySim == null || d.bodySim < 1) && words <= 1400) ? wordDiff(d.srcText, d.tgtText) : null;
  const chg = { background: "color-mix(in srgb, var(--gold) 16%, transparent)" };
  const cell = { padding: "6px 9px", verticalAlign: "top", borderTop: "1px solid var(--line-soft)", wordBreak: "break-word" };
  return (
    <div className="cmp-reveal" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div className="mono faint" style={{ fontSize: 11, marginBottom: 4 }}>{t("compare.deep.fieldDiff")}</div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead><tr>
            <th style={{ ...cell, color: "var(--ink-3)", width: 120 }}>field</th>
            <th style={{ ...cell, color: "var(--ink-3)" }}>{srcShort}</th>
            <th style={{ ...cell, color: "var(--ink-3)" }}>{tgtShort}</th>
          </tr></thead>
          <tbody>
            {fields.map(([label, s, g]) => {
              const differ = (s || "") !== (g || "");
              return (
                <tr key={label}>
                  <td style={{ ...cell, fontFamily: "var(--font-mono)", color: "var(--ink-2)", whiteSpace: "nowrap" }}>{differ ? "✕" : "✓"} {label}</td>
                  <td style={{ ...cell, ...(differ ? chg : null) }}>{s || <span className="faint">—</span>}</td>
                  <td style={{ ...cell, ...(differ ? chg : null) }}>{g || <span className="faint">—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div>
        <div className="mono faint" style={{ fontSize: 11, marginBottom: 4 }}>
          {t("compare.deep.bodyDiff")} · {t("compare.deep.bodySim")}: {d.bodySim != null ? Math.round(d.bodySim * 100) + "%" : "—"} · Δ{d.wordDelta > 0 ? "+" : ""}{d.wordDelta ?? 0}
        </div>
        {diff ? (
          <div style={{ maxHeight: 220, overflow: "auto", padding: 10, lineHeight: 1.8, border: "1px solid var(--line)", borderRadius: 8, fontSize: 12.5 }}>
            {diff.map(([type, w], k) => type === "eq"
              ? <span key={k}>{w} </span>
              : type === "del"
                ? <span key={k} style={{ background: "color-mix(in srgb,var(--crimson) 22%,transparent)", textDecoration: "line-through" }}>{w} </span>
                : <span key={k} style={{ background: "color-mix(in srgb,var(--emerald) 22%,transparent)" }}>{w} </span>)}
          </div>
        ) : <div className="faint" style={{ fontSize: 12 }}>{(d.bodySim != null && d.bodySim >= 1) ? t("compare.deep.bodySame") : t("compare.deep.bodyTooBig")}</div>}
      </div>

      <div className="row" style={{ gap: 22, flexWrap: "wrap", fontSize: 12 }}>
        <div>
          <b className="mono faint">{t("compare.deep.images")}</b> {d.imagesMissing}/{d.imagesChecked} {t("compare.deep.missing")}
          {(d.imagesMissingUrls || []).slice(0, 5).map((u, k) => <div key={k} className="mono faint" style={{ fontSize: 11, wordBreak: "break-all" }}>{u}</div>)}
        </div>
        <div><b className="mono faint">{t("compare.deep.links")}</b> {d.linksBroken}/{d.linksChecked} {t("compare.deep.broken")}</div>
      </div>

      <div>
        <div className="row" style={{ gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Btn kind="ghost" sm icon={frames ? "🙈" : "🖥"} onClick={() => setFrames(v => !v)}>{frames ? t("compare.deep.previewHide") : t("compare.deep.preview")}</Btn>
          <a className="rr-open mono" href={srcUrl} target="_blank" rel="noreferrer">{srcShort} ↗</a>
          <a className="rr-open mono" href={tgtUrl} target="_blank" rel="noreferrer">{tgtShort} ↗</a>
        </div>
        {frames && (
          <>
            <div className="qei-note" style={{ marginTop: 6 }}>{t("compare.deep.frameNote")}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 8, alignItems: "start" }}>
              {[[srcShort, srcUrl, d.srcEmbeddable], [tgtShort, tgtUrl, d.tgtEmbeddable]].map(([lab, url, emb]) => (
                <div key={lab} style={{ minWidth: 0 }}>
                  <div className="mono faint" title={url}
                    style={{ fontSize: 11, marginBottom: 4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {lab} · {decodeUrl(url)}{emb === false ? " 🚫" : ""}
                  </div>
                  {emb === false ? (
                    proxy[url] && proxy[url].state === "ok" ? (
                      // same-origin srcdoc + sandbox (no scripts) → renders despite X-Frame-Options
                      <iframe srcDoc={proxy[url].html} title={lab} loading="lazy" sandbox=""
                        referrerPolicy="no-referrer"
                        style={{ width: "100%", height: 420, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
                    ) : (
                      <div style={{ height: 420, border: "1px dashed var(--line)", borderRadius: 8, display: "grid", placeItems: "center", textAlign: "center", padding: 16, gap: 10, color: "var(--ink-3)", fontSize: 12.5, background: "color-mix(in srgb, var(--ink) 3%, transparent)" }}>
                        <div>🚫 {t("compare.deep.frameBlocked")}</div>
                        <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                          <Btn kind="ghost" sm icon="🖼" onClick={() => renderProxy(url)}
                            style={{ opacity: proxy[url] && proxy[url].state === "loading" ? .5 : 1, pointerEvents: proxy[url] && proxy[url].state === "loading" ? "none" : "auto" }}>
                            {proxy[url] && proxy[url].state === "loading" ? t("compare.deep.proxyLoading") : t("compare.deep.proxyTry")}
                          </Btn>
                          <a className="rr-open mono" href={url} target="_blank" rel="noreferrer">{lab} ↗</a>
                        </div>
                        {proxy[url] && proxy[url].state === "error" && (
                          <div className="qei-note" style={{ color: "var(--crimson)" }}>{t("compare.deep.proxyErr")}</div>
                        )}
                        <div className="qei-note" style={{ fontSize: 11 }}>{t("compare.deep.proxyNote")}</div>
                      </div>
                    )
                  ) : (
                    <iframe src={url} title={lab} loading="lazy" referrerPolicy="no-referrer"
                      style={{ width: "100%", height: 420, border: "1px solid var(--line)", borderRadius: 8, background: "#fff" }} />
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Compare({ t }) {
  const [prod, setProd] = useState("");
  const [uat, setUat] = useState("");
  const [dir, setDir] = useState("p2u");          // p2u: Production→UAT · u2p: UAT→Production
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);
  const [filter, setFilter] = useState("all");    // category filter for the results
  const [q, setQ] = useState("");                 // path search
  const [deep, setDeep] = useState(false);        // deep body/title/meta/image compare
  const [deepLimit, setDeepLimit] = useState(100);
  const [open, setOpen] = useState(() => new Set());  // expanded deep-detail rows
  const toggleRow = (i) => setOpen(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });
  // session cache: per direction+inputs result, so flipping UAT↔Prod is instant
  const cacheRef = React.useRef(new Map());
  const [resSig, setResSig] = useState(null);   // signature of the result currently shown
  const [deepData, setDeepData] = useState({}); // path → DeepResult (streamed in batches)
  const [deepTargets, setDeepTargets] = useState(() => new Set()); // paths still awaiting their batch
  const [deepProg, setDeepProg] = useState(null);  // {done,total} while streaming
  const deepRunRef = React.useRef(0);           // cancels an in-flight stream when a new run/toggle starts

  // direction decides which side is source-of-truth (sitemap origin) vs target
  const srcBase = (dir === "p2u" ? prod : uat).trim();
  const tgtBase = (dir === "p2u" ? uat : prod).trim();
  const srcShort = dir === "p2u" ? "PROD" : "UAT";
  const tgtShort = dir === "p2u" ? "UAT" : "PROD";

  // sitemaps are derived automatically from the base URLs (no manual field)
  const prodSitemap = prod.trim() ? sitemapFor(prod.trim()) : "";
  const uatSitemap = uat.trim() ? sitemapFor(uat.trim()) : "";

  // cache key captures everything that changes the result → input edits auto-invalidate
  const sigOf = (d) => `${d}|${prod.trim()}|${uat.trim()}|${deep ? "D" + (Number(deepLimit) || 100) : "S"}`;
  const curSig = sigOf(dir);
  const cached = res && resSig === curSig;                 // showing a cached/fresh result for current inputs
  const stale = !!(res && resSig && resSig !== curSig);    // inputs changed since this result → re-run

  const resetDeep = () => { deepRunRef.current++; setDeepData({}); setDeepTargets(new Set()); setDeepProg(null); };

  const setDirection = (d) => {
    setDir(d); setFilter("all"); setQ(""); setOpen(new Set()); resetDeep();
    const hit = cacheRef.current.get(sigOf(d));            // reuse prior run for that direction
    setRes(hit ? hit.res : null);
    setResSig(hit ? sigOf(d) : null);
    if (hit) setDeepData(hit.deep || {});
  };

  const clearCache = () => { cacheRef.current.clear(); resetDeep(); setRes(null); setResSig(null); };

  // stream deep results in batches so no single request hits the proxy timeout
  const runDeep = async (coverage, sig) => {
    const limit = Math.max(1, Math.min(500, Number(deepLimit) || 100));
    const targets = coverage.items.filter(it => it.state === "match" || it.state === "redirect").slice(0, limit);
    if (!targets.length) return;
    const myRun = ++deepRunRef.current;
    setDeepTargets(new Set(targets.map(it => it.path)));
    setDeepProg({ done: 0, total: targets.length });
    const data = {};
    for (let i = 0; i < targets.length; i += DEEP_BATCH) {
      if (myRun !== deepRunRef.current) return;             // a newer run/toggle superseded us
      const chunk = targets.slice(i, i + DEEP_BATCH);
      try {
        const out = await compareDeep({ pairs: chunk.map(it => ({ src: it.prodUrl, tgt: it.uatUrl })) });
        chunk.forEach((it, k) => { data[it.path] = out.results[k]; });
      } catch (e) {
        chunk.forEach(it => { data[it.path] = { deepState: "unfetchable" }; });   // don't hang the row
      }
      if (myRun !== deepRunRef.current) return;
      setDeepData({ ...data });
      setDeepTargets(new Set(targets.slice(i + DEEP_BATCH).map(it => it.path)));
      setDeepProg({ done: Math.min(i + DEEP_BATCH, targets.length), total: targets.length });
    }
    setDeepProg(null);
    const cur = cacheRef.current.get(sig);
    if (cur) cacheRef.current.set(sig, { ...cur, deep: data });   // persist streamed deep into cache
  };

  const run = async () => {
    if (!prod.trim() || !uat.trim()) { setErr(t("compare.needUrls")); return; }
    setErr(""); setBusy(true); setRes(null); setResSig(null); setFilter("all"); setQ(""); setOpen(new Set()); resetDeep();
    const h = window.uiLoading && window.uiLoading({ title: t("compare.running"), message: srcBase });
    let coverage;
    try {
      // coverage first (fast) — never deep here; deep streams afterwards in batches.
      coverage = await compareSites({
        prodBase: srcBase, uatBase: tgtBase,
        sitemapUrl: sitemapFor(srcBase), uatSitemapUrl: sitemapFor(tgtBase),
      });
      cacheRef.current.set(curSig, { res: coverage, deep: {} });
      setRes(coverage); setResSig(curSig);
    } catch (e) {
      const msg = errMessage(e, t);
      setErr(msg);
      try { window.uiAlert && window.uiAlert({ title: t("compare.failed"), message: msg, danger: true }); } catch (_) { }
      setBusy(false); h && h.close();
      return;
    }
    setBusy(false); h && h.close();
    if (deep) runDeep(coverage, curSig);   // fire-and-forget streamed deep pass
  };

  const sm = res ? res.summary : null;
  const deepVals = Object.values(deepData);
  const deepDone = deepVals.length;
  const deepDiff = deepVals.filter(x => x && x.deepState !== "identical").length;
  const chips = sm ? [
    ["total", sm.total, t("compare.total")],
    ["match", sm.match, t("compare.match")],
    ["redirect", sm.redirect, t("compare.redirect")],
    ["missing", sm.missing_on_uat, t("compare.missing", { env: tgtShort })],
    ["broken", sm.broken_on_uat, t("compare.broken", { env: tgtShort })],
    ["error", sm.prod_error + sm.error, t("compare.error")],
    ["extra", sm.extra_on_uat, t("compare.extra", { env: tgtShort })],
    ...(deepDone ? [
      ["deepc", deepDone, t("compare.deep.compared")],
      ["deepd", deepDiff, t("compare.deep.diff")],
    ] : []),
  ] : [];
  const cats = sm ? [
    ["all", t("compare.cat.all"), sm.total],
    ["match", t("compare.match"), sm.match],
    ["redirect", t("compare.redirect"), sm.redirect],
    ["missing", t("compare.missing", { env: tgtShort }), sm.missing_on_uat],
    ["broken", t("compare.broken", { env: tgtShort }), sm.broken_on_uat],
    ["other", t("compare.cat.other"), sm.prod_error + sm.error],
  ] : [];
  const ql = q.trim().toLowerCase();
  const shown = res ? res.items.filter(it =>
    (filter === "all" || catOf(it.state) === filter) && (!ql || it.path.toLowerCase().includes(ql))
  ) : [];

  // direction-aware state badge label (prod_error → "<source> error")
  const stateLabel = (s) => s === "prod_error" ? t("compare.state.prod_error", { env: srcShort }) : t("compare.state." + s);

  const thCell = { padding: "8px 14px", textAlign: "left", color: "var(--ink-3)", fontSize: 11, fontWeight: 600, borderBottom: "1px solid var(--line)", whiteSpace: "nowrap" };
  const tdCell = { padding: "10px 14px", verticalAlign: "top", borderTop: "1px solid var(--line-soft)" };

  return (
    <div className="content-pad fade-in">
      <PageHead kicker={t("compare.kicker")} title={t("compare.title")} tag="local"
        desc={t("compare.desc")} />

      <Panel title={t("compare.inputs")} en="INPUTS" icon="🔀">
        <div className="col" style={{ gap: 14 }}>
          <div className="bf"><label className="bf-label">{t("compare.f.prod")}</label>
            <input className="bf-input" value={prod} onChange={e => setProd(e.target.value)} placeholder={t("compare.f.prodPh")} /></div>
          <div className="bf"><label className="bf-label">{t("compare.f.uat")}</label>
            <input className="bf-input" value={uat} onChange={e => setUat(e.target.value)} placeholder={t("compare.f.uatPh")} /></div>

          <div className="bf"><label className="bf-label">{t("compare.dir.label")}</label>
            <div className="seg-toggle">
              <button type="button" className={dir === "p2u" ? "on" : ""} onClick={() => setDirection("p2u")}>{t("compare.dir.p2u")}</button>
              <button type="button" className={dir === "u2p" ? "on" : ""} onClick={() => setDirection("u2p")}>{t("compare.dir.u2p")}</button>
            </div>
            <div className="qei-note">{t("compare.dir.note", { src: srcShort, tgt: tgtShort })}</div>
          </div>

          <div className="bf">
            <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Switch checked={deep} onChange={setDeep} label={t("compare.deep.toggle")} />
              {deep && (
                <span className="row" style={{ gap: 6, alignItems: "center" }}>
                  <span className="bf-label" style={{ margin: 0 }}>{t("compare.deep.limit")}</span>
                  <input className="bf-input" type="number" min={1} max={500} value={deepLimit}
                    onChange={e => setDeepLimit(e.target.value)} style={{ width: 90, height: 32 }} />
                </span>
              )}
            </div>
            <div className="qei-note">{t("compare.deep.note")}</div>
          </div>

          {(prodSitemap || uatSitemap) && (
            <div className="bf">
              <label className="bf-label">{t("compare.autoSitemap")}</label>
              <div className="qei-note mono" style={{ fontSize: 11 }}>
                {prodSitemap && <div>PROD → {prodSitemap}{srcShort === "PROD" ? "  ★" : ""}</div>}
                {uatSitemap && <div>UAT → {uatSitemap}{srcShort === "UAT" ? "  ★" : ""}</div>}
              </div>
            </div>
          )}
          {err && <div className="qei-note" style={{ color: "var(--crimson)" }}>{err}</div>}
          {stale && <div className="qei-note" style={{ color: "var(--gold)" }}>⚠ {t("compare.cache.stale")}</div>}
          <div className="row" style={{ gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <Btn kind="gold" icon="🔀" onClick={run} style={{ opacity: busy ? .5 : 1, pointerEvents: busy ? "none" : "auto" }}>
              {busy ? t("compare.running") : t("compare.run")}
            </Btn>
            <span className="mono faint" style={{ fontSize: 12 }}>{srcShort} → {tgtShort}</span>
            {cached && <span className="mono" style={{ fontSize: 12, color: "var(--emerald)" }}>● {t("compare.cache.cached")}</span>}
            {cacheRef.current.size > 0 && (
              <Btn kind="ghost" sm icon="🗑" style={{ marginLeft: "auto" }} onClick={clearCache}>
                {t("compare.cache.clear")} ({cacheRef.current.size})
              </Btn>
            )}
          </div>
        </div>
      </Panel>

      {res && (
        <>
          <div className="grid cols-4 stagger" style={{ margin: "18px 0" }}>
            {chips.map(([k, n, label]) => <StatTile key={k} label={label} value={n} />)}
          </div>

          {deepProg && (
            <div style={{ margin: "0 0 14px" }}>
              <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 5 }}>
                <span className="typing-bubble" style={{ display: "inline-flex" }}><span /><span /><span /></span>
                <span className="mono faint" style={{ fontSize: 12 }}>{t("compare.deep.loading", { done: deepProg.done, total: deepProg.total })}</span>
              </div>
              <div className="task-prog-track"><div className="task-prog-fill" style={{ width: Math.round(deepProg.done / deepProg.total * 100) + "%" }} /></div>
            </div>
          )}

          <Panel title={t("compare.results")} en="COVERAGE" icon="📋" bodyPad={false}
            right={<span className="mono faint" style={{ fontSize: 11 }}>{shown.length}/{res.items.length}</span>}>
            {res.items.length === 0
              ? <div style={{ padding: 16 }}><Empty icon="🔀" title={t("compare.empty.title")} sub={t("compare.empty.sub")} /></div>
              : (
                <>
                  <div className="cmp-filterbar" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", padding: "12px 14px" }}>
                    {cats.map(([k, label, n]) => (
                      <button key={k} className={`tab-pill ${filter === k ? "on" : ""}`} disabled={n === 0 && k !== "all"} onClick={() => setFilter(k)}>
                        {label} <span className="mono faint">{n}</span>
                      </button>
                    ))}
                    <div className="cmp-search" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
                      <span className="rs-ic">🔍</span>
                      <input className="bf-input" style={{ height: 30, width: 190 }} value={q} onChange={e => setQ(e.target.value)} placeholder={t("compare.searchPh")} />
                      {q && <button className="rs-clear" onClick={() => setQ("")}>✕</button>}
                    </div>
                  </div>
                  {shown.length === 0
                    ? <div style={{ padding: 16 }}><Empty icon="🔍" title={t("compare.noMatch")} sub={t("compare.noMatchSub")} /></div>
                    : (
                      <div style={{ overflowX: "auto" }}>
                        <table className="cmp-table" style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                          <thead>
                            <tr>
                              <th style={thCell}>{t("compare.col.state")}</th>
                              <th style={thCell}>{t("compare.col.path")}</th>
                              <th style={{ ...thCell, textAlign: "center" }}>{srcShort}</th>
                              <th style={{ ...thCell, textAlign: "center" }}>{tgtShort}</th>
                              <th style={thCell}>{t("compare.col.deep")}</th>
                              <th style={thCell}>{t("compare.col.note")}</th>
                              <th style={thCell} />
                            </tr>
                          </thead>
                          <tbody>
                            {shown.map((it, i) => {
                              const d = deepData[it.path] || it.deep;
                              const loading = deepTargets.has(it.path) && !d;
                              const isOpen = open.has(i);
                              return (
                              <React.Fragment key={i}>
                              <tr className={`${d ? "is-row" : ""} ${isOpen ? "is-open" : ""}`} style={{ cursor: d ? "pointer" : "default", opacity: loading ? .5 : 1 }} onClick={d ? () => toggleRow(i) : undefined}>
                                <td style={tdCell}>
                                  <span className={`badge ${STATE_TONE[it.state] || "idle"}`} style={{ whiteSpace: "nowrap" }}>
                                    <span className="dot" />{stateLabel(it.state)}
                                  </span>
                                </td>
                                <td style={{ ...tdCell, fontFamily: "var(--font-mono)", wordBreak: "break-all" }}>{it.path}</td>
                                <td style={{ ...tdCell, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>{it.prodStatus ?? "—"}</td>
                                <td style={{ ...tdCell, textAlign: "center", fontFamily: "var(--font-mono)", color: "var(--ink-2)" }}>{it.uatStatus ?? "—"}</td>
                                <td style={{ ...tdCell, whiteSpace: "nowrap" }}>
                                  {loading ? (
                                    <span className="cmp-skel" title={t("compare.deep.loadingRow")} />
                                  ) : d ? (
                                    <span className={`badge ${DEEP_TONE[d.deepState] || "idle"}`} title={t("compare.deep.expand")}>
                                      <span className="dot" />{t("compare.deep.state." + d.deepState)} <span className={`cmp-chev ${isOpen ? "is-open" : ""}`}>▸</span>
                                    </span>
                                  ) : <span className="mono faint">—</span>}
                                </td>
                                <td style={{ ...tdCell, color: "var(--ink-3)", fontSize: 12 }}>{it.note || ""}</td>
                                <td style={{ ...tdCell, whiteSpace: "nowrap" }}>
                                  <a className="rr-open mono" href={it.uatUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>{tgtShort} ↗</a>
                                </td>
                              </tr>
                              {d && isOpen && (
                                <tr className="cmp-detail">
                                  <td colSpan={7} style={{ padding: "12px 16px 18px" }}>
                                    <div className="cmp-grow"><div className="cmp-clip">
                                      <DeepDetail d={d} srcUrl={it.prodUrl} tgtUrl={it.uatUrl} srcShort={srcShort} tgtShort={tgtShort} t={t} />
                                    </div></div>
                                  </td>
                                </tr>
                              )}
                              </React.Fragment>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                </>
              )}
          </Panel>

          {res.extraOnUat && res.extraOnUat.length > 0 && (
            <Panel title={t("compare.extraTitle", { env: tgtShort, src: srcShort })} en={tgtShort + "-ONLY"} icon="➕" style={{ marginTop: 18 }}>
              <div className="col" style={{ gap: 5 }}>
                {res.extraOnUat.map((u, i) => <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-2)" }}>{u}</div>)}
              </div>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

export { Compare };
