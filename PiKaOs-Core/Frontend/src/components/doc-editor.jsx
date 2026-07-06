/* PiKaOs — full-page doc editor (TipTap with exec-command fallback),
   the inline RichBody form input, doc seed content, and the lazy TipTap loader. */
import React from 'react';
const { useState, useEffect, useRef } = React;
import { sanitizeHtml } from '../lib/sanitize.js';

/* ---------------- full-page doc editor (TipTap, exec-command fallback) ---------------- */
// TipTap is vendored (npm), lazy-imported for code-splitting — NOT from a CDN (F3): a runtime esm.sh
// import was a supply-chain risk, broke offline/air-gapped use, and was blocked by the desktop CSP
// (which silently dropped the app to the less-safe contentEditable fallback).
let _tiptapP;
function loadTiptap() {
  if (!_tiptapP) _tiptapP = (async () => {
    const core = await import("@tiptap/core");
    const sk = await import("@tiptap/starter-kit");
    return { Editor: core.Editor, StarterKit: sk.default || sk.StarterKit };
  })();
  return _tiptapP;
}
const DOC_SEED = {
  "SKILL.md": "<h1>SKILL</h1><p><strong>วัตถุประสงค์:</strong> อธิบายว่า skill นี้ทำอะไร</p><h2>Trigger — เมื่อไหร่ให้เรียกใช้</h2><ul><li>…</li></ul><h2>ขั้นตอนการทำงาน</h2><ol><li>…</li></ol><h2>ข้อจำกัด / สิ่งที่ไม่ควรทำ</h2><ul><li>…</li></ul><h2>ตัวอย่างการใช้งาน</h2><p>…</p>",
  "REFERENCE.md": "<h1>REFERENCE</h1><p>รวม API, schema, พารามิเตอร์, error codes ที่ใช้บ่อย</p>",
  "PERSONA.md": "<h1>PERSONA / SYSTEM PROMPT</h1><p>กำหนดบุคลิก น้ำเสียง ภาษา และเป้าหมายของ AI</p>",
  "CONSTRAINTS.md": "<h1>CONSTRAINTS</h1><ul><li>ห้าม…</li><li>ต้องระวัง…</li></ul>",
  "EXAMPLES.md": "<h1>EXAMPLES</h1><h2>Input</h2><pre><code>…</code></pre><h2>Output</h2><pre><code>…</code></pre>",
  "WORKFLOW.md": "<h1>WORKFLOW</h1><ol><li>ขั้นตอนที่ 1…</li><li>ขั้นตอนที่ 2…</li></ol>",
  "GLOSSARY.md": "<h1>GLOSSARY</h1><p>คำศัพท์ร่วมของทีม — ใช้ให้ตรงกันเพื่อลด hallucination</p><ul><li><strong>คำ</strong> = ความหมาย…</li></ul>",
  "TOOLS.md": "<h1>TOOLS</h1><ul><li><strong>tool_name</strong> — เมื่อไหร่ใช้ / วิธีเรียก</li></ul>",
};
function DocEditor({ docId, title, seed, onClose, tabs, activeTab, onTab }) {
  const elRef = useRef(null), edRef = useRef(null), faRef = useRef(null);
  const [mode, setMode] = useState("loading"); // loading | tiptap | fallback
  useEffect(() => {
    let dead = false, ed; const key = "guildos.doc." + docId;
    let initial = seed || ""; try { const s = localStorage.getItem(key); if (s != null) initial = s; } catch (e) { }
    loadTiptap().then(({ Editor, StarterKit }) => {
      if (dead || !elRef.current) return;
      ed = new Editor({ element: elRef.current, extensions: [StarterKit], content: initial,
        onUpdate: ({ editor }) => { try { localStorage.setItem(key, editor.getHTML()); } catch (e) { } } });
      edRef.current = ed; setMode("tiptap");
    }).catch(() => { if (dead) return; if (faRef.current) faRef.current.innerHTML = sanitizeHtml(initial); setMode("fallback"); });
    return () => { dead = true; if (ed) ed.destroy(); };
  }, [docId]);
  const saveFallback = () => { try { localStorage.setItem("guildos.doc." + docId, faRef.current.innerHTML); } catch (e) { } };
  const importMd = (e) => {
    const fl = e.target.files[0]; if (!fl) return;
    const rd = new FileReader();
    rd.onload = () => {
      const text = String(rd.result || "");
      const html = text.split(/\n\n+/).map(p => "<p>" + p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") + "</p>").join("");
      if (mode === "tiptap" && edRef.current) { edRef.current.commands.setContent(html); }
      else if (faRef.current) { faRef.current.innerHTML = sanitizeHtml(html); saveFallback(); }
    };
    rd.readAsText(fl); e.target.value = "";
  };
  const insertHTML = (html) => { if (mode === "tiptap" && edRef.current) { edRef.current.chain().focus().insertContent(html).run(); } else if (faRef.current) { faRef.current.focus(); document.execCommand("insertHTML", false, html); saveFallback(); } };
  const downloadMd = () => {
    let html = ""; try { html = localStorage.getItem("guildos.doc." + docId) || ""; } catch (e) { }
    if (!html) html = (mode === "tiptap" && edRef.current) ? edRef.current.getHTML() : (faRef.current ? faRef.current.innerHTML : "");
    const d = document.createElement("div"); d.innerHTML = html;
    const md = (d.innerText || "").trim() || ("# " + (title || "document"));
    const name = String(title || "document").replace(/\.md$/i, "").replace(/[^\w.\-ก-๙ ]+/g, "").trim().replace(/\s+/g, "_") + ".md";
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  };
  const insertImage = (e) => { const fl = e.target.files[0]; if (!fl) return; const rd = new FileReader(); rd.onload = () => insertHTML(`<img src="${rd.result}" alt="${fl.name}" style="max-width:100%;border-radius:6px" />`); rd.readAsDataURL(fl); e.target.value = ""; };
  const attachFile = (e) => { const fl = e.target.files[0]; if (!fl) return; const rd = new FileReader(); rd.onload = () => insertHTML(`<p>📎 <a href="${rd.result}" download="${fl.name}">${fl.name}</a></p>`); rd.readAsDataURL(fl); e.target.value = ""; };
  const cmd = (name) => {
    if (mode === "tiptap" && edRef.current) {
      const c = edRef.current.chain().focus();
      ({ bold: () => c.toggleBold(), italic: () => c.toggleItalic(), h1: () => c.toggleHeading({ level: 1 }), h2: () => c.toggleHeading({ level: 2 }), ul: () => c.toggleBulletList(), ol: () => c.toggleOrderedList(), code: () => c.toggleCodeBlock() }[name])().run();
    } else if (faRef.current) {
      faRef.current.focus();
      const map = { bold: ["bold"], italic: ["italic"], h1: ["formatBlock", "<h1>"], h2: ["formatBlock", "<h2>"], ul: ["insertUnorderedList"], ol: ["insertOrderedList"], code: ["formatBlock", "<pre>"] };
      const [c, a] = map[name]; document.execCommand(c, false, a); saveFallback();
    }
  };
  return (
    <div className="doc-overlay">
      <div className="doc-head">
        {tabs && tabs.length
          ? <div className="doc-tabs">{tabs.map(t => <button key={t.key} type="button" className={"doc-tab " + (activeTab === t.key ? "on" : "")} onClick={() => onTab && onTab(t.key)}><span>{t.label}</span>{t.sub && <em>{t.sub}</em>}</button>)}</div>
          : <span className="doc-fname mono">📄 {title}</span>}
        <div className="doc-tools">
          <button type="button" onClick={() => cmd("bold")}><b>B</b></button>
          <button type="button" onClick={() => cmd("italic")}><i>I</i></button>
          <button type="button" onClick={() => cmd("h1")}>H1</button>
          <button type="button" onClick={() => cmd("h2")}>H2</button>
          <button type="button" onClick={() => cmd("ul")}>• รายการ</button>
          <button type="button" onClick={() => cmd("ol")}>1. รายการ</button>
          <button type="button" onClick={() => cmd("code")}>{"</>"}</button>
          <label className="doc-upload" title="อัปโหลดไฟล์ .md มาแสดงใน Body">⬆ .md<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" onChange={importMd} style={{ display: "none" }} /></label>
          <label className="doc-upload" title="แทรกรูปภาพ">🖼 รูป<input type="file" accept="image/*" onChange={insertImage} style={{ display: "none" }} /></label>
          <label className="doc-upload" title="แนบไฟล์เอกสาร">📎 ไฟล์<input type="file" onChange={attachFile} style={{ display: "none" }} /></label>
          <button type="button" className="doc-dl" onClick={downloadMd} title="ดาวน์โหลดเป็นไฟล์ .md">⬇ .md</button>
        </div>
        <span style={{ flex: 1 }} />
        <span className="doc-saved mono faint">{mode !== "loading" ? "บันทึกอัตโนมัติ" : ""}</span>
        <button className="doc-close" onClick={onClose}>✕ ปิด</button>
      </div>
      <div className="doc-body">
        {mode === "loading" && <div className="doc-loading">กำลังโหลดตัวแก้ไข…</div>}
        <div ref={elRef} className="doc-editor" style={{ display: mode === "tiptap" ? "block" : "none" }} />
        <div ref={faRef} className="doc-editor" contentEditable={mode === "fallback"} suppressContentEditableWarning onInput={saveFallback} style={{ display: mode === "fallback" ? "block" : "none" }} />
      </div>
    </div>
  );
}

/* ---- inline rich Body input — same tiptap system as DocEditor, drops into forms ---- */
function RichBody({ value, onChange, placeholder, minHeight = 110 }) {
  const elRef = useRef(null), faRef = useRef(null), edRef = useRef(null), cbRef = useRef(onChange);
  cbRef.current = onChange;
  const [mode, setMode] = useState("loading");
  useEffect(() => {
    let dead = false, ed;
    const initial = (value || "").trim();
    const initialHtml = /</.test(initial) ? initial
      : initial.split(/\n\n+/).filter(Boolean).map(p => "<p>" + p.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/\n/g, "<br>") + "</p>").join("");
    loadTiptap().then(({ Editor, StarterKit }) => {
      if (dead || !elRef.current) return;
      ed = new Editor({ element: elRef.current, extensions: [StarterKit], content: initialHtml,
        onUpdate: ({ editor }) => cbRef.current && cbRef.current(editor.getText(), editor.getHTML()) });
      edRef.current = ed; setMode("tiptap");
    }).catch(() => { if (dead) return; if (faRef.current) faRef.current.innerHTML = sanitizeHtml(initialHtml); setMode("fallback"); });
    return () => { dead = true; if (ed) ed.destroy(); };
  }, []);
  const emitFallback = () => { if (faRef.current && cbRef.current) cbRef.current(faRef.current.innerText, faRef.current.innerHTML); };
  const cmd = (name) => {
    if (mode === "tiptap" && edRef.current) {
      const c = edRef.current.chain().focus();
      ({ bold: () => c.toggleBold(), italic: () => c.toggleItalic(), h1: () => c.toggleHeading({ level: 1 }), h2: () => c.toggleHeading({ level: 2 }), ul: () => c.toggleBulletList(), ol: () => c.toggleOrderedList(), code: () => c.toggleCodeBlock() }[name])().run();
    } else if (faRef.current) {
      faRef.current.focus();
      const map = { bold: ["bold"], italic: ["italic"], h1: ["formatBlock", "<h1>"], h2: ["formatBlock", "<h2>"], ul: ["insertUnorderedList"], ol: ["insertOrderedList"], code: ["formatBlock", "<pre>"] };
      const [c, a] = map[name]; document.execCommand(c, false, a); emitFallback();
    }
  };
  return (
    <div className="richbody">
      <div className="rb-tools">
        <button type="button" title="ตัวหนา" onClick={() => cmd("bold")}><b>B</b></button>
        <button type="button" title="ตัวเอียง" onClick={() => cmd("italic")}><i>I</i></button>
        <button type="button" onClick={() => cmd("h1")}>H1</button>
        <button type="button" onClick={() => cmd("h2")}>H2</button>
        <button type="button" onClick={() => cmd("ul")}>• รายการ</button>
        <button type="button" onClick={() => cmd("ol")}>1. รายการ</button>
        <button type="button" onClick={() => cmd("code")}>{"</>"}</button>
      </div>
      <div className="rb-edit-wrap" style={{ minHeight }}>
        {mode === "loading" && <div className="rb-loading mono faint">กำลังโหลดตัวแก้ไข…</div>}
        <div ref={elRef} className="rb-editor" data-placeholder={placeholder || ""} style={{ display: mode === "tiptap" ? "block" : "none" }} />
        <div ref={faRef} className="rb-editor" contentEditable={mode === "fallback"} suppressContentEditableWarning onInput={emitFallback} data-placeholder={placeholder || ""} style={{ display: mode === "fallback" ? "block" : "none" }} />
      </div>
    </div>
  );
}

export { _tiptapP, loadTiptap, DOC_SEED, DocEditor, RichBody };
