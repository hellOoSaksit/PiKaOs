/* ============================================================
   SITEMAP MATCH — ported from the GuildOS prototype
   (GuildOS/screens-sitemap.jsx). The mock `run()` / localStorage
   override maps are replaced by real calls to the FastAPI backend
   (lxml crawl + rapidfuzz match + Postgres-backed vocabulary).
   All UI strings come from src/locales/<lang>.json via makeT().
   ============================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { makeT, type Lang } from "./i18n";
import type { Category, LogEntry, ScanItem, ScanResult, Term, TrainFile } from "./types";
import { Btn, Empty, PageHead, Panel } from "./ui";

interface Settings {
  model: string;
  apiMode: string;
  engine: string;
  useAi: boolean;
  apiUrl?: string;
  apiKey?: string;
  bypassPopup?: boolean;
  deep?: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  model: "Qwen 3.6 32B",
  apiMode: "Local · Ollama (dev)",
  engine: "rapidfuzz (fuzzy)",
  useAi: false,
  bypassPopup: true,
};

const UNCLEAR = 18;
export const VERSION_LABEL = "0.1 · Sitemap · Beta";

const PIPE: [string, string][] = [
  ["🗺️", "pipe.vocab"],
  ["🧩", "pipe.format"],
  ["🌐", "pipe.fetch"],
  ["⚖️", "pipe.compare"],
  ["📑", "pipe.report"],
];

export function SitemapAudit({ lang, can, actor }: { lang: Lang; can?: (p: string) => boolean; actor?: string }) {
  const t = makeT(lang);
  const canEdit = !can || can("codex.manage");
  const me = actor || "ผู้ใช้";

  const [cats, setCats] = useState<Category[]>([]);
  const [cat, setCat] = useState("");
  const [terms, setTerms] = useState<Term[]>([]);
  const [train, setTrain] = useState<TrainFile[]>([]);
  const [log, setLog] = useState<LogEntry[]>([]);

  const [url, setUrl] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);
  const [tab, setTab] = useState<"url" | "map" | "log" | "settings">("url");
  const [passTh, setPassTh] = useState(70);

  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const s = JSON.parse(localStorage.getItem("pikaos.sitemap.settings") || "null");
      if (s) return s;
    } catch {
      /* ignore */
    }
    return DEFAULT_SETTINGS;
  });
  const setSetting = (k: keyof Settings, v: unknown) => {
    const nx = { ...settings, [k]: v };
    setSettings(nx);
    try {
      localStorage.setItem("pikaos.sitemap.settings", JSON.stringify(nx));
    } catch {
      /* ignore */
    }
  };

  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatFrom, setNewCatFrom] = useState<string[]>([]);
  const [addVocab, setAddVocab] = useState<{ key: string; alias: string; q?: string | null; open?: boolean } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const curCat = cats.find((c) => c.key === cat);
  const isDerived = !!curCat && curCat.from.length > 0;
  const readOnly = isDerived || !canEdit;

  // ---- loaders ----
  const loadCats = useCallback(async () => {
    const cs = await api.categories();
    setCats(cs);
    setCat((prev) => (prev && cs.some((c) => c.key === prev) ? prev : cs[0]?.key || ""));
  }, []);

  const loadVocab = useCallback(async (c: string) => {
    if (!c) return setTerms([]);
    setTerms(await api.vocab(c));
  }, []);

  const loadTrain = useCallback(async (c: string) => {
    if (!c) return setTrain([]);
    try {
      setTrain(await api.train(c));
    } catch {
      setTrain([]);
    }
  }, []);

  const loadLog = useCallback(async () => setLog(await api.log()), []);

  useEffect(() => {
    loadCats().catch((e) => setErr(String(e.message || e)));
  }, [loadCats]);
  useEffect(() => {
    if (cat) {
      loadVocab(cat).catch(() => {});
      loadTrain(cat).catch(() => {});
    }
  }, [cat, loadVocab, loadTrain]);
  useEffect(() => {
    if (tab === "log") loadLog().catch(() => {});
  }, [tab, loadLog]);

  const refreshVocab = () => loadVocab(cat).catch(() => {});

  // ---- vocab edits ----
  const addTerm = async () => {
    const canon = window.prompt(t("prompt.addTerm"));
    if (!canon || !canon.trim()) return;
    const th = window.prompt(t("prompt.addTermTh")) || canon;
    await api.addTerm(cat, { canon: canon.trim(), th: th.trim() }, me);
    refreshVocab();
  };
  const editCanon = async (id: string, cur: string) => {
    const n = window.prompt(t("prompt.editCanon"), cur);
    if (!n || n === cur) return;
    await api.updateTerm(id, { canon: n.trim() }, me);
    refreshVocab();
  };
  const editTerm = async (id: string, cur: string) => {
    const n = window.prompt(t("prompt.editTerm"), cur);
    if (!n || n === cur) return;
    await api.updateTerm(id, { th: n.trim() }, me);
    refreshVocab();
  };
  const removeTerm = async (id: string, canon: string) => {
    if (!window.confirm(t("prompt.removeTerm", { canon }))) return;
    await api.deleteTerm(id, me);
    refreshVocab();
  };
  const addAlias = async (id: string) => {
    const n = window.prompt(t("prompt.addAlias"));
    if (!n || !n.trim()) return;
    await api.addAlias(id, n.trim(), me);
    refreshVocab();
  };
  const editAlias = async (id: string, a: string) => {
    const n = window.prompt(t("prompt.editAlias"), a);
    if (!n || n === a) return;
    await api.removeAlias(id, a, me);
    await api.addAlias(id, n.trim(), me);
    refreshVocab();
  };
  const removeAlias = async (id: string, a: string) => {
    await api.removeAlias(id, a, me);
    refreshVocab();
  };

  // ---- category edits ----
  const createCat = async () => {
    const k = newCatName.trim();
    if (!k) return;
    await api.createCategory({ key: k, label: k, from: newCatFrom }, me);
    setAddingCat(false);
    setNewCatName("");
    setNewCatFrom([]);
    await loadCats();
    setCat(k);
  };
  const toggleFrom = (k: string) => setNewCatFrom((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));
  const deleteCat = async (k: string) => {
    if (!window.confirm(t("prompt.deleteCat", { cat: k }))) return;
    try {
      await api.deleteCategory(k, me);
    } catch (e) {
      window.alert(String((e as Error).message));
      return;
    }
    await loadCats();
  };

  // ---- training ----
  const addTrain = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    for (const f of files) {
      try {
        await api.uploadTrain(cat, f, me);
      } catch (er) {
        window.alert(`${f.name}: ${(er as Error).message}`);
      }
    }
    loadTrain(cat);
    refreshVocab();
  };
  const removeTrain = async (id: string) => {
    await api.deleteTrain(id);
    loadTrain(cat);
  };

  // ---- scan ----
  const run = async (u?: string) => {
    const target = (u ?? url).trim();
    if (!target) return;
    setBusy(true);
    setResult(null);
    setErr(null);
    try {
      const r = await api.scan({ url: target, category: cat, passThreshold: passTh, bypassPopup: settings.bypassPopup !== false, deep: !!settings.deep });
      setResult(r);
    } catch (e) {
      setErr(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  // ---- classification (mirrors backend; live re-classify on slider) ----
  const statusOf = (i: ScanItem) =>
    i.conf >= passTh ? "complete" : i.conf >= passTh - UNCLEAR ? "unclear" : "missing";
  const complete = result ? result.items.filter((i) => statusOf(i) === "complete") : [];
  const unclear = result ? result.items.filter((i) => statusOf(i) === "unclear") : [];
  const missing = result ? result.items.filter((i) => statusOf(i) === "missing") : [];
  const score = result && result.items.length ? Math.round((complete.length / result.items.length) * 100) : 0;
  const grade =
    score >= 80 ? { t: t("grade.strong"), c: "ok" } : score >= 55 ? { t: t("grade.partial"), c: "warn" } : { t: t("grade.low"), c: "bad" };

  const evHref = (i: ScanItem) => {
    let b = (result ? result.url : "").replace(/\/+$/, "");
    if (b && !/^https?:\/\//.test(b)) b = "https://" + b;
    if (i.evPath && i.evPath !== "/") b = b.replace(/(https?:\/\/[^/]+).*/, "$1") + i.evPath;
    return b + (i.pageTerm ? "#:~:text=" + encodeURIComponent(i.pageTerm) : "");
  };

  const confirmUnclear = (i: ScanItem) => setAddVocab({ key: i.key, alias: i.pageTerm || "" });
  const submitVocab = async () => {
    if (!addVocab) return;
    const v = String(addVocab.alias || "").trim();
    if (v) await api.addAlias(addVocab.key, v, me);
    await api.updateTerm(addVocab.key, { confirmed: true }, me);
    setAddVocab(null);
    refreshVocab();
    if (result) run(result.url); // rescan so the confirmed item moves to "complete"
  };

  const catJson = JSON.stringify(
    {
      category: cat,
      passThreshold: passTh,
      vocab: terms.map((t) => ({ canon: t.canon, th: t.th, aliases: t.aliases })),
      trainedFiles: train.map((t) => ({ file: t.name, rows: t.rows })),
    },
    null,
    2
  );

  const downloadReport = () => {
    if (!result) return;
    const ev = (i: ScanItem) => ({ pageTerm: i.pageTerm, matchedTo: i.canon, category: i.category, confidence: i.conf, aliasDiff: i.alias, evidence: i.evTag + " · " + i.evPath });
    const rep = {
      url: result.url,
      category: result.cat,
      scannedAt: result.scannedAt,
      passThreshold: passTh,
      score,
      complete: complete.map(ev),
      unclear: unclear.map(ev),
      missing: missing.map((i) => ({ canon: i.canon, th: i.th, category: i.category })),
    };
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "sitemap-report-" + result.url.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_") + ".json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  return (
    <div className="content-pad fade-in">
      <PageHead kicker={t("head.kicker")} title={t("head.title")} tag={`v${VERSION_LABEL}`} desc={t("head.desc")} />

      <div className="sm-pipe">
        {PIPE.map(([ic, k]) => (
          <div className="sm-pstage" key={k}>
            <div className="sm-pico">{ic}</div>
            <div className="sm-pt">{t(`${k}.t`)}</div>
            <div className="sm-pd">{t(`${k}.d`)}</div>
          </div>
        ))}
      </div>

      {/* categories */}
      <div className="sm-section-h mono">{t("cats.section")}</div>
      <div className="sm-cats">
        {cats.map((c) => (
          <button key={c.key} className={`sm-cat ${cat === c.key ? "on" : ""}`} onClick={() => setCat(c.key)}>
            {c.label}
            {c.from.length > 0 ? t("cats.combined") : ""}
          </button>
        ))}
        {canEdit && <button className="sm-cat add" onClick={() => setAddingCat((v) => !v)}>{t("cats.add")}</button>}
        {cat && canEdit && <button className="sm-cat del" onClick={() => deleteCat(cat)}>{t("cats.delete", { cat })}</button>}
      </div>
      {addingCat && (
        <div className="sm-addcat">
          <div className="sm-addcat-row">
            <input className="bf-input" style={{ maxWidth: 220 }} value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder={t("addcat.namePh")} />
            <Btn kind="gold" sm onClick={createCat} style={{ opacity: newCatName.trim() ? 1 : 0.5, pointerEvents: newCatName.trim() ? "auto" : "none" }}>{t("addcat.create")}</Btn>
            <Btn kind="ghost" sm onClick={() => { setAddingCat(false); setNewCatName(""); setNewCatFrom([]); }}>{t("common.cancel")}</Btn>
          </div>
          <div className="sm-addcat-from">
            <span className="mono muted" style={{ fontSize: 12 }}>{t("addcat.from")}</span>
            <select className="bf-input" style={{ maxWidth: 240 }} value="" onChange={(e) => { if (e.target.value) { toggleFrom(e.target.value); e.target.value = ""; } }}>
              <option value="">{t("addcat.pickSource")}</option>
              {cats.filter((c) => c.from.length === 0 && !newCatFrom.includes(c.key)).map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
            {newCatFrom.map((k) => (
              <span key={k} className="sm-fromchip on">{k}<button onClick={() => toggleFrom(k)}>✕</button></span>
            ))}
            {newCatFrom.length === 0 && <span className="mono faint" style={{ fontSize: 11 }}>{t("addcat.emptyHint")}</span>}
          </div>
        </div>
      )}

      <div className="sm-subtabs">
        <button className={`sm-subtab ${tab === "url" ? "on" : ""}`} onClick={() => setTab("url")}>{t("tab.url")}</button>
        <button className={`sm-subtab ${tab === "map" ? "on" : ""}`} onClick={() => setTab("map")}>{t("tab.map")}</button>
        <button className={`sm-subtab ${tab === "log" ? "on" : ""}`} onClick={() => setTab("log")}>{t("tab.log")}</button>
        {canEdit && <button className={`sm-subtab ${tab === "settings" ? "on" : ""}`} onClick={() => setTab("settings")}>{t("tab.settings")}</button>}
      </div>

      {tab === "log" ? (
        <div className="sm-logwrap">
          <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {t("log.title")}
            {canEdit && log.length > 0 && <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={async () => { await api.clearLog(); loadLog(); }}>{t("log.clear")}</button>}
          </div>
          {log.length === 0 ? (
            <Empty icon="📜" title={t("log.empty.title")} sub={t("log.empty.sub")} />
          ) : (
            <div className="sm-log">
              {log.map((l) => (
                <div key={l.id} className="sm-logrow">
                  <span className="sm-log-act">{l.action}</span>
                  <span className="sm-log-detail">{l.detail}</span>
                  <span className="sm-log-actor mono">👤 {l.actor}</span>
                  <span className="sm-log-time mono">{new Date(l.ts).toLocaleString(lang === "en" ? "en-US" : "th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : tab === "settings" && canEdit ? (
        <div className="sm-settings">
          <div className="sm-set-row">
            <label className="sm-set-label">{t("settings.model")}</label>
            <select className="bf-input" value={settings.model} onChange={(e) => setSetting("model", e.target.value)}>
              {["Qwen 3.6 32B", "GLM 5.1", "Llama 3.3 70B", "ไม่ใช้ AI (rule-based)"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <span className="sm-set-hint">{t("settings.model.hint")}</span>
          </div>
          <div className="sm-set-row">
            <label className="sm-set-label">{t("settings.apiMode")}</label>
            <select className="bf-input" value={settings.apiMode} onChange={(e) => setSetting("apiMode", e.target.value)}>
              {["Local · Ollama (dev)", "Local · vLLM (prod)", "Cloud API", "MCP"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <span className="sm-set-hint">{t("settings.apiMode.hint")}</span>
          </div>
          <div className="sm-set-row">
            <label className="sm-set-label">{t("settings.endpoint")}</label>
            <input className="bf-input" style={{ maxWidth: 300 }} value={settings.apiUrl || ""} onChange={(e) => setSetting("apiUrl", e.target.value)} placeholder="http://localhost:11434/v1" />
            <span className="sm-set-hint">{t("settings.endpoint.hint")}</span>
          </div>
          <div className="sm-set-row">
            <label className="sm-set-label">{t("settings.engine")}</label>
            <select className="bf-input" value={settings.engine} onChange={(e) => setSetting("engine", e.target.value)}>
              {["rapidfuzz (fuzzy)", "AI semantic", "exact match"].map((m) => <option key={m}>{m}</option>)}
            </select>
            <span className="sm-set-hint">{t("settings.engine.hint")}</span>
          </div>
          <label className="sm-set-toggle">
            <input type="checkbox" checked={settings.useAi} onChange={(e) => setSetting("useAi", e.target.checked)} />
            <span>{t("settings.useAi")}</span>
          </label>
          <label className="sm-set-toggle">
            <input type="checkbox" checked={settings.bypassPopup !== false} onChange={(e) => setSetting("bypassPopup", e.target.checked)} />
            <span>{t("settings.bypass")}</span>
          </label>
          <div className="sm-set-note mono">{t("settings.note")}</div>
        </div>
      ) : tab === "map" ? (
        <>
          <div className="sm-train">
            <div className="sm-train-head">
              <span className="mono muted" style={{ fontSize: 12.5 }}>{t("train.summary", { files: train.length, terms: terms.length, cat })}</span>
              <button className="sm-jsonbtn" onClick={() => setShowJson((v) => !v)}>{showJson ? t("train.hideJson") : t("train.viewJson")}</button>
              <a className="sm-jsonbtn" href="/api/sitemap/train/template" download title={t("train.template.title")}>{t("train.template")}</a>
              {terms.length > 0 && <a className="sm-jsonbtn" href={`/api/sitemap/train/export/${encodeURIComponent(cat)}`} download title={t("train.export.title")}>{t("train.export")}</a>}
              {!readOnly && <button className="sm-up" onClick={() => fileRef.current?.click()}>{t("train.upload")}</button>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: "none" }} onChange={addTrain} />
            </div>
            {readOnly && isDerived && <div className="sm-readonly mono">{t("train.readonly", { sources: curCat!.from.join(" + ") })}</div>}
            {showJson && <pre className="sm-json">{catJson}</pre>}
            {train.length > 0 && (
              <div className="sm-train-list">
                {train.map((tr) => (
                  <div key={tr.id} className="sm-tr">
                    <span className="sm-tr-ic">📊</span>
                    <div className="sm-tr-body"><div className="sm-tr-name mono">{tr.name}</div><div className="sm-tr-meta">{t("train.rows", { rows: tr.rows, cat: tr.category })}</div></div>
                    <button className="sm-tr-x" onClick={() => removeTrain(tr.id)} title={t("common.cancel")}>✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {t("map.title")}
            {!readOnly && <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={addTerm}>{t("map.addTerm")}</button>}
          </div>
          {!readOnly && <div className="mono faint" style={{ fontSize: 11, margin: "-4px 0 8px" }}>{t("map.hint")}</div>}
          <div className="sm-map">
            {terms.length === 0 && <div className="muted" style={{ fontSize: 13, padding: "10px 2px" }}>{t("map.empty")}</div>}
            {terms.map((term) => (
              <div key={term.key} className="sm-maprow">
                <div className="sm-mapkey">
                  <div className="sm-mapcanon mono">{term.canon}{!readOnly && <button className="sm-edit" onClick={() => editCanon(term.key, term.canon)}>✎</button>}</div>
                  <div className="sm-mapth">{term.th}{!readOnly && <button className="sm-edit" onClick={() => editTerm(term.key, term.th)}>✎</button>}</div>
                  <span className="sm-item-cat mono">{term.category}</span>
                </div>
                <span className="sm-arrow">→</span>
                <div className="sm-mapvars">
                  {term.aliases.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{t("map.noAlias")}</span>}
                  {term.aliases.map((a) => (
                    <span key={a} className="sm-var">{a}{!readOnly && <><button onClick={() => editAlias(term.key, a)}>✎</button><button onClick={() => removeAlias(term.key, a)}>✕</button></>}</span>
                  ))}
                  {!readOnly && <button className="sm-var add" onClick={() => addAlias(term.key)}>＋</button>}
                </div>
                {!readOnly && <button className="sm-maprow-del" onClick={() => removeTerm(term.key, term.canon)}>🗑</button>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          <div className="sm-bar">
            <span className="sm-ic">🔗</span>
            <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()} placeholder={t("scan.urlPh")} />
            {url && <button className="sm-clear" onClick={() => setUrl("")}>✕</button>}
            <Btn kind="gold" icon="🔍" onClick={() => run()}>{t("scan.match")}</Btn>
          </div>
          <label className="sm-aicheck">
            <input type="checkbox" checked={settings.useAi} onChange={(e) => setSetting("useAi", e.target.checked)} />
            <span>{t("scan.aiCheck")} <span className="mono faint">({settings.model} · {settings.apiMode})</span></span>
          </label>
          <label className="sm-aicheck">
            <input type="checkbox" checked={settings.bypassPopup !== false} onChange={(e) => setSetting("bypassPopup", e.target.checked)} />
            <span>{t("scan.bypass")} <span className="mono faint">{t("scan.bypassHint")}</span></span>
          </label>
          <label className="sm-aicheck">
            <input type="checkbox" checked={!!settings.deep} onChange={(e) => setSetting("deep", e.target.checked)} />
            <span>{t("scan.deep")} <span className="mono faint">{t("scan.deepHint")}</span></span>
          </label>
          <div className="sm-examples">
            <span className="mono faint">{t("scan.try")}:</span>
            {["www.set.or.th", "www.scb.co.th", "www.cpall.co.th"].map((e) => (
              <button key={e} className="sm-chip" onClick={() => { setUrl("https://" + e); run("https://" + e); }}>{e}</button>
            ))}
          </div>
          <div className="sm-thbar">
            <span className="mono muted" style={{ fontSize: 12.5 }}>{t("scan.threshold")}</span>
            <input type="range" min={50} max={95} step={5} value={passTh} onChange={(e) => setPassTh(+e.target.value)} />
            <span className="sm-thval mono">{passTh}%</span>
            <span className="mono faint" style={{ fontSize: 11 }}>{t("scan.bandHint", { lo: passTh - 18, hi: passTh })}</span>
          </div>

          {busy && <Panel><div className="sm-loading"><span className="typing-bubble"><span /><span /><span /></span> {t("scan.loading")}</div></Panel>}
          {err && !busy && <div className="sm-readonly mono" style={{ borderColor: "var(--crimson)", color: "var(--crimson)" }}>⚠️ {err}</div>}
          {!busy && !result && !err && <Empty icon="🗺️" title={t("scan.noscan.title")} sub={t("scan.noscan.sub")} />}

          {!busy && result && (
            <>
              <div className="sm-summary">
                <div className={`sm-score ${grade.c}`}>
                  <div className="sm-score-num">{score}<span>%</span></div>
                  <div className="sm-score-lbl mono">{t("summary.matched")}</div>
                </div>
                <div className="sm-sumdetail">
                  <div className="sm-target mono">{t("summary.target", { url: result.url, cat: result.cat, n: result.pageTermsFound })}{result.rendered && <span className="sm-aliastag" style={{ marginLeft: 8 }}>{t("summary.rendered")}</span>}</div>
                  <div className="sm-track"><div className={`sm-fill ${grade.c}`} style={{ width: score + "%" }} /></div>
                  <div className="sm-counts">
                    <span className={`sm-grade ${grade.c}`}>{grade.t}</span>
                    <span className="sm-cnt ok">{t("count.complete", { n: complete.length })}</span>
                    <span className="sm-cnt unclear">{t("count.unclear", { n: unclear.length })}</span>
                    <span className="sm-cnt miss">{t("count.missing", { n: missing.length })}</span>
                    <span className="mono faint" style={{ fontSize: 11 }}>{t("summary.threshold", { th: passTh })}</span>
                  </div>
                </div>
              </div>

              <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                {t("report.title")}
                <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={downloadReport}>{t("report.download")}</button>
              </div>
              <div className="sm-cols sm-cols3">
                <div className="sm-col">
                  <div className="sm-col-head ok">{t("col.complete")} <span>{complete.length}</span></div>
                  {complete.length === 0 ? <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>{t("common.dash")}</div> : complete.map((i) => (
                    <div key={i.key} className="sm-item ok">
                      <span className="sm-item-mark">✓</span>
                      <div className="sm-item-body">
                        <div className="sm-match-row"><span className="sm-page">“{i.pageTerm}”</span><span className="sm-arrow">→</span><span className="sm-canon mono">{i.canon}</span></div>
                        <div className="sm-item-desc">{i.th}{i.alias && <span className="sm-aliastag">{t("item.aliasTag")}</span>}</div>
                        <a className="sm-evid mono sm-evlink" href={evHref(i)} target="_blank" rel="noopener noreferrer">{t("item.foundIn", { tag: i.evTag, path: i.evPath })}</a>
                      </div>
                      <span className="sm-conf mono">{i.conf}%</span>
                    </div>
                  ))}
                </div>
                <div className="sm-col">
                  <div className="sm-col-head unclear">{t("col.unclear")} <span>{unclear.length}</span></div>
                  {unclear.length === 0 ? <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>{t("common.dash")}</div> : unclear.map((i) => (
                    <div key={i.key} className="sm-item unclear">
                      <span className="sm-item-mark">?</span>
                      <div className="sm-item-body">
                        <div className="sm-match-row"><span className="sm-page">“{i.pageTerm}”</span><span className="sm-arrow">→</span><span className="sm-canon mono">{i.canon}</span></div>
                        <div className="sm-item-desc">{t("item.unclearDesc")}</div>
                        <a className="sm-evid mono sm-evlink" href={evHref(i)} target="_blank" rel="noopener noreferrer">{t("item.maybeIn", { tag: i.evTag, path: i.evPath })}</a>
                        {canEdit && <button className="sm-addvocab" onClick={() => confirmUnclear(i)}>{t("item.addVocab")}</button>}
                      </div>
                      <span className="sm-conf mono warn">{i.conf}%</span>
                    </div>
                  ))}
                </div>
                <div className="sm-col">
                  <div className="sm-col-head miss">{t("col.missing")} <span>{missing.length}</span></div>
                  {missing.length === 0 ? <div className="sm-allgood">{t("item.allgood")}</div> : missing.map((i) => (
                    <div key={i.key} className="sm-item miss">
                      <span className="sm-item-mark">!</span>
                      <div className="sm-item-body"><div className="sm-item-name mono">{i.canon}</div><div className="sm-item-desc">{t("item.notFound", { th: i.th })}</div></div>
                      <span className="sm-item-cat mono">{i.category}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {addVocab && (
        <div className="uim-overlay" onClick={() => setAddVocab(null)}>
          <div className="uim ornate" onClick={(e) => e.stopPropagation()} style={{ width: 430 }}>
            <div className="uim-title">{t("modal.title")}</div>
            <div className="bf">
              <label className="bf-label">{t("modal.headLabel")}</label>
              {(() => {
                const sel = terms.find((x) => x.key === addVocab.key);
                const q = addVocab.q;
                const shown = terms.filter((x) => q == null || q === "" || (x.canon + " " + x.th).toLowerCase().includes(String(q).toLowerCase()));
                return (
                  <div className="sm-combo">
                    <input
                      className="bf-input"
                      value={q != null ? q : sel ? sel.canon + " · " + sel.th : ""}
                      placeholder={t("modal.headPh")}
                      onChange={(e) => setAddVocab({ ...addVocab, q: e.target.value, open: true })}
                      onFocus={() => setAddVocab({ ...addVocab, q: "", open: true })}
                    />
                    {addVocab.open && (
                      <div className="sm-combo-list">
                        {shown.length === 0 && <div className="sm-combo-empty">{t("modal.comboEmpty")}</div>}
                        {shown.map((x) => (
                          <button key={x.key} type="button" className={x.key === addVocab.key ? "on" : ""} onClick={() => setAddVocab({ ...addVocab, key: x.key, q: null, open: false })}>
                            {x.canon} · {x.th}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="bf">
              <label className="bf-label">{t("modal.subLabel")}</label>
              <input className="bf-input" value={addVocab.alias} onChange={(e) => setAddVocab({ ...addVocab, alias: e.target.value })} placeholder={t("modal.subPh")} autoFocus />
            </div>
            <div className="uim-actions">
              <button className="uim-btn ghost" onClick={() => setAddVocab(null)}>{t("common.cancel")}</button>
              <button className="uim-btn primary" onClick={submitVocab} disabled={!String(addVocab.alias || "").trim()}>{t("modal.confirm")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
