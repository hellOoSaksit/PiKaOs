/* PiKaOs — ES module (migrated from PiKaOs-Main/screens-sitemap.jsx).
   หน้านี้ใช้ระบบ i18n แบบ key-based เต็มรูปแบบ — ทุกข้อความมาจาก t("key")
   (ไฟล์คำแปล: src/data/i18n/<lang>-<style>.json) ไม่มี hardcode ข้อความในโค้ด */
import React from 'react';
const { useState, useRef } = React;
import { Btn, Empty, PageHead, Panel } from '../components/components.jsx';
import { Select } from '../components/ui/Dropdown.jsx';

/* ============================================================
   SITEMAP MATCH — train a vocabulary from Excel files per
   category (IR / WD / IR+WD / …), then scan a URL (lxml) and
   match the page's terms to our canonical sitemap terms — even
   when the wording differs but the meaning is the same.
   ============================================================ */
function smHash(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }

const SM_BASE_CATS = [
  { key: "IR", label: "IR · นักลงทุนสัมพันธ์" },
  { key: "WD", label: "WD · ข้อมูลเปิดเผยบนเว็บ" },
];
const SM_VOCAB = {
  IR: [
    { canon: "Share Price", th: "ราคาหลักทรัพย์", aliases: ["ราคาหุ้น", "stock price", "ราคาย้อนหลัง"] },
    { canon: "Financial Statements", th: "งบการเงิน", aliases: ["งบดุล", "ผลประกอบการ", "financials"] },
    { canon: "Annual Report", th: "รายงานประจำปี", aliases: ["56-1 One Report", "รายงานปี"] },
    { canon: "Dividend", th: "เงินปันผล", aliases: ["นโยบายปันผล", "dividend policy"] },
    { canon: "Shareholder Structure", th: "โครงสร้างผู้ถือหุ้น", aliases: ["ผู้ถือหุ้นรายใหญ่", "major shareholders"] },
    { canon: "IR Contact", th: "ติดต่อนักลงทุนสัมพันธ์", aliases: ["ติดต่อ IR", "investor contact"] },
  ],
  WD: [
    { canon: "Vision & Mission", th: "วิสัยทัศน์และพันธกิจ", aliases: ["วิสัยทัศน์", "vision"] },
    { canon: "Board of Directors", th: "คณะกรรมการบริษัท", aliases: ["กรรมการ", "board of directors"] },
    { canon: "Corporate Governance", th: "การกำกับดูแลกิจการ", aliases: ["CG", "บรรษัทภิบาล"] },
    { canon: "Nomination Policy", th: "นโยบายสรรหากรรมการ", aliases: ["การสรรหา", "nomination"] },
    { canon: "Anti-Corruption", th: "นโยบายต่อต้านทุจริต", aliases: ["CAC", "คอร์รัปชัน"] },
    { canon: "Sustainability", th: "ความยั่งยืน", aliases: ["ESG", "รายงานความยั่งยืน"] },
  ],
};
function smCatTerms(cat) {
  if (cat === "IRWD") return [...SM_VOCAB.IR.map(t => ({ ...t, category: "IR" })), ...SM_VOCAB.WD.map(t => ({ ...t, category: "WD" }))];
  return (SM_VOCAB[cat] || []).map(t => ({ ...t, category: cat }));
}
function smLoadTrain() { try { return JSON.parse(localStorage.getItem("guildos.sitemap.train") || "[]"); } catch (e) { return []; } }
function smSaveTrain(l) { try { localStorage.setItem("guildos.sitemap.train", JSON.stringify(l)); } catch (e) { } }

function SitemapAudit({ t, lang, can, actor }) {
  const canEdit = !can || can("codex.manage");
  const me = actor || t("log.actor");
  const [log, setLog] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.log") || "[]"); } catch (e) { return []; } });
  const slog = (action, detail) => { const e = { id: "lg" + Date.now() + Math.random().toString(36).slice(2, 5), actor: me, action, detail, ts: Date.now() }; const nx = [e, ...log].slice(0, 200); setLog(nx); try { localStorage.setItem("guildos.sitemap.log", JSON.stringify(nx)); } catch (e2) { } };
  const [cat, setCat] = useState("IR");
  const [customCats, setCustomCats] = useState(() => { try { const s = localStorage.getItem("guildos.sitemap.cats"); if (s) { const a = JSON.parse(s); if (Array.isArray(a) && a.length) return a; } } catch (e) { } return [{ key: "IRWD", label: "IR + WD", from: ["IR", "WD"] }]; });
  const [train, setTrain] = useState(smLoadTrain);
  const [url, setUrl] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [tab, setTab] = useState("url");
  const [passTh, setPassTh] = useState(70);
  const [settings, setSettings] = useState(() => { try { const s = JSON.parse(localStorage.getItem("guildos.sitemap.settings") || "null"); if (s) return s; } catch (e) { } return { model: "Qwen 3.6 32B", apiMode: "Local · Ollama (dev)", engine: "rapidfuzz (fuzzy)", useAi: false }; });
  const setSetting = (k, v) => { const nx = { ...settings, [k]: v }; setSettings(nx); try { localStorage.setItem("guildos.sitemap.settings", JSON.stringify(nx)); } catch (e) { } };
  const [addingCat, setAddingCat] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [newCatFrom, setNewCatFrom] = useState([]);
  const [aliasOv, setAliasOv] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.aliases") || "{}"); } catch (e) { return {}; } });
  const fileRef = useRef(null);
  const saveAliasOv = (o) => { setAliasOv(o); try { localStorage.setItem("guildos.sitemap.aliases", JSON.stringify(o)); } catch (e) { } };
  const [customTerms, setCustomTerms] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.terms") || "{}"); } catch (e) { return {}; } });
  const [removed, setRemoved] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.removed") || "[]"); } catch (e) { return []; } });
  const saveCustomTerms = (o) => { setCustomTerms(o); try { localStorage.setItem("guildos.sitemap.terms", JSON.stringify(o)); } catch (e) { } };
  const saveRemoved = (a) => { setRemoved(a); try { localStorage.setItem("guildos.sitemap.removed", JSON.stringify(a)); } catch (e) { } };
  const [hiddenCats, setHiddenCats] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.hiddencats") || "[]"); } catch (e) { return []; } });
  const saveHidden = (a) => { setHiddenCats(a); try { localStorage.setItem("guildos.sitemap.hiddencats", JSON.stringify(a)); } catch (e) { } };
  const [rmAlias, setRmAlias] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.rmalias") || "{}"); } catch (e) { return {}; } });
  const [thOver, setThOver] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.thover") || "{}"); } catch (e) { return {}; } });
  const [canonOver, setCanonOver] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.canonover") || "{}"); } catch (e) { return {}; } });
  const [confirmed, setConfirmed] = useState(() => { try { return JSON.parse(localStorage.getItem("guildos.sitemap.confirmed") || "[]"); } catch (e) { return []; } });
  const saveConfirmed = (a) => { setConfirmed(a); try { localStorage.setItem("guildos.sitemap.confirmed", JSON.stringify(a)); } catch (e) { } };
  const [addVocab, setAddVocab] = useState(null);
  const confirmUnclear = (i) => setAddVocab({ key: i.key, alias: i.pageTerm || "" });
  const submitVocab = () => {
    if (!addVocab) return; const key = addVocab.key; const v = String(addVocab.alias || "").trim();
    if (v) { const cur = aliasOv[key] || []; if (!cur.includes(v)) saveAliasOv({ ...aliasOv, [key]: [...cur, v] }); }
    saveConfirmed([...new Set([...confirmed, key])]);
    const cn = (mergedTerms(result ? result.cat : cat).find(t2 => t2.key === key) || {}).canon || key;
    slog(t("log.act.addUnclear"), v + " → " + cn);
    setAddVocab(null);
  };
  const saveRmAlias = (o) => { setRmAlias(o); try { localStorage.setItem("guildos.sitemap.rmalias", JSON.stringify(o)); } catch (e) { } };
  const saveThOver = (o) => { setThOver(o); try { localStorage.setItem("guildos.sitemap.thover", JSON.stringify(o)); } catch (e) { } };
  const saveCanonOver = (o) => { setCanonOver(o); try { localStorage.setItem("guildos.sitemap.canonover", JSON.stringify(o)); } catch (e) { } };
  const editAlias = async (key, a) => {
    const n = await (window.uiPrompt ? window.uiPrompt({ title: t("edit.alias.prompt"), defaultValue: a }) : Promise.resolve(false));
    if (!n || n === a) return;                                  // false = ยกเลิก
    delAliasRaw(key, a); const cur = aliasOv[key] || []; saveAliasOv({ ...aliasOv, [key]: [...cur, String(n).trim()] });
    slog(t("log.act.editAlias"), a + " → " + String(n).trim() + " · " + key);
  };
  const delAliasRaw = (key, a) => {
    const extra = aliasOv[key] || [];
    if (extra.includes(a)) saveAliasOv({ ...aliasOv, [key]: extra.filter(x => x !== a) });
    else saveRmAlias({ ...rmAlias, [key]: [...new Set([...(rmAlias[key] || []), a])] });
  };
  const editTerm = async (key, curTh) => {
    const n = await (window.uiPrompt ? window.uiPrompt({ title: t("edit.desc.title"), defaultValue: curTh }) : Promise.resolve(false));
    if (!n) return; saveThOver({ ...thOver, [key]: String(n).trim() }); slog(t("log.act.editDesc"), key + " → " + String(n).trim());
  };
  const editCanon = async (key, curCanon) => {
    const n = await (window.uiPrompt ? window.uiPrompt({ title: t("edit.canon.title"), defaultValue: curCanon }) : Promise.resolve(false));
    if (!n || n === curCanon) return; saveCanonOver({ ...canonOver, [key]: String(n).trim() }); slog(t("log.act.editCanon"), curCanon + " → " + String(n).trim());
  };
  const addTerm = async () => {
    const canon = await (window.uiPrompt ? window.uiPrompt({ title: t("add.canon.title"), placeholder: t("add.canon.ph") }) : Promise.resolve(""));
    if (!canon || !canon.trim()) return;
    const th = await (window.uiPrompt ? window.uiPrompt({ title: t("add.desc.title"), placeholder: t("add.desc.ph") }) : Promise.resolve(""));
    const cur = customTerms[cat] || [];
    saveCustomTerms({ ...customTerms, [cat]: [...cur, { canon: canon.trim(), th: (th || canon).trim(), aliases: [] }] });
    slog(t("log.act.addCanon"), canon.trim() + " " + t("log.inCat", { cat }));
  };
  const removeTerm = async (key) => {
    if (!(window.uiConfirm && await window.uiConfirm({ title: t("removeCanon.title"), message: t("removeCanon.msg", { key }), danger: true, confirmText: t("common.delete") }))) return;
    const cur = customTerms[cat] || [];
    if (cur.some(t2 => t2.canon === key)) saveCustomTerms({ ...customTerms, [cat]: cur.filter(t2 => t2.canon !== key) });
    else saveRemoved([...new Set([...removed, key])]);
    slog(t("log.act.removeCanon"), key + " " + t("log.inCat", { cat }));
  };
  const catKey = (c) => typeof c === "string" ? c : c.key;
  const customDef = (k) => customCats.map(c => typeof c === "string" ? { key: c, from: [] } : c).find(c => c.key === k);
  const derivedFrom = (c) => { if (c === "IRWD") return ["IR", "WD"]; const d = customDef(c); return d ? (d.from || []) : []; };
  const isDerived = (c) => derivedFrom(c).length > 0;
  const baseTermsFor = (c) => {
    if (SM_VOCAB[c]) return [...SM_VOCAB[c], ...(customTerms[c] || [])].filter(t2 => !removed.includes(t2.canon)).map(t2 => ({ ...t2, category: t2.category || c }));
    const from = derivedFrom(c);
    if (from.length) { const out = [], seen = {}; from.forEach(s => baseTermsFor(s).forEach(t2 => { if (!seen[t2.canon]) { seen[t2.canon] = 1; out.push(t2); } })); return out; }
    return (customTerms[c] || []).filter(t2 => !removed.includes(t2.canon)).map(t2 => ({ ...t2, category: t2.category || c }));
  };
  const mergedTerms = (c) => baseTermsFor(c).map(t2 => {
    const key = t2.canon;
    const rm = rmAlias[key] || [];
    const aliases = [...(t2.aliases || []), ...((aliasOv[key]) || [])].filter(a => !rm.includes(a));
    return { key, canon: canonOver[key] != null ? canonOver[key] : t2.canon, th: thOver[key] != null ? thOver[key] : t2.th, aliases, category: t2.category };
  });
  const isExtra = (canon, a) => ((aliasOv[canon]) || []).includes(a);
  const addAlias = async (canon) => {
    const n = (await (window.uiPrompt ? window.uiPrompt({ title: t("addAlias.title"), placeholder: t("addAlias.ph") }) : Promise.resolve("")));
    if (!n || !n.trim()) return; const cur = aliasOv[canon] || [];
    saveAliasOv({ ...aliasOv, [canon]: [...cur, n.trim()] });
    slog(t("log.act.addAlias"), n.trim() + " → " + canon);
  };
  const removeAlias = (canon, a) => { delAliasRaw(canon, a); slog(t("log.act.removeAlias"), a + " · " + canon); };
  // ป้ายหมวด = ข้อมูล (ผู้ใช้เพิ่ม/แก้/ลบเอง) — ไม่แปล · มีแค่คำต่อท้าย " · รวม/combined" ที่เป็น UI
  const cats = [...SM_BASE_CATS.filter(c => !hiddenCats.includes(c.key)),
    ...customCats.map(c => ({ key: catKey(c), label: ((typeof c === "object" && c.label) ? c.label : catKey(c)) + (isDerived(catKey(c)) ? t("cats.combined") : "") }))];
  const trainForCat = train.filter(t2 => isDerived(cat) ? false : t2.category === cat);
  const catJson = JSON.stringify({ category: cat, passThreshold: passTh, vocab: mergedTerms(cat).map(t2 => ({ canon: t2.canon, th: t2.th, aliases: t2.aliases })), trainedFiles: trainForCat.map(t2 => ({ file: t2.name, rows: t2.rows })) }, null, 2);
  const readOnly = isDerived(cat) || !canEdit;
  const downloadReport = () => {
    if (!result) return;
    const ev = i => ({ pageTerm: i.pageTerm, matchedTo: i.canon, category: i.category, confidence: i.conf, aliasDiff: i.alias, evidence: i.evTag + " · " + i.evPath });
    const rep = { url: result.url, category: result.cat, scannedAt: new Date(result.at).toISOString(), passThreshold: passTh, score,
      complete: complete.map(ev), unclear: unclear.map(ev), missing: missing.map(i => ({ canon: i.canon, th: i.th, category: i.category })) };
    const blob = new Blob([JSON.stringify(rep, null, 2)], { type: "application/json;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "sitemap-report-" + result.url.replace(/^https?:\/\//, "").replace(/[^\w.-]+/g, "_") + ".json"; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };

  const addTrain = (e) => {
    const files = [...e.target.files]; e.target.value = "";
    const add = files.map(f => ({ id: "tr" + Date.now() + Math.random().toString(36).slice(2, 5), name: f.name, category: cat, rows: Math.floor(Math.random() * 900) + 120, ts: Date.now() }));
    const nx = [...add, ...train]; setTrain(nx); smSaveTrain(nx);
    slog(t("log.act.addExcel"), add.map(f => f.name).join(", ") + " " + t("log.inCat", { cat }));
  };
  const removeTrain = (id) => { const nx = train.filter(t2 => t2.id !== id); setTrain(nx); smSaveTrain(nx); };
  const createCat = () => {
    const k = newCatName.trim(); if (!k) return;
    const def = { key: k, from: newCatFrom };
    const nx = [...customCats, def]; setCustomCats(nx); try { localStorage.setItem("guildos.sitemap.cats", JSON.stringify(nx)); } catch (e) { }
    setCat(k); setAddingCat(false); setNewCatName(""); setNewCatFrom([]);
  };
  const toggleFrom = (k) => setNewCatFrom(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k]);
  const deleteCat = async (k) => {
    const usedBy = customCats.map(c => typeof c === "object" ? c : { key: c, from: [] }).filter(c => (c.from || []).includes(k)).map(c => c.key);
    if (usedBy.length) { window.uiAlert && window.uiAlert({ title: t("deleteCat.cantTitle"), message: t("deleteCat.usedBy", { key: k, list: usedBy.join(", ") }) }); return; }
    if (!(window.uiConfirm && await window.uiConfirm({ title: t("deleteCat.title"), message: t("deleteCat.msg", { key: k }), danger: true, confirmText: t("deleteCat.confirm") }))) return;
    if (SM_VOCAB[k]) saveHidden([...new Set([...hiddenCats, k])]);
    else { const nx = customCats.filter(c => catKey(c) !== k); setCustomCats(nx); try { localStorage.setItem("guildos.sitemap.cats", JSON.stringify(nx)); } catch (e) { } }
    slog(t("log.act.deleteCat"), k);
    if (cat === k) { const rem = [...SM_BASE_CATS.filter(c => c.key !== k && !hiddenCats.includes(c.key)).map(c => c.key), ...customCats.filter(c => catKey(c) !== k).map(c => catKey(c))]; setCat(rem[0] || ""); }
  };
  const isCustom = customCats.some(c => catKey(c) === cat);

  const run = (u) => {
    const target = (u ?? url).trim(); if (!target) return;
    setBusy(true); setResult(null);
    const h = window.uiLoading && window.uiLoading({ title: settings.useAi ? t("scan.fetchAi") : t("scan.fetch"), message: (settings.bypassPopup !== false ? t("scan.skipPopup") : "") + target });
    setTimeout(() => {
      const norm = target.replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
      const terms = mergedTerms(cat);
      const SRC = ["<nav>", "<h1>", "<h2>", "เมนู footer", "sitemap.xml", "breadcrumb"];
      const PATHS = ["/", "/investor", "/about-us", "/cg", "/ir", "/sustainability", "/board"];
      const items = terms.map(t2 => {
        const hh = smHash(norm + ":" + t2.canon);
        const conf = hh % 100;                              // match confidence 0–99
        const pool = [t2.th, ...(t2.aliases || [])];
        const pageTerm = pool[hh % pool.length];
        return { ...t2, conf, pageTerm, alias: pageTerm !== t2.th, evTag: SRC[hh % SRC.length], evPath: PATHS[(hh >> 3) % PATHS.length] };
      });
      setResult({ url: target, cat, items, at: Date.now() });
      setBusy(false); h && h.close();
    }, 1000);
  };
  const UNCLEAR = 18;                                        // band below pass threshold = "ไม่ชัด"
  const statusOf = (i) => confirmed.includes(i.key) ? "complete" : i.conf >= passTh ? "complete" : i.conf >= passTh - UNCLEAR ? "unclear" : "missing";
  const complete = result ? result.items.filter(i => statusOf(i) === "complete") : [];
  const unclear = result ? result.items.filter(i => statusOf(i) === "unclear") : [];
  const missing = result ? result.items.filter(i => statusOf(i) === "missing") : [];
  const score = result && result.items.length ? Math.round(complete.length / result.items.length * 100) : 0;
  const grade = score >= 80 ? { t: t("grade.strong"), c: "ok" } : score >= 55 ? { t: t("grade.partial"), c: "warn" } : { t: t("grade.low"), c: "bad" };
  const evHref = (i) => { let b = (result ? result.url : "").replace(/\/+$/, ""); if (b && !/^https?:\/\//.test(b)) b = "https://" + b; return b + (i.pageTerm ? "#:~:text=" + encodeURIComponent(i.pageTerm) : ""); };
  const dateLocale = lang === "en" ? "en-US" : "th-TH";

  return (
    <div className="content-pad fade-in" data-no-lex>
      <PageHead kicker={t("head.kicker")} title={t("head.title")} tag="demo" desc={t("head.desc")} />

      <div className="sm-pipe">
        {[["🗺️", "vocab"], ["🧩", "format"], ["🌐", "fetch"], ["⚖️", "compare"], ["📑", "report"]].map((s) => (
          <div className="sm-pstage" key={s[1]}><div className="sm-pico">{s[0]}</div><div className="sm-pt">{t("pipe." + s[1] + ".t")}</div><div className="sm-pd">{t("pipe." + s[1] + ".d")}</div></div>
        ))}
      </div>

      {/* 1) categories */}
      <div className="sm-section-h mono">{t("cats.section")}</div>
      <div className="sm-cats">
        {cats.map(c => <button key={c.key} className={`sm-cat ${cat === c.key ? "on" : ""}`} onClick={() => setCat(c.key)}>{c.label}</button>)}
        <button className="sm-cat add" onClick={() => setAddingCat(v => !v)}>{t("cats.add")}</button>
        {cat && <button className="sm-cat del" onClick={() => deleteCat(cat)}>{t("cats.delete", { cat })}</button>}
      </div>
      {addingCat && (
        <div className="sm-addcat">
          <div className="sm-addcat-row">
            <input className="bf-input" style={{ maxWidth: 220 }} value={newCatName} onChange={e => setNewCatName(e.target.value)} placeholder={t("addcat.namePh")} />
            <Btn kind="gold" sm onClick={createCat} style={{ opacity: newCatName.trim() ? 1 : .5, pointerEvents: newCatName.trim() ? "auto" : "none" }}>{t("addcat.create")}</Btn>
            <Btn kind="ghost" sm onClick={() => { setAddingCat(false); setNewCatName(""); setNewCatFrom([]); }}>{t("common.cancel")}</Btn>
          </div>
          <div className="sm-addcat-from">
            <span className="mono muted" style={{ fontSize: 12 }}>{t("addcat.from")}</span>
            <Select value="" minWidth={240} placeholder={t("addcat.pickSource")} onChange={v => { if (v) toggleFrom(v); }}
              options={[{ value: "", label: t("addcat.pickSource") },
                ...cats.filter(c => !isDerived(c.key) && !newCatFrom.includes(c.key)).map(c => ({ value: c.key, label: c.label }))]} />
            {newCatFrom.map(k => <span key={k} className="sm-fromchip on">{k}<button onClick={() => toggleFrom(k)}>✕</button></span>)}
            {newCatFrom.length === 0 && <span className="mono faint" style={{ fontSize: 11 }}>{t("addcat.emptyHint")}</span>}
          </div>
        </div>
      )}

      <div className="sm-subtabs">
        <button className={`sm-subtab ${tab === "url" ? "on" : ""}`} onClick={() => setTab("url")}>{t("tab.url")}</button>
        <button className={`sm-subtab ${tab === "map" ? "on" : ""}`} onClick={() => setTab("map")}>{t("tab.map")}</button>
        <button className={`sm-subtab ${tab === "log" ? "on" : ""}`} onClick={() => setTab("log")}>{t("tab.log")}</button>
      </div>

      {tab === "log" ? (
        <div className="sm-logwrap">
          <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>{t("log.title")}
            {canEdit && log.length > 0 && <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={() => { setLog([]); try { localStorage.removeItem("guildos.sitemap.log"); } catch (e) { } }}>{t("log.clear")}</button>}
          </div>
          {log.length === 0 ? <Empty icon="📜" title={t("log.empty.title")} sub={t("log.empty.sub")} /> : (
            <div className="sm-log">{log.map(l => (
              <div key={l.id} className="sm-logrow">
                <span className="sm-log-act">{l.action}</span>
                <span className="sm-log-detail">{l.detail}</span>
                <span className="sm-log-actor mono">👤 {l.actor}</span>
                <span className="sm-log-time mono">{new Date(l.ts).toLocaleString(dateLocale, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              </div>
            ))}</div>
          )}
        </div>
      ) : tab === "map" ? (
        <>
          {/* training data (Excel → JSON) */}
          <div className="sm-train">
            <div className="sm-train-head">
              <span className="mono muted" style={{ fontSize: 12.5 }}>{t("train.summary", { files: trainForCat.length, terms: mergedTerms(cat).length, cat })}</span>
              <button className="sm-jsonbtn" onClick={() => setShowJson(v => !v)}>{showJson ? t("train.hideJson") : t("train.viewJson")}</button>
              {!readOnly && <button className="sm-up" onClick={() => fileRef.current && fileRef.current.click()}>{t("train.upload")}</button>}
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" multiple style={{ display: "none" }} onChange={addTrain} />
            </div>
            {readOnly && <div className="sm-readonly mono">{t("train.readonly", { sources: derivedFrom(cat).join(" + ") })}</div>}
            {showJson && <pre className="sm-json">{catJson}</pre>}
            {trainForCat.length > 0 && <div className="sm-train-list">{trainForCat.map(t2 => (
              <div key={t2.id} className="sm-tr">
                <span className="sm-tr-ic">📊</span>
                <div className="sm-tr-body"><div className="sm-tr-name mono">{t2.name}</div><div className="sm-tr-meta">{t("train.rows", { rows: t2.rows, cat: t2.category })}</div></div>
                <button className="sm-tr-x" onClick={() => removeTrain(t2.id)} title={t("common.delete")}>✕</button>
              </div>
            ))}</div>}
          </div>

          {/* mapping table: main keyword → variant terms */}
          <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>{t("map.title")}
            {!readOnly && <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={addTerm}>{t("map.addTerm")}</button>}
          </div>
          {!readOnly && <div className="mono faint" style={{ fontSize: 11, margin: "-4px 0 8px" }}>{t("map.hint")}</div>}
          <div className="sm-map">
            {mergedTerms(cat).length === 0 && <div className="muted" style={{ fontSize: 13, padding: "10px 2px" }}>{t("map.empty")}</div>}
            {mergedTerms(cat).map(t2 => (
              <div key={t2.key} className="sm-maprow">
                <div className="sm-mapkey">
                  <div className="sm-mapcanon mono">{t2.canon}{!readOnly && <button className="sm-edit" onClick={() => editCanon(t2.key, t2.canon)} title={t("edit.canon.title")}>✎</button>}</div>
                  <div className="sm-mapth">{t2.th}{!readOnly && <button className="sm-edit" onClick={() => editTerm(t2.key, t2.th)} title={t("edit.desc.title")}>✎</button>}</div>
                  <span className="sm-item-cat mono">{t2.category}</span>
                </div>
                <span className="sm-arrow">→</span>
                <div className="sm-mapvars">
                  {t2.aliases.length === 0 && <span className="muted" style={{ fontSize: 12 }}>{t("map.noAlias")}</span>}
                  {t2.aliases.map(a => (
                    <span key={a} className={`sm-var ${isExtra(t2.key, a) ? "extra" : ""}`}>{a}{!readOnly && <><button onClick={() => editAlias(t2.key, a)} title={t("edit.alias.title")}>✎</button><button onClick={() => removeAlias(t2.key, a)} title={t("common.delete")}>✕</button></>}</span>
                  ))}
                  {!readOnly && <button className="sm-var add" onClick={() => addAlias(t2.key)} title={t("addAlias.title")}>＋</button>}
                </div>
                {!readOnly && <button className="sm-maprow-del" onClick={() => removeTerm(t2.key)} title={t("removeCanon.title")}>🗑</button>}
              </div>
            ))}
          </div>
        </>
      ) : (
        <>
          {/* scan URL */}
          <div className="sm-bar">
            <span className="sm-ic">🔗</span>
            <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === "Enter" && run()} placeholder="https://company.listed.co.th" />
            {url && <button className="sm-clear" onClick={() => setUrl("")}>✕</button>}
            <Btn kind="gold" icon="🔍" onClick={() => run()}>{t("scan.match")}</Btn>
          </div>
          <label className="sm-aicheck">
            <input type="checkbox" checked={settings.useAi} onChange={e => setSetting("useAi", e.target.checked)} />
            <span>{t("scan.aiCheck")} <span className="mono faint">({settings.model} · {settings.apiMode})</span></span>
          </label>
          <label className="sm-aicheck">
            <input type="checkbox" checked={settings.bypassPopup !== false} onChange={e => setSetting("bypassPopup", e.target.checked)} />
            <span>{t("scan.bypass")} <span className="mono faint">{t("scan.bypassHint")}</span></span>
          </label>
          <div className="sm-thbar">
            <span className="mono muted" style={{ fontSize: 12.5 }}>{t("settings.engine")}</span>
            <Select value={settings.engine || "rapidfuzz (fuzzy)"} onChange={v => setSetting("engine", v)} minWidth={170}
              options={["rapidfuzz (fuzzy)", "AI semantic", "exact match"].map(m => ({ value: m, label: m }))} />
            <span className="mono faint" style={{ fontSize: 11 }}>{t("settings.engine.hint")}</span>
          </div>
          <div className="sm-examples">
            <span className="mono faint">{t("scan.try")}:</span>
            {["www.set.or.th", "www.scb.co.th", "www.cpall.co.th"].map(e => <button key={e} className="sm-chip" onClick={() => { setUrl("https://" + e); run("https://" + e); }}>{e}</button>)}
          </div>
          <div className="sm-thbar">
            <span className="mono muted" style={{ fontSize: 12.5 }}>{t("scan.threshold")}</span>
            <input type="range" min="50" max="95" step="5" value={passTh} onChange={e => setPassTh(+e.target.value)} />
            <span className="sm-thval mono">{passTh}%</span>
            <span className="mono faint" style={{ fontSize: 11 }}>{t("scan.bandHint", { lo: passTh - 18, hi: passTh })}</span>
          </div>

      {busy && <Panel><div className="sm-loading"><span className="typing-bubble" style={{ display: "inline-flex" }}><span /><span /><span /></span> {t("scan.loading")}</div></Panel>}
      {!busy && !result && <Empty icon="🗺️" title={t("scan.noscan.title")} sub={t("scan.noscan.sub")} />}

      {!busy && result && (
        <>
          <div className="sm-summary">
            <div className={`sm-score ${grade.c}`}>
              <div className="sm-score-num">{score}<span>%</span></div>
              <div className="sm-score-lbl mono">{t("summary.matched")}</div>
            </div>
            <div className="sm-sumdetail">
              <div className="sm-target mono">🌐 {result.url} · {t("summary.catLabel")} {result.cat}</div>
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

          <div className="sm-section-h mono" style={{ display: "flex", alignItems: "center", gap: 12 }}>{t("report.title")}
            <button className="sm-jsonbtn" style={{ marginLeft: "auto" }} onClick={downloadReport}>{t("report.download")}</button>
          </div>
          <div className="sm-cols sm-cols3">
            <div className="sm-col">
              <div className="sm-col-head ok">{t("col.complete")} <span>{complete.length}</span></div>
              {complete.length === 0 ? <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>{t("common.dash")}</div> : complete.map(i => (
                <div key={i.canon} className="sm-item ok">
                  <span className="sm-item-mark">✓</span>
                  <div className="sm-item-body">
                    <div className="sm-match-row"><span className="sm-page">“{i.pageTerm}”</span><span className="sm-arrow">→</span><span className="sm-canon mono">{i.canon}</span></div>
                    <div className="sm-item-desc">{i.th}{i.alias && <span className="sm-aliastag">{t("item.aliasTag")}</span>}</div>
                    <a className="sm-evid mono sm-evlink" href={evHref(i)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{t("item.foundIn", { tag: i.evTag, path: i.evPath })}</a>
                  </div>
                  <span className="sm-conf mono">{i.conf}%</span>
                </div>
              ))}
            </div>
            <div className="sm-col">
              <div className="sm-col-head unclear">{t("col.unclear")} <span>{unclear.length}</span></div>
              {unclear.length === 0 ? <div className="muted" style={{ fontSize: 12.5, padding: "8px 2px" }}>{t("common.dash")}</div> : unclear.map(i => (
                <div key={i.canon} className="sm-item unclear">
                  <span className="sm-item-mark">?</span>
                  <div className="sm-item-body">
                    <div className="sm-match-row"><span className="sm-page">“{i.pageTerm}”</span><span className="sm-arrow">→</span><span className="sm-canon mono">{i.canon}</span></div>
                    <div className="sm-item-desc">{t("item.unclearDesc")}</div>
                    <a className="sm-evid mono sm-evlink" href={evHref(i)} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}>{t("item.maybeIn", { tag: i.evTag, path: i.evPath })}</a>
                    {canEdit && <button className="sm-addvocab" onClick={() => confirmUnclear(i)} title={t("item.addVocab.title", { term: i.pageTerm, canon: i.canon })}>{t("item.addVocab")}</button>}
                  </div>
                  <span className="sm-conf mono warn">{i.conf}%</span>
                </div>
              ))}
            </div>
            <div className="sm-col">
              <div className="sm-col-head miss">{t("col.missing")} <span>{missing.length}</span></div>
              {missing.length === 0 ? <div className="sm-allgood">{t("item.allgood")}</div> : missing.map(i => (
                <div key={i.canon} className="sm-item miss">
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
          <div className="uim ornate" onClick={e => e.stopPropagation()} style={{ width: 430 }}>
            <div className="uim-title">{t("modal.title")}</div>
            <div className="bf"><label className="bf-label">{t("modal.headLabel")}</label>
              {(() => {
                const vt = mergedTerms(result ? result.cat : cat);
                const sel = vt.find(t2 => t2.key === addVocab.key);
                const q = addVocab.q;
                const shown = vt.filter(t2 => q == null || q === "" || (t2.canon + " " + t2.th).toLowerCase().includes(String(q).toLowerCase()));
                return (
                  <div className="sm-combo">
                    <input className="bf-input" value={q != null ? q : (sel ? sel.canon + " · " + sel.th : "")} placeholder={t("modal.headPh")}
                      onChange={e => setAddVocab({ ...addVocab, q: e.target.value, open: true })}
                      onFocus={() => setAddVocab({ ...addVocab, q: "", open: true })} />
                    {addVocab.open && (
                      <div className="sm-combo-list">
                        {shown.length === 0 && <div className="sm-combo-empty">{t("modal.comboEmpty")}</div>}
                        {shown.map(t2 => <button key={t2.key} type="button" className={t2.key === addVocab.key ? "on" : ""} onClick={() => setAddVocab({ ...addVocab, key: t2.key, q: null, open: false })}>{t2.canon} · {t2.th}</button>)}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="bf"><label className="bf-label">{t("modal.subLabel")}</label>
              <input className="bf-input" value={addVocab.alias} onChange={e => setAddVocab({ ...addVocab, alias: e.target.value })} placeholder={t("modal.subPh")} autoFocus />
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
Object.assign(window, { SitemapAudit });

export {
  SM_BASE_CATS,
  SM_VOCAB,
  SitemapAudit,
  smCatTerms,
  smHash,
  smLoadTrain,
  smSaveTrain
};
