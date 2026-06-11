/* PiKaOs — ES module (migrated from PiKaOs/screens-extra.jsx). */
import React from 'react';
const { useState, useEffect, useRef } = React;
import { Avatar, Btn, Empty, FeatureTag, HelpNote, Meter, PageHead, Panel, RankGem, StatTile } from '../components/components.jsx';
import { Select } from '../components/ui/Dropdown.jsx';
import { LEX_LANGS, langByCode, stylesForLang, packById } from '../lib/i18n.jsx';
import { MANA, QUESTS, TREASURY, byId } from '../data/data.jsx';
import { idx } from '../lib/room-store.jsx';
import { Field, Segmented, TagInput } from './screens-builder.jsx';
import { RichBody, World } from './screens-world.jsx';
import { API_PROVIDERS, loadApiKeys, maskKey, saveApiKeys } from '../lib/store.jsx';

/* ============================================================
   EXTRA SCREENS — World, Codex, Recall, Mana, Treasury,
   Chronicle, Settings, Quest Log, Watchtower
   ============================================================ */

/* ---------------- WORLD STATE → moved to screens-world.jsx (MMO map) ---------------- */

/* ---------------- CODEX (knowledge) — fully working ---------------- */
const KTYPE = { diagram: "🗺️", research: "🔬", doc: "📄", decision: "⚖️", note: "📝" };
const KTYPE_TH = { diagram: "แผนภาพ", research: "งานวิจัย", doc: "เอกสาร", decision: "การตัดสินใจ", note: "บันทึก" };
const KTYPE_EN = { diagram: "Diagram", research: "Research", doc: "Document", decision: "Decision", note: "Note" };
const KTYPE_OPTS = ["doc", "research", "diagram", "decision", "note"];
let _ct = (k) => k;
const ct = (k, v) => _ct(k, v);
function ktypeLabel(type) { return ct("ktype." + type); }
const KBODY = {
  k1: "สถาปัตยกรรมของ auth-service แบ่งเป็น 3 ชั้น: API gateway, token service และ user store. ใช้ rotating refresh token อายุ 7 วัน และ access token อายุ 15 นาที",
  k2: "จากการทดลอง hybrid search (BM25 + vector) ร่วมกับ reranking พบว่าให้ผลแม่นยำกว่า ~14% บนชุดข้อมูลของกิลด์ และควรใช้กับเอกสารที่ยาว",
  k3: "ขั้นตอนเริ่มต้นสำหรับนักผจญภัยใหม่: สร้างตัวละคร → รับเควสแรก → เข้าร่วมสภากิลด์",
  k4: "มาตรฐานการเขียน test: ครอบคลุม edge case, ตั้งชื่อทดสอบให้สื่อความ, รายงานความล้มเหลวพร้อมขั้นตอนทำซ้ำ",
  k5: "บันทึกการตัดสินใจ: เลือก rotating refresh token แทน long-lived token เพื่อลดความเสี่ยงหาก token รั่วไหล",
  k6: "รายการ dependency ที่มีช่องโหว่ระดับสูง ควรอัปเดตก่อนปล่อยเวอร์ชันถัดไป",
};

const KCODEX_KEY = "guild-codex-v1";
function loadCodex() {
  try { const raw = localStorage.getItem(KCODEX_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveCodex(arr) { try { localStorage.setItem(KCODEX_KEY, JSON.stringify(arr)); } catch {} }

function CodexDrawer({ k, onClose }) {
  const by = byId(k.by);
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={e => e.stopPropagation()}>
        <div className="drawer-head">
          <span className="codex-type" style={{ width: 48, height: 48, flexBasis: 48, fontSize: 22 }}>{KTYPE[k.type] || "📝"}</span>
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{ktypeLabel(k.type)} · {ct("codex.updated")} {k.updated}</div>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 19, margin: "5px 0 0", color: "var(--ink)", lineHeight: 1.3 }}>{k.title}</h2>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {k.bodyHtml
            ? <div style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: k.bodyHtml }} />
            : <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.7 }}>{k.body || KBODY[k.id] || "— ยังไม่มีรายละเอียดเพิ่มเติม —"}</p>}
          <div className="kv">
            <div className="kv-item"><div className="kv-label">บันทึกโดย</div><div className="kv-val" style={{ fontSize: 14 }}>{by ? by.name : "หอคอยกิลด์"}</div></div>
            <div className="kv-item"><div className="kv-label">การอ้างอิง</div><div className="kv-val">{k.refs ?? 0}</div></div>
          </div>
          <div>
            <div className="kicker" style={{ marginBottom: 10 }}>ป้ายกำกับ</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{(k.tags || []).map(t => <span key={t} className="tag">{t}</span>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AddNoteModal({ onSave, onClose }) {
  const [f, setF] = useState({ title: "", type: "doc", body: "", tags: [] });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const can = f.title.trim().length > 0;
  return (
    <div className="drawer-overlay" onClick={onClose} style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
      <div className="builder ornate" style={{ width: 520 }} onClick={e => e.stopPropagation()}>
        <div className="builder-head">
          <span className="ph-icon" style={{ fontSize: 18 }}>📚</span>
          <div><div className="kicker">{ct("codex.addKicker")}</div>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 18, margin: "2px 0 0", color: "var(--ink)" }}>{ct("codex.addTitle")}</h2></div>
          <button className="drawer-close" onClick={onClose} style={{ marginLeft: "auto" }}>✕</button>
        </div>
        <div style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
          <Field label={ct("codex.f.title")}><input className="bf-input" value={f.title} onChange={e => set("title", e.target.value)} placeholder={ct("codex.f.titlePh")} /></Field>
          <Field label={ct("codex.f.type")}><Segmented value={f.type} onChange={v => set("type", v)} options={KTYPE_OPTS.map(ty => ({ key: ty, label: ktypeLabel(ty) }))} /></Field>
          <Field label={ct("codex.f.body")} hint={ct("codex.f.bodyHint")}><RichBody value={f.bodyHtml || f.body} onChange={(text, html) => { set("body", text); set("bodyHtml", html); }} placeholder={ct("codex.f.bodyPh")} /></Field>
          <Field label={ct("codex.f.tags")} hint={ct("codex.f.tagsHint")}><TagInput tags={f.tags} onChange={v => set("tags", v)} suggest={["backend","security","docs","research","qa","rag"]} placeholder={ct("codex.f.tagsPh")} /></Field>
        </div>
        <div className="builder-foot">
          <Btn kind="ghost" onClick={onClose}>{ct("common.cancel")}</Btn>
          <Btn kind="gold" icon="✓" style={{ opacity: can ? 1 : .5, pointerEvents: can ? "auto" : "none" }}
            onClick={() => onSave({ id: "ku" + Date.now(), title: f.title.trim(), type: f.type, body: f.body.trim(), bodyHtml: f.bodyHtml || "", tags: f.tags, by: (window.__chars || [])[0]?.id, updated: ct("codex.justNow"), refs: 0 })}>{ct("codex.saveBtn")}</Btn>
        </div>
      </div>
    </div>
  );
}

function Codex({ t }) {
  _ct = (typeof t === "function") ? t : ((k) => k);
  const [extra, setExtra] = useState(() => loadCodex());
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sel, setSel] = useState(null);
  const [adding, setAdding] = useState(false);
  const all = [...extra, ...KNOWLEDGE];
  const ql = q.trim().toLowerCase();
  const list = all.filter(k => {
    if (filter !== "all" && k.type !== filter) return false;
    if (!ql) return true;
    return (k.title || "").toLowerCase().includes(ql) || (k.tags || []).some(t => t.toLowerCase().includes(ql)) || (KBODY[k.id] || k.body || "").toLowerCase().includes(ql);
  });
  const addNote = (note) => { const next = [note, ...extra]; setExtra(next); saveCodex(next); setAdding(false); };
  const tabs = [["all", ct("codex.allTab")], ...KTYPE_OPTS.map(ty => [ty, ktypeLabel(ty)])];

  return (
    <div className="content-pad fade-in">
      <PageHead kicker={ct("codex.kicker")} title={ct("codex.title")} tag="local"
        desc={ct("codex.desc")}
        actions={<Btn kind="gold" sm icon="➕" onClick={() => setAdding(true)}>{ct("codex.add")}</Btn>} />
      <HelpNote tag="local">{ct("codex.help")}</HelpNote>
      <div className="search-bar" style={{ margin: "16px 0" }}>
        <span>🔍</span><input value={q} onChange={e => setQ(e.target.value)} placeholder={ct("codex.searchPh")} />
        <span className="mono faint" style={{ fontSize: 11 }}>{list.length}/{all.length} {ct("codex.items")}</span>
      </div>
      <div className="tabs" style={{ marginBottom: 16 }}>{tabs.map(([k, l]) => <button key={k} className={`tab ${filter === k ? "active" : ""}`} onClick={() => setFilter(k)}>{l}</button>)}</div>
      {list.length === 0 ? (
        <Panel><Empty icon="🔍" title={ct("codex.noMatch")} sub={ct("codex.noMatchSub")} /></Panel>
      ) : (
        <div className="list-rows stagger">
          {list.map(k => {
            const by = byId(k.by);
            return (
              <button key={k.id} className="codex-row" onClick={() => setSel(k)}>
                <span className="codex-type">{KTYPE[k.type] || "📝"}</span>
                <div className="codex-main">
                  <div className="codex-title">{k.title}</div>
                  <div className="codex-meta">{ktypeLabel(k.type)} · {ct("codex.by")} {by ? by.name.split(" ")[0] : ct("codex.guild")} · {ct("codex.updated")} {k.updated} · {k.refs ?? 0} {ct("codex.refs")}</div>
                </div>
                <div className="row" style={{ gap: 6 }}>{(k.tags || []).slice(0, 2).map(t => <span key={t} className="tag">{t}</span>)}</div>
              </button>
            );
          })}
        </div>
      )}
      {sel && <CodexDrawer k={sel} onClose={() => setSel(null)} />}
      {adding && <AddNoteModal onSave={addNote} onClose={() => setAdding(false)} />}
    </div>
  );
}

/* ---------------- RECALL — hybrid retrieval + cited Q&A ---------------- */
/* semantic concept map: lets near-meaning queries still find the right docs */
const RECALL_CONCEPTS = [
  ["security", ["token", "auth", "login", "เข้าสู่ระบบ", "ความปลอดภัย", "รั่ว", "refresh", "ปลอดภัย", "credential"]],
  ["rag",      ["retrieval", "ค้นหา", "ค้นคืน", "vector", "embedding", "hybrid", "rerank", "semantic", "ความหมาย"]],
  ["test",     ["test", "ทดสอบ", "qa", "คุณภาพ", "bug", "บั๊ก", "regression", "edge case"]],
  ["onboard",  ["onboarding", "เริ่มต้น", "นักผจญภัยใหม่", "สมาชิกใหม่", "เข้าร่วม", "มือใหม่"]],
  ["deps",     ["dependency", "อัปเดต", "ช่องโหว่", "เวอร์ชัน", "package", "ล้าสมัย", "vulnerab"]],
];
function recallDocText(d) { return (d.title + " " + (KBODY[d.id] || d.body || "") + " " + (d.tags || []).join(" ")); }
function recallScore(doc, query) {
  const q = query.toLowerCase().trim();
  const title = (doc.title || "").toLowerCase();
  const text = recallDocText(doc).toLowerCase();
  let score = 0, hits = 0;
  if (q && title.includes(q)) score += 5;
  else if (q && text.includes(q)) score += 3;
  const words = q.split(/[\s,?.!“”"’'()/]+/).filter(w => w.length >= 2);
  for (const w of words) {
    if (title.includes(w)) { score += 2; hits++; }
    else if (text.includes(w)) { score += 1; hits++; }
  }
  for (const t of (doc.tags || [])) if (q.includes(t.toLowerCase())) score += 1.5;
  for (const [, terms] of RECALL_CONCEPTS) {
    const qHit = terms.some(t => q.includes(t.toLowerCase()));
    const dHit = terms.some(t => text.includes(t.toLowerCase()));
    if (qHit && dHit) { score += 1.4; hits++; }
  }
  return { score, hits, words };
}
function recallSnippet(doc, words) {
  const body = KBODY[doc.id] || doc.body || doc.title || "";
  const lower = body.toLowerCase();
  let idx = -1;
  for (const w of words) { const i = lower.indexOf(w); if (i !== -1 && (idx === -1 || i < idx)) idx = i; }
  const start = idx > 50 ? idx - 40 : 0;
  let snip = body.slice(start, start + 170);
  if (start > 0) snip = "…" + snip;
  if (start + 170 < body.length) snip = snip + "…";
  return snip;
}
function recallHighlight(text, words) {
  const terms = words.filter(w => w.length >= 2);
  if (!terms.length) return text;
  const esc = terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp("(" + esc.join("|") + ")", "gi");
  const lowerTerms = terms.map(t => t.toLowerCase());
  return text.split(re).map((p, i) =>
    lowerTerms.includes(p.toLowerCase())
      ? <mark key={i} className="hl">{p}</mark>
      : <React.Fragment key={i}>{p}</React.Fragment>);
}

/* mock GET /recall?q=&type= — hybrid retrieval → ranked documents (§6.2 contract) */
function recallSearch(all, query, typeFilter) {
  const ranked = all
    .filter(d => !typeFilter || typeFilter === "all" || d.type === typeFilter)
    .map(d => { const s = recallScore(d, query); return { doc: d, ...s }; })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  const top = ranked[0] ? ranked[0].score : 1;
  ranked.forEach(r => { r.sim = Math.min(0.97, 0.5 + 0.45 * (r.score / top)); r.matched = Math.max(1, r.hits); });
  return ranked;
}

/* mock POST /ask — answer grounded in retrieved docs, cited inline [n] (§6.3 contract).
   Uses the real model when available, else a deterministic context-grounded reply. */
async function askHermes(query, ranked, lang) {
  const T = (en, th) => lang === "en" ? en : th;
  const context = ranked.map((r, i) => `[${i + 1}] ${r.doc.title}: ${KBODY[r.doc.id] || r.doc.body || ""}`).join("\n");
  try {
    if (ranked.length && window.claude && window.claude.complete) {
      const langLine = lang === "en"
        ? "Answer in English, concise (max 4 sentences). Cite sources inline like [1], [2] referring to the numbered context."
        : "ตอบเป็นภาษาไทยกระชับ ไม่เกิน 4 ประโยค อ้างอิงแหล่งแบบ [1], [2] ตามหมายเลขบริบทที่ให้";
      const sys = "You are HERMES, the guild librarian. Only use the provided context. If nothing matches, say so. " + langLine + "\n\nContext:\n" + context;
      const reply = await window.claude.complete(sys + "\n\nQuestion: " + query);
      if (reply && reply.trim()) return reply.trim();
    }
  } catch (e) { /* fall through to deterministic reply */ }
  if (!ranked.length) return T("I couldn't find anything matching in the codex. Try different words, or add a note first.", "ไม่พบเอกสารที่ตรงในคลังความรู้ ลองใช้คำอื่น หรือเพิ่มบันทึกก่อน");
  const b0 = KBODY[ranked[0].doc.id] || ranked[0].doc.body || "";
  const b1 = ranked[1] ? (KBODY[ranked[1].doc.id] || ranked[1].doc.body || "") : "";
  return T(
    `Based on the codex, the most relevant source is “${ranked[0].doc.title}” [1]. ${b0}${b1 ? ` This aligns with “${ranked[1].doc.title}” [2].` : ""}`,
    `จากคลังความรู้ แหล่งที่เกี่ยวข้องที่สุดคือ “${ranked[0].doc.title}” [1] · ${b0}${b1 ? ` และสอดคล้องกับ “${ranked[1].doc.title}” [2]` : ""}`
  );
}

/* answer text with clickable inline [n] citations that jump back to the source doc */
function AnswerBody({ text, results, onCite, streaming }) {
  const parts = (text || "").split(/(\[\d+\])/g);
  return (
    <span>
      {parts.map((p, i) => {
        const m = p.match(/^\[(\d+)\]$/);
        if (m) {
          const r = results && results[+m[1] - 1];
          if (r) return <button key={i} className="cite-inline" onClick={() => onCite(r.doc)} title={r.doc.title}>{m[1]}</button>;
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
      {streaming && <span className="stream-caret" />}
    </span>
  );
}

function RecallResult({ rank, r, T, onOpen }) {
  const { doc, sim, matched, words } = r;
  const by = byId(doc.by);
  const tone = sim >= 0.85 ? "hi" : sim >= 0.7 ? "mid" : "lo";
  return (
    <button className="recall-result" onClick={() => onOpen(doc)} data-no-lex>
      <span className="rr-rank mono">{rank}</span>
      <span className="codex-type" style={{ flex: "none" }}>{KTYPE[doc.type] || "📝"}</span>
      <div className="rr-main">
        <div className="rr-top">
          <span className="rr-title">{doc.title}</span>
          <span className="rr-scorewrap" title={T("relevance score", "คะแนนความเกี่ยวข้อง")}>
            <span className={`rr-scorebar t-${tone}`}><i style={{ width: Math.round(sim * 100) + "%" }} /></span>
            <span className="rr-score mono">{sim.toFixed(2)}</span>
          </span>
        </div>
        <div className="rr-snippet">{recallHighlight(recallSnippet(doc, words), words)}</div>
        <div className="rr-meta mono">
          <span>{T(KTYPE_EN[doc.type] || "Note", KTYPE_TH[doc.type] || "บันทึก")}</span>
          <span>·</span><span>{by ? by.name.split(" ")[0] : T("Guild", "กิลด์")}</span>
          <span>·</span><span>{matched} {T("matched chunks", "ส่วนที่ตรง")}</span>
          <span>·</span><span>{doc.refs ?? 0} {T("refs", "อ้างอิง")}</span>
        </div>
      </div>
      <span className="rr-open mono">{T("open →", "เปิด →")}</span>
    </button>
  );
}

function Recall({ lang }) {
  const T = (en, th) => lang === "en" ? en : th;
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);   // null | [] | [{doc,sim,...}]
  const [answer, setAnswer] = useState("");       // progressively built while streaming
  const [phase, setPhase] = useState("idle");     // idle | retrieving | streaming | done
  const [docType, setDocType] = useState("all");
  const [sel, setSel] = useState(null);
  const runRef = useRef(0);
  const extra = (typeof loadCodex === "function") ? loadCodex() : [];
  const all = [...extra, ...KNOWLEDGE];
  const busy = phase === "retrieving" || phase === "streaming";

  const ask = async (text, typeOverride) => {
    const query = (text ?? q).trim();
    if (!query || busy) return;
    const type = typeOverride ?? docType;
    const run = ++runRef.current;
    setQ(query); setAnswer(""); setResults(null); setPhase("retrieving");

    // ---- GET /recall?q=&type= : hybrid retrieval (keyword + meaning), ranked ----
    await new Promise(r => setTimeout(r, 460));            // simulate retrieval latency
    if (run !== runRef.current) return;
    const ranked = recallSearch(all, query, type);
    setResults(ranked);

    // ---- POST /ask : answer grounded in retrieved docs ----
    const full = await askHermes(query, ranked, lang);
    if (run !== runRef.current) return;

    // ---- stream the answer token-by-token ----
    setPhase("streaming");
    const toks = full.split(/(\s+)/);
    let acc = "";
    for (let i = 0; i < toks.length; i++) {
      if (run !== runRef.current) return;
      acc += toks[i];
      setAnswer(acc);
      if (toks[i].trim()) await new Promise(r => setTimeout(r, 20));
    }
    if (run !== runRef.current) return;
    setPhase("done");
  };

  const suggestions = [
    T("How did we decide on refresh tokens?", "เราตัดสินใจเรื่อง refresh token อย่างไร?"),
    T("Which retrieval approach did we pick?", "เราเลือก retrieval แบบไหน?"),
    T("What are our testing standards?", "มาตรฐานการเขียน test ของเรา"),
  ];
  const typeTabs = [["all", T("all types", "ทุกประเภท")], ...KTYPE_OPTS.map(t => [t, T(KTYPE_EN[t], KTYPE_TH[t])])];

  return (
    <div className="content-pad fade-in">
      <PageHead kicker={T("Knowledge · Recall", "ความรู้ · Recall")} title={T("Recall", "ค้นหาความรู้")} tag="live"
        desc={T("Ask the guild's knowledge base in plain language — HERMES retrieves the most relevant documents and answers with citations.",
                "ถามคลังความรู้ด้วยภาษาธรรมดา — HERMES จะค้นเอกสารที่เกี่ยวข้องที่สุดแล้วตอบพร้อมอ้างอิง")} />
      <HelpNote tag="live">{T("It runs a hybrid search over your Codex notes (keyword + meaning), then synthesizes an answer. Click any [number] in the answer to jump to its source document.",
        "ระบบค้นแบบ hybrid จากบันทึกในหน้า Codex (คำสำคัญ + ความหมาย) แล้วสรุปคำตอบ · กดเลข [n] ในคำตอบเพื่อไปยังเอกสารต้นทาง")}</HelpNote>

      <div className="search-bar" style={{ margin: "16px 0 12px", padding: "14px 18px" }}>
        <span style={{ fontSize: 16 }}>🔮</span>
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && ask()}
          placeholder={T("Ask anything about the guild's knowledge…", "ถามอะไรก็ได้เกี่ยวกับคลังความรู้…")} />
        <Btn kind="gold" sm onClick={() => ask()}>{T("Search", "สืบค้น")}</Btn>
      </div>

      <div className="recall-filters" style={{ marginBottom: 14 }}>
        <span className="mono faint" style={{ fontSize: 11 }}>{T("filter", "กรอง")}</span>
        {typeTabs.map(([k, label]) => (
          <button key={k} className={`tab-pill ${docType === k ? "on" : ""}`}
            onClick={() => { setDocType(k); if (results || busy) ask(q, k); }}>{label}</button>
        ))}
      </div>

      {!results && !busy && (
        <div className="grid cols-3" style={{ marginBottom: 18 }}>
          {suggestions.map((s, i) => (
            <button key={i} className="codex-row" style={{ justifyContent: "flex-start" }} onClick={() => ask(s)}>
              <span className="codex-type">💡</span>
              <div className="codex-main"><div className="codex-title" style={{ fontSize: 13 }}>{s}</div><div className="codex-meta">{T("suggested question", "คำถามแนะนำ")}</div></div>
            </button>
          ))}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "1fr 360px", gap: 16, alignItems: "start" }}>
        {/* ---- answer + citations ---- */}
        <Panel title={T("HERMES answer", "คำตอบจาก HERMES")} en="SYNTHESIS" icon="⚜" right={<FeatureTag kind="live" />}>
          {phase === "retrieving" ? (
            <div className="row" style={{ gap: 10, color: "var(--ink-2)" }}>
              <span className="typing-bubble" style={{ display: "inline-flex" }}><span /><span /><span /></span>
              {T("HERMES is retrieving and reading the codex…", "HERMES กำลังค้นและอ่านคลังความรู้…")}
            </div>
          ) : (phase === "streaming" || phase === "done") ? (
            <div style={{ fontSize: 14, lineHeight: 1.8, color: "var(--ink)" }}>
              <div className="row" style={{ gap: 9, marginBottom: 10 }}><span className="wchat-crest">⚜</span><span className="mono gold-text" style={{ fontSize: 12 }}>HERMES</span></div>
              <AnswerBody text={answer} results={results} onCite={setSel} streaming={phase === "streaming"} />
              {phase === "done" && results && results.length > 0 && (
                <div className="citations">
                  <div className="cite-label mono">{T("Sources", "แหล่งอ้างอิง")}</div>
                  <div className="cite-chips">
                    {results.map((r, i) => (
                      <button key={r.doc.id} className="cite-chip" onClick={() => setSel(r.doc)} title={r.doc.title}>
                        <span className="cite-num">{i + 1}</span>
                        <span className="cite-title">{r.doc.title}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Empty icon="🔮" title={T("No query yet", "ยังไม่มีการสืบค้น")} sub={T("Ask a question above to search the codex", "พิมพ์คำถามด้านบนเพื่อค้นคลังความรู้")} />
          )}
        </Panel>

        {/* ---- retrieved documents ---- */}
        <Panel title={T("Documents found", "เอกสารที่เจอ")} en="RETRIEVAL" icon="🔍" bodyPad={false}
          right={results ? <span className="mono faint" style={{ fontSize: 11 }}>{results.length}</span> : null}>
          <div style={{ padding: 8 }}>
            {!results && busy ? (
              <div className="muted" style={{ fontSize: 13, padding: "10px 8px" }}>{T("ranking documents…", "กำลังจัดอันดับเอกสาร…")}</div>
            ) : !results ? (
              <div className="muted" style={{ fontSize: 12.5, padding: "10px 8px", lineHeight: 1.6 }}>{T("Results appear here, ranked by relevance — keyword and meaning combined.", "ผลลัพธ์จะแสดงที่นี่ เรียงตามความเกี่ยวข้อง (คำสำคัญ + ความหมาย)")}</div>
            ) : results.length === 0 ? (
              <Empty icon="🔍" title={T("No strong matches", "ไม่พบที่ตรงพอ")} sub={T("Try different words, or add a note to the Codex", "ลองคำอื่น หรือเพิ่มบันทึกในคลัง")} />
            ) : (
              <div className="col" style={{ gap: 8 }}>
                {results.map((r, i) => <RecallResult key={r.doc.id} rank={i + 1} r={r} T={T} onOpen={setSel} />)}
              </div>
            )}
          </div>
        </Panel>
      </div>

      {sel && <CodexDrawer k={sel} onClose={() => setSel(null)} />}
    </div>
  );
}

/* ---------------- MANA ---------------- */
function Mana({ S, t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const chars = S.chars;
  const pctBalance = Math.round(MANA.balance / MANA.cap * 100);
  const totalMana = chars.reduce((s, c) => s + c.mana, 0) || 1;
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("mana.kicker")} title={xt("mana.title")} tag="demo"
        desc={xt("mana.desc")} />
      <div className="grid cols-4 stagger" style={{ marginBottom: 18 }}>
        <StatTile label={xt("mana.balance")} value={(MANA.balance/1000).toFixed(1)} unit="K" delta={xt("mana.capPct", { n: pctBalance })} icon="🔵" />
        <StatTile label={xt("mana.spentToday")} value={(MANA.spentToday/1000).toFixed(1)} unit="K" delta={xt("mana.vsYesterday")} deltaTone="down" icon="🔥" />
        <StatTile label={xt("mana.spentWeek")} value={(MANA.spentWeek/1000).toFixed(1)} unit="K" icon="📅" />
        <StatTile label={xt("mana.burnRate")} value={MANA.burnRate} unit={xt("mana.perHr")} delta={xt("mana.normal")} deltaTone="up" icon="⚡" />
      </div>
      <div className="grid cols-2">
        <Panel title={xt("mana.capacity")} en="CAPACITY" icon="🔵">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <span className="muted" style={{ fontSize: 13 }}>{MANA.balance.toLocaleString()} / {MANA.cap.toLocaleString()} token</span>
            <span className="gold-text mono" style={{ fontSize: 13 }}>{pctBalance}%</span>
          </div>
          <Meter kind="mana" val={pctBalance} />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6 }}>{xt("mana.capacityNote")}</div>
        </Panel>
        <Panel title={xt("mana.byAgent")} en="BY AGENT" icon="🎭">
          {chars.length === 0 ? <Empty icon="🔵" title={xt("mana.noUsage")} sub={xt("mana.noUsageSub")} /> :
          <div className="col" style={{ gap: 12 }}>
            {[...chars].sort((x, y) => y.mana - x.mana).map(a => {
              const pct = Math.round(a.mana / totalMana * 100);
              return (
                <div key={a.id} className="stat-line">
                  <span className="sl-label" style={{ display: "flex", alignItems: "center", gap: 7, width: 130, flexBasis: 130 }}>
                    <span style={{ fontSize: 14 }}>{a.icon}</span><span style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name.split(" ")[0]}</span>
                  </span>
                  <Meter kind="mana" val={pct} /><span className="sl-num">{pct}%</span>
                </div>
              );
            })}
          </div>}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- TREASURY ---------------- */
function Treasury({ t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("treasury.kicker")} title={xt("treasury.title")} tag="demo"
        desc={xt("treasury.desc")} />
      <div className="grid cols-3 stagger" style={{ marginBottom: 18 }}>
        <StatTile label={xt("treasury.gold")} value={TREASURY.gold.toLocaleString()} unit="◈" icon="💰" />
        <StatTile label={xt("treasury.artifacts")} value={TREASURY.artifacts} unit={xt("treasury.artifactsUnit")} delta={xt("treasury.artifactsDelta")} icon="🏺" />
        <StatTile label={xt("treasury.thisWeek")} value={TREASURY.thisWeek.toLocaleString()} unit="◈" delta="▲ +18%" deltaTone="up" icon="📈" />
      </div>
      <Panel title={xt("treasury.rewardLog")} en="REWARD LOG" icon="📜">
        <div className="list-rows">
          {TREASURY.log.map((r, i) => (
            <div key={i} className="codex-row" style={{ cursor: "default" }}>
              <span className="codex-type">🏆</span>
              <div className="codex-main"><div className="codex-title">{r.title}</div><div className="codex-meta">{r.quest.toUpperCase()} · {r.when}</div></div>
              <span className="gold-text mono" style={{ fontSize: 14, fontWeight: 600 }}>◈ +{r.reward}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- CHRONICLE (stats) ---------------- */
function Chronicle({ S, t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const chars = S.chars;
  const bars = [42, 58, 51, 73, 66, 88, 79];
  const days = xt("chronicle.days").split(",");
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("chronicle.kicker")} title={xt("chronicle.title")} tag="demo"
        desc={xt("chronicle.desc")} />
      <div className="grid cols-4 stagger" style={{ marginBottom: 18 }}>
        <StatTile label={xt("chronicle.totalDone")} value="1,284" delta={xt("chronicle.totalDoneDelta")} deltaTone="up" icon="🏆" />
        <StatTile label={xt("chronicle.winRate")} value="94" unit="%" delta="▲ +1.2%" deltaTone="up" icon="⚔️" />
        <StatTile label={xt("chronicle.avgTime")} value="3.4" unit={xt("chronicle.avgUnit")} delta={xt("chronicle.faster")} deltaTone="up" icon="⏱️" />
        <StatTile label={xt("chronicle.activeAgents")} value={chars.length} delta={xt("chronicle.allReady")} icon="🎭" />
      </div>
      <div className="grid cols-2">
        <Panel title={xt("chronicle.perDay")} en="PER DAY" icon="📊">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 180, padding: "10px 4px 0" }}>
            {bars.map((h, i) => (
              <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 8, justifyContent: "flex-end", height: "100%" }}>
                <div style={{ width: "100%", height: `${h}%`, borderRadius: "6px 6px 2px 2px", background: i === 5 ? "var(--gold-grad)" : "var(--raised-grad)",
                  border: "1px solid " + (i === 5 ? "var(--gold-deep)" : "var(--line)"), boxShadow: i === 5 ? "0 0 14px -2px var(--gold-glow)" : "none", transition: "height .5s" }} />
                <span className="mono faint" style={{ fontSize: 11 }}>{days[i]}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={xt("chronicle.leaderboard")} en="LEADERBOARD" icon="🥇">
          {chars.length === 0 ? <Empty icon="🥇" title={xt("chronicle.noRank")} sub={xt("chronicle.noRankSub")} /> :
          <div className="list-rows">
            {[...chars].sort((a,b) => b.quests - a.quests).slice(0,5).map((a, i) => (
              <div key={a.id} className="row" style={{ gap: 11 }}>
                <span className="display" style={{ width: 22, color: i === 0 ? "var(--gold-bright)" : "var(--ink-3)", fontSize: 15 }}>{i + 1}</span>
                <Avatar a={a} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{a.name}</div><div className="mono faint" style={{ fontSize: 10.5 }}>{a.classEn}</div></div>
                <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>{a.quests} {xt("chronicle.tasksUnit")}</span>
              </div>
            ))}
          </div>}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- SETTINGS — visual theme + language/vocabulary (decoupled) ----------------
   ไม่ hardcode ภาษา/รูปแบบคำศัพท์ — สแกนจาก src/data/i18n/*.json (เมตาในแต่ละไฟล์):
   LEX_LANGS = รายการภาษา (ตัดซ้ำแล้ว) · stylesForLang(code) = ทุกรูปแบบคำศัพท์ของภาษานั้น */
const THEME_CARDS = [
  { key: "pro",      name: "กลางวัน", en: "Day",   bg: "#f4f6f8", chips: ["#4361ee", "#ffffff", "#111726"] },
  { key: "pro-dark", name: "กลางคืน", en: "Night", bg: "#111419", chips: ["#6076f6", "#171a21", "#e8eaef"] },
];

function ApiConnections({ t, bare }) {
  const [keys, setKeys] = useState(() => (window.loadApiKeys ? loadApiKeys() : []));
  const [name, setName] = useState("");
  const [provider, setProvider] = useState(API_PROVIDERS[0].key);
  const [secret, setSecret] = useState("");
  useEffect(() => { saveApiKeys(keys); }, [keys]);
  const add = () => {
    const n = name.trim(); if (!n || !secret.trim()) return;
    setKeys(prev => [...prev, { id: "api" + Date.now().toString(36), name: n, provider, key: secret.trim() }]);
    setName(""); setSecret("");
  };
  const remove = (id) => setKeys(prev => prev.filter(k => k.id !== id));
  return (
    <Panel title={bare ? null : t("api.title")} en={bare ? null : "API CONNECTIONS"} icon={bare ? null : "🔌"} right={bare ? null : <span className="mono faint" style={{ fontSize: 11 }}>{t("api.count", { n: keys.length })}</span>}>
      <div className="muted" style={{ fontSize: 12.5, marginBottom: 12, lineHeight: 1.6 }}>{t("api.desc")}</div>
      {keys.length > 0 && (
        <div className="api-list">
          {keys.map(k => (
            <div key={k.id} className="api-row">
              <span className="api-ic">🔑</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="api-name">{k.name}</div>
                <div className="mono faint" style={{ fontSize: 11 }}>{(API_PROVIDERS.find(p => p.key === k.provider) || {}).label || k.provider} · {maskKey(k.key)}</div>
              </div>
              <button className="api-del" title={t("api.del")} onClick={() => remove(k.id)}>🗑</button>
            </div>
          ))}
        </div>
      )}
      <div className="api-add">
        <input className="bf-input" placeholder={t("api.namePh")} value={name} onChange={e => setName(e.target.value)} />
        <div className="api-add-row">
          <Select value={provider} onChange={setProvider} minWidth={150}
            options={API_PROVIDERS.map(p => ({ value: p.key, label: p.label }))} />
          <input className="bf-input" type="password" placeholder={t("api.secretPh")} value={secret} onChange={e => setSecret(e.target.value)} onKeyDown={e => e.key === "Enter" && add()} />
          <Btn kind="gold" sm icon="➕" onClick={add}>{t("common.add")}</Btn>
        </div>
      </div>
    </Panel>
  );
}

function Settings({ theme, setTheme, lex, setLex, pickLanguage, language, formal, go, t }) {
  const curTheme = THEME_CARDS.find(c => c.key === theme) || THEME_CARDS[0];
  const langs = LEX_LANGS;                       // ภาษาที่แสดง — ตัดซ้ำแล้ว
  const curLang = langByCode(language) || langs[0];
  const styles = stylesForLang(language);        // รูปแบบคำศัพท์ของภาษาที่เลือก — แสดงครบทุกไฟล์
  const curStyle = packById(lex) || styles[0] || {};
  const themeName = (c) => t(c.key === "pro" ? "theme.day" : "theme.night");
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={t("set.kicker")} title={t("set.title")} tag="local"
        desc={t("set.desc")} />

      <div className="col" style={{ gap: 16 }}>
        <Panel title={t("set.appearance")} en="APPEARANCE" icon="🎨" right={<span className="mono faint" style={{ fontSize: 11 }}>{t("set.current", { name: themeName(curTheme) })}</span>}>
          <div className="theme-picker">
            {THEME_CARDS.map(c => (
              <button key={c.key} className={`theme-card ${theme === c.key ? "on" : ""}`} onClick={() => setTheme(c.key)}>
                <div className="theme-swatch" style={{ background: c.bg }}>
                  {c.chips.map((ch, i) => <span key={i} className="sw-chip" style={{ background: ch }} />)}
                </div>
                <div className="theme-card-body">
                  <div><div className="tcb-name">{themeName(c)}</div><div className="tcb-en">{c.en}</div></div>
                  {theme === c.key && <span className="theme-card-check">✓</span>}
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t("set.lang")} en="LANGUAGE" icon="🌐" right={<span className="mono faint" style={{ fontSize: 11 }}>{t("set.current", { name: curLang.en })}</span>}>
          <div className="lex-picker" data-no-lex>
            {langs.map(l => (
              <button key={l.code} className={`lex-card ${language === l.code ? "on" : ""}`} onClick={() => pickLanguage(l.code)}>
                <span className="lex-ic" style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 14 }}>{l.code.toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="tcb-name">{l.label}</span>
                    <span className="tcb-en">{l.en}</span>
                    <span className="lex-type">{t("set.styleCount", { n: l.styles.length })}</span>
                    {language === l.code && <span className="theme-card-check" style={{ marginLeft: "auto" }}>✓</span>}
                  </div>
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{l.sample}</div>
                </div>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title={t("set.style")} en="STYLE" icon="🔤" right={<span className="mono faint" style={{ fontSize: 11 }}>{curLang.en} · {curStyle.en}</span>}>
          <div className="lex-picker" data-no-lex>
            {styles.map(s => (
              <button key={s.id} className={`lex-card ${lex === s.id ? "on" : ""}`} onClick={() => setLex(s.id)}>
                <span className="lex-ic">{s.icon}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="tcb-name">{s.title}</span>
                    <span className="tcb-en">{s.en}</span>
                    {s.type && <span className="lex-type">{s.type}</span>}
                    {lex === s.id && <span className="theme-card-check" style={{ marginLeft: "auto" }}>✓</span>}
                  </div>
                  <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>{s.sample}</div>
                </div>
              </button>
            ))}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 12, lineHeight: 1.6 }}>
            {curStyle.desc || t("set.styleFallback")}
            <span className="mono" style={{ display: "block", fontSize: 10.5, color: "var(--ink-4)", marginTop: 4 }} data-no-lex>{t("set.scanNote")}</span>
          </div>
        </Panel>

        <Panel title={t("set.design")} en="DESIGN SYSTEM" icon="🧩">
          <div className="row" style={{ justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600, fontSize: 14, color: "var(--ink)" }}>{t("set.design.item")}</div>
              <div className="muted" style={{ fontSize: 12.5, marginTop: 3, lineHeight: 1.6 }}>{t("set.design.itemDesc")}</div>
            </div>
            <Btn kind="gold" icon="🧩" onClick={() => go && go("library")}>{t("set.design.open")}</Btn>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function QuestLog({ t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const done = QUESTS.filter(q => q.status === "done").concat(QUESTS.filter(q => q.status !== "done"));
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("qlog.kicker")} title={xt("qlog.title")} tag="demo"
        desc={xt("qlog.desc")} />
      <Panel bodyPad={false}>
        <div style={{ padding: 6 }}>
          {done.map(q => {
            const lead = byId(q.lead);
            const leadName = lead ? lead.name.split(" ")[0] : "—";
            const stMap = { active:["busy",xt("qb.st.active")], queued:["idle",xt("qb.st.queued")], review:["info",xt("qb.st.review")], done:["on",xt("qb.st.done")], failed:["warn",xt("qlog.st.failed")] };
            const [c,stLabel] = stMap[q.status];
            return (
              <div key={q.id} className="row" style={{ gap: 13, padding: "12px 12px", borderBottom: "1px solid var(--line-soft)" }}>
                <RankGem r={q.rank} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{q.title}</div>
                  <div className="mono faint" style={{ fontSize: 11 }}>{q.id.toUpperCase()} · {xt("qlog.leadBy", { name: leadName })}</div>
                </div>
                <span className={`badge ${c}`}><span className="dot" />{stLabel}</span>
                <span className="gold-text mono" style={{ fontSize: 13, width: 80, textAlign: "right" }}>◈ {q.reward.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Watchtower({ t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const checks = [
    { label: xt("watch.chk.hermes"), ok: true, note: xt("watch.chk.hermesNote") },
    { label: xt("watch.chk.kb"), ok: true, note: xt("watch.chk.kbNote") },
    { label: xt("watch.chk.err"), ok: true, note: xt("watch.chk.errNote") },
    { label: xt("watch.chk.mana"), ok: false, note: xt("watch.chk.manaNote") },
  ];
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("watch.kicker")} title={xt("watch.title")} tag="demo"
        desc={xt("watch.desc")} />
      <div className="grid cols-2 stagger">
        {checks.map((c, i) => (
          <Panel key={i}>
            <div className="row" style={{ gap: 13 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 18,
                background: c.ok ? "color-mix(in srgb,var(--emerald) 14%,transparent)" : "color-mix(in srgb,var(--crimson) 14%,transparent)",
                border: "1px solid " + (c.ok ? "color-mix(in srgb,var(--emerald) 45%,transparent)" : "color-mix(in srgb,var(--crimson) 45%,transparent)") }}>
                {c.ok ? "✓" : "!"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{c.label}</div>
                <div className="mono" style={{ fontSize: 11.5, color: c.ok ? "var(--ink-3)" : "var(--crimson)" }}>{c.note}</div>
              </div>
              <span className={`badge ${c.ok ? "on" : "warn"}`}><span className="dot" />{c.ok ? xt("watch.ok") : xt("watch.warn")}</span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { Codex, Recall, Mana, Treasury, Chronicle, Settings, QuestLog, Watchtower });

export {
  AddNoteModal,
  AnswerBody,
  ApiConnections,
  Chronicle,
  Codex,
  CodexDrawer,
  KBODY,
  KCODEX_KEY,
  KTYPE,
  KTYPE_EN,
  KTYPE_OPTS,
  KTYPE_TH,
  Mana,
  QuestLog,
  RECALL_CONCEPTS,
  Recall,
  RecallResult,
  Settings,
  THEME_CARDS,
  Treasury,
  Watchtower,
  askHermes,
  loadCodex,
  recallDocText,
  recallHighlight,
  recallScore,
  recallSearch,
  recallSnippet,
  saveCodex
};
