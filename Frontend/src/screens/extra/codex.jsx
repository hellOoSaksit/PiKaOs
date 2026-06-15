/* PiKaOs — CODEX (knowledge base): type metadata, seed bodies, the codex
   drawer + add-note modal, and the Codex screen. */
import React from 'react';
const { useState } = React;
import { Btn, Empty, HelpNote, PageHead, Panel } from '../../components/components.jsx';
import { KNOWLEDGE, byId } from '../../data/data.jsx';
import { Field, Segmented, TagInput } from '../screens-builder.jsx';
import { RichBody } from '../screens-world.jsx';

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

export { KTYPE, KTYPE_TH, KTYPE_EN, KTYPE_OPTS, ktypeLabel, KBODY, KCODEX_KEY, loadCodex, saveCodex, CodexDrawer, AddNoteModal, Codex };
