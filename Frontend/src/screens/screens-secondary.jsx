/* PiKaOs — ES module (migrated from PiKaOs/screens-secondary.jsx). */
import React from 'react';
const { useState, useRef } = React;
import { loadCoreRules } from '../lib/characters.jsx';
import { Avatar, Btn, Empty, FeatureTag, HelpNote, PageHead, Panel, RankGem, StatusBadge } from '../components/components.jsx';
import { Select } from '../components/ui/Dropdown.jsx';
import { byId } from '../data/data.jsx';
import { Recall } from './screens-extra.jsx';
import { LiveChat } from './screens-main.jsx';
import { Workflows } from './screens-workflows.jsx';
import { CharacterSprite, DocEditor } from './screens-world.jsx';

/* ============================================================
   SECONDARY SCREENS + DRAWERS
   ============================================================ */

/* i18n: bound from each top-level component's `t` prop on render. These screens/
   drawers never render with conflicting languages (one active app language), so a
   module-level binding is safe and avoids drilling `t` through every helper. */
let _st = (k) => k;
const st = (k, v) => _st(k, v);

/* ---------------- AGENT DRAWER ---------------- */
function AgentDrawer({ a, onClose, onEdit, onDelete, t }) {
  _st = (typeof t === "function") ? t : ((k) => k);
  const apiName = a.apiKeyId ? ((window.__apiKeys || []).find(k => k.id === a.apiKeyId) || {}).name : null;
  let roomName = null;
  try { if (a.homeRoom) { const rs = (JSON.parse(localStorage.getItem("guildos.rooms.v2") || "{}").rooms) || []; roomName = (rs.find(r => r.id === a.homeRoom) || {}).name || null; } } catch (e) { }
  const core = (window.loadCoreRules ? loadCoreRules() : []);
  let extra = []; try { extra = JSON.parse(localStorage.getItem("guildos.docfiles." + a.id) || "[]"); } catch (e) { }
  const mdFiles = ["SKILL.md", "TOOLS.md", "EXAMPLES.md", "REFERENCE.md", ...extra];
  const dlMd = (f) => {
    let html = ""; try { html = localStorage.getItem("guildos.doc.agent:" + a.id + ":" + f) || ""; } catch (e) { }
    const div = document.createElement("div"); div.innerHTML = html;
    const txt = (div.innerText || "").trim() || ("# " + f.replace(/\.md$/, ""));
    const blob = new Blob([txt + "\n"], { type: "text/markdown;charset=utf-8" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = f;
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 1200);
  };
  const Section = ({ title, children }) => <div><div className="kicker" style={{ marginBottom: 9 }}>{title}</div>{children}</div>;
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="ad-portrait">{window.CharacterSprite ? <CharacterSprite charId={a.characterId} walking={false} h={84} style={{ position: "static" }} /> : <Avatar a={a} size="lg" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 20, margin: 0, color: "var(--ink)" }}>{a.name}</h2>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{[a.position, a.role].filter(Boolean).join(" · ")}</div>
            <div style={{ marginTop: 8 }}><StatusBadge s={a.status} /></div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {a.desc && <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.6 }}>{a.desc}</p>}

          <div className="kv">
            <div className="kv-item"><div className="kv-label">{st("ad.model")}</div><div className="kv-val" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{apiName ? "API: " + apiName : a.model}</div></div>
            <div className="kv-item"><div className="kv-label">{st("ad.homeRoom")}</div><div className="kv-val" style={{ fontSize: 13 }}>{roomName || "—"}</div></div>
          </div>

          {a.goal && <Section title={st("bld.f.goal")}><div className="panel inset" style={{ padding: "11px 13px", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>🎯 {a.goal}</div></Section>}

          <Section title={st("bld.f.skill")}>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {(a.skills && a.skills.length) ? a.skills.map((s, i) => <span key={i} className="badge magic" style={{ fontSize: 12 }}>✦ {s}{(a.skillDocs && a.skillDocs[s]) ? " 📄" : ""}</span>) : <span className="muted" style={{ fontSize: 12.5 }}>—</span>}
            </div>
          </Section>

          {a.tools && a.tools.length > 0 && <Section title={st("bld.f.tools")}><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{a.tools.map(t => <span key={t} className="tag">{t}</span>)}</div></Section>}

          {a.workflows && a.workflows.length > 0 && <Section title={st("bld.f.wf")}><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{a.workflows.map(id => { const w = (window.__workflows || []).find(x => x.id === id); return w ? <span key={id} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span>{w.icon}</span>{w.name}</span> : null; })}</div></Section>}

          {core.length > 0 && <Section title={st("bld.f.core")}><div className="col" style={{ gap: 7 }}>{core.map((r, i) => <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}><span className="ad-core-badge">{st("bld.core.badge")}</span><span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{r}</span></div>)}</div></Section>}

          {a.rules && a.rules.length > 0 && <Section title={st("ad.rulesMore")}><div className="col" style={{ gap: 8 }}>{a.rules.map((r, i) => <div key={i} className="row" style={{ gap: 9, alignItems: "flex-start" }}><span className="rule-num" style={{ marginTop: 1 }}>{i + 1}</span><span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{r}</span></div>)}</div></Section>}

          <Section title={st("ad.mdFiles")}>
            <div className="col" style={{ gap: 6 }}>
              {mdFiles.map(f => (
                <div key={f} className="adoc-row">
                  <span className="adoc-name mono">📄 {f}</span>
                  <button type="button" className="adoc-btn" onClick={() => dlMd(f)}>⬇ .md</button>
                </div>
              ))}
            </div>
          </Section>

          <div className="row" style={{ gap: 10 }}>
            <Btn kind="gold" icon="✎" style={{ flex: 1 }} onClick={() => onEdit && onEdit(a)}>{st("ad.edit")}</Btn>
            {a.locked
              ? <Btn kind="ghost" style={{ opacity: .6, pointerEvents: "none" }}>{st("ad.cantDelete")}</Btn>
              : <Btn kind="ghost" onClick={async () => { if (await uiConfirm({ title: st("ad.delTitle"), message: st("ad.delMsg", { name: a.name }), danger: true })) onDelete && onDelete(a.id); }}
                  style={{ color: "var(--crimson)", borderColor: "color-mix(in srgb,var(--crimson) 40%,transparent)" }}>{st("ad.delete")}</Btn>}
          </div>
          {a.locked && <div className="qei-note" style={{ marginTop: 8 }}>{st("ad.ceoLocked")}</div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- QUEST DRAWER ---------------- */
function QuestDrawer({ q, onClose, onAgent, t }) {
  _st = (typeof t === "function") ? t : ((k) => k);
  const lead = byId(q.lead);
  const steps = Array.from({ length: q.steps }, (_, i) => i < q.stepDone);
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <RankGem r={q.rank} />
          <div style={{ flex: 1 }}>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-3)" }}>{q.id.toUpperCase()}</div>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 19, margin: "5px 0 0", color: "var(--ink)", lineHeight: 1.3 }}>{q.title}</h2>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 14, lineHeight: 1.6 }}>{q.desc}</p>

          <div className="kv">
            <div className="kv-item"><div className="kv-label">{st("qd.tokensUsed")}</div><div className="kv-val">{q.manaCost}</div></div>
            <div className="kv-item"><div className="kv-label">{st("qd.progress")}</div><div className="kv-val">{q.progress}%</div></div>
            <div className="kv-item"><div className="kv-label">{st("qd.deadline")}</div><div className="kv-val" style={{ fontSize: 14 }}>{q.deadline}</div></div>
          </div>

          <div>
            <div className="kicker" style={{ marginBottom: 10 }}>{st("qd.steps")} · {q.stepDone}/{q.steps}</div>
            <div className="col" style={{ gap: 8 }}>
              {steps.map((done, i) => (
                <div key={i} className="row" style={{ gap: 10 }}>
                  <span style={{ width: 20, height: 20, borderRadius: 5, display: "grid", placeItems: "center", fontSize: 11,
                    background: done ? "var(--gold-grad)" : "var(--bg-3)", color: done ? "#fff" : "var(--ink-4)",
                    border: "1px solid " + (done ? "var(--gold-deep)" : "var(--line)") }}>{done ? "✓" : i + 1}</span>
                  <span style={{ fontSize: 13.5, color: done ? "var(--ink-3)" : "var(--ink)", textDecoration: done ? "line-through" : "none" }}>{st("qd.stepN", { n: i + 1 })}</span>
                  {i === q.stepDone && q.status === "active" && <span className="badge busy" style={{ marginLeft: "auto" }}><span className="dot" />{st("qd.inProgress")}</span>}
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="kicker" style={{ marginBottom: 10 }}>{st("qd.assignees")}</div>
            <div className="list-rows">
              {q.party.map(pid => byId(pid)).filter(Boolean).map(p => (
                <button key={p.id} className="myagent-card" onClick={() => onAgent(p)}>
                  <span className="myagent-art"><CharacterSprite charId={p.characterId} walking={false} h={48} style={{ position: "static" }} /></span>
                  <span className="myagent-info"><span className="myagent-name">{p.name}</span><span className="myagent-role mono">{p.role || p.position || ""}</span></span>
                  <span style={{ marginLeft: "auto" }}><StatusBadge s={p.status} /></span>
                </button>
              ))}
              {q.party.map(pid => byId(pid)).filter(Boolean).length === 0 &&
                <span className="muted mono" style={{ fontSize: 12 }}>{st("qd.noAssignee")}</span>}
            </div>
          </div>

          {q.status !== "done" && <div className="row" style={{ gap: 10 }}>
            <Btn kind="gold" style={{ flex: 1 }}>{st("qd.liveTrack")}</Btn>
          </div>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- QUEST BOARD ---------------- */
const WORKS_LS = "guildos.works.v1";
function loadWorks() { try { return JSON.parse(localStorage.getItem(WORKS_LS) || "[]"); } catch (e) { return []; } }
function saveWorks(w) { try { localStorage.setItem(WORKS_LS, JSON.stringify(w)); } catch (e) { } }
function taskHash(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function taskTotal(w) { return w.total || 20; }
function taskStep(w) {
  const total = taskTotal(w);
  if (typeof w.step === "number") return Math.max(0, Math.min(w.step, total));
  const st = w.status || "queued";
  if (st === "done") return total;
  if (st === "queued") return 0;
  const base = st === "review" ? 0.78 : 0.5;            // active ≈ half done
  const jitter = (taskHash(w.id) % 18) / 100;           // +0–0.17
  return Math.max(1, Math.round(total * (base + jitter)));
}

/* ---- per-task UUID + room code + auto-generated .md brief ---- */
function genUUID() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); });
}
function genTaskCode(roomNo, uuid) { return `GQ-${String(roomNo).padStart(2, "0")}-${uuid.slice(0, 4).toUpperCase()}`; }
function taskMetaBlock({ code, uuid, roomNo, roomName, priority, created, kind }) {
  const pr = priority === "urgent" ? "สูงมากเป็นพิเศษ" : (priority === "high" ? "สูง" : priority === "low" ? "ต่ำ" : "ปกติ");
  let dt = ""; try { dt = new Date(created).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }); } catch (e) { dt = String(created); }
  return `> **Task File:** \`${code}-${kind}.md\`
> **UUID:** \`${uuid}\`
> **ห้อง (Room):** ${roomName || "—"} · #${roomNo}
> **ความสำคัญ:** ${pr}
> **สร้างเมื่อ:** ${dt}`;
}
/* Doc A — รายละเอียดงาน: เขียน/กำหนดโดย "คนสร้าง" (สเปกงาน) */
function buildBriefMd(meta) {
  return `# ${meta.title}

${taskMetaBlock({ ...meta, kind: "brief" })}
> **ผู้กำหนดงาน:** ผู้ใช้ (คนสร้าง)

## 🎯 วัตถุประสงค์ (Objective)
- ส่งมอบผลลัพธ์ของงาน "${meta.title}" ให้ครบและใช้งานได้จริง

## 📋 ขอบเขตงาน (Scope)
- [ ] กำหนด input / output ของงานให้ชัด
- [ ] ระบุข้อจำกัดและเงื่อนไขที่เกี่ยวข้อง

## ✅ เกณฑ์ความสำเร็จ (Acceptance Criteria)
- [ ] ผลลัพธ์ตรงตามวัตถุประสงค์
- [ ] ผ่านการตรวจทานก่อนปิดงาน

## 📝 รายละเอียดเพิ่มเติมจากผู้สร้าง
- เพิ่มรายละเอียด ลิงก์ หรือไฟล์แนบ เพื่อให้ Agent เข้าใจงานได้ดีขึ้น
`;
}
/* Doc B — บันทึกการทำงาน: พื้นที่ให้ "Agent" จดความคืบหน้า/บันทึก เพื่อทำงานให้ดีที่สุด */
function buildWorklogMd(meta) {
  return `# บันทึกการทำงาน — ${meta.title}

${taskMetaBlock({ ...meta, kind: "worklog" })}
> **อ้างอิงบรีฟ:** \`${meta.code}-brief.md\` · ไฟล์นี้ให้ **Agent** จดบันทึกระหว่างทำงาน

## 🤖 แผนเริ่มต้นจาก HERMES
_HERMES กำลังวิเคราะห์งาน… จะเติมแผน/subtask ให้อัตโนมัติ_

## 📊 ความคืบหน้า (Progress Log)
- [ ] เริ่มงาน — บันทึกสถานะและเปอร์เซ็นต์ที่นี่

## 🧠 บันทึก / การตัดสินใจของ Agent (Scratchpad)
- จดสิ่งที่พบ ปัญหา ทางเลือก และเหตุผล เพื่อทำงานให้ดีที่สุด…

## 🔗 ทรัพยากร / อ้างอิง
- ลิงก์ เอกสาร โค้ด หรือผลลัพธ์ที่เกี่ยวข้อง
`;
}
async function enhanceWorklog(md, title) {
  if (!(typeof window !== "undefined" && window.claude && window.claude.complete)) {
    return md.replace(/_HERMES กำลังวิเคราะห์งาน…[^\n]*/, "- แตกงานเป็นขั้นตอนย่อย แล้วลงมือทีละขั้น ตรวจผลทุกขั้นก่อนไปต่อ");
  }
  const prompt = `คุณคือ HERMES ผู้ควบคุมกิลด์ AI multi-agent ช่วยวางแผนงานต่อไปนี้ให้ Agent ลงมือทำต่อได้ทันที ตอบเป็นภาษาไทย เป็น Markdown สั้นกระชับ ภายใต้หัวข้อย่อยเหล่านี้เท่านั้น:
**Subtask ที่ควรทำ:** (checkbox \`- [ ]\` 3–6 ข้อ เรียงตามลำดับ)
**ข้อควรระวัง:** (2–3 ข้อ)
**เกณฑ์ตรวจรับงาน:** (2–3 ข้อ)

ห้ามมีคำนำหรือคำลงท้ายอื่น · ชื่องาน: "${title}"`;
  try {
    const r = await Promise.race([
      window.claude.complete(prompt),
      new Promise((_, rej) => setTimeout(() => rej("timeout"), 14000)),
    ]);
    if (r && r.trim()) return md.replace(/_HERMES กำลังวิเคราะห์งาน…[^\n]*/, r.trim());
  } catch (e) { }
  return md.replace(/_HERMES กำลังวิเคราะห์งาน…[^\n]*/, "- แตกงานเป็นขั้นตอนย่อย แล้วลงมือทีละขั้น ตรวจผลทุกขั้นก่อนไปต่อ");
}
function taskMdToHtml(md) {
  const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = s => esc(s).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  const lines = md.split("\n"); let html = "", inUl = false, inOl = false;
  const close = () => { if (inUl) { html += "</ul>"; inUl = false; } if (inOl) { html += "</ol>"; inOl = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, ""); let m;
    if (/^### /.test(line)) { close(); html += "<h3>" + inline(line.slice(4)) + "</h3>"; continue; }
    if (/^## /.test(line)) { close(); html += "<h2>" + inline(line.slice(3)) + "</h2>"; continue; }
    if (/^# /.test(line)) { close(); html += "<h1>" + inline(line.slice(2)) + "</h1>"; continue; }
    if (/^> /.test(line)) { close(); html += "<blockquote>" + inline(line.slice(2)) + "</blockquote>"; continue; }
    if (m = line.match(/^(\d+)\.\s+(.*)/)) { if (!inOl) { close(); html += "<ol>"; inOl = true; } html += "<li>" + inline(m[2]) + "</li>"; continue; }
    if (m = line.match(/^[-*]\s+(.*)/)) { if (!inUl) { close(); html += "<ul>"; inUl = true; } const t = m[1].replace(/^\[ \]\s*/, "☐ ").replace(/^\[[xX]\]\s*/, "☑ "); html += "<li>" + inline(t) + "</li>"; continue; }
    if (line.trim() === "") { close(); continue; }
    close(); html += "<p>" + inline(line) + "</p>";
  }
  close(); return html;
}
function worklogSeedFor(w, roomName) {
  const meta = { code: w.code || "GQ-00-0000", uuid: w.uuid || "—", roomNo: w.roomNo || 1, roomName: roomName || "", title: w.title, priority: w.priority || "normal", created: w.created || Date.now() };
  return taskMdToHtml(buildWorklogMd(meta).replace(/_HERMES กำลังวิเคราะห์งาน…[^\n]*/, "- แตกงานเป็นขั้นตอนย่อย แล้วลงมือทีละขั้น ตรวจผลทุกขั้นก่อนไปต่อ"));
}
/* create a room bound to a task (writes to the room store directly) */
function createRoomForTask(name, tplId, taskId) {
  let store = { rooms: [], seq: 1 };
  try { const raw = localStorage.getItem("guildos.rooms.v2"); if (raw) { const p = JSON.parse(raw); if (p && Array.isArray(p.rooms)) store = { rooms: p.rooms, seq: p.seq || p.rooms.length || 1 }; } } catch (e) { }
  const tpls = (window.loadTemplates ? window.loadTemplates() : []);
  const tpl = tplId ? tpls.find(t => t.id === tplId) : null;
  let room;
  if (window.blankRoom) {
    const base = window.blankRoom(name, 1, { dept: tpl ? tpl.dept : "ทั่วไป" });
    room = tpl ? { ...base, w: tpl.w || base.w, h: tpl.h || base.h, floor: (tpl.floor || base.floor).slice(), struct: (tpl.struct || base.struct).slice(), objects: (tpl.objects || []).map(o => ({ ...o })) } : base;
  } else {
    room = { id: "rm" + Date.now().toString(36), name, w: 32, h: 20, floor: [], struct: [], objects: [], dept: "ทั่วไป", ceo: "CEO" };
  }
  room.taskId = taskId; room.fromTask = true;
  store.rooms.push(room); store.seq = (store.seq || 0) + 1;
  try { localStorage.setItem("guildos.rooms.v2", JSON.stringify({ rooms: store.rooms, seq: store.seq })); } catch (e) { }
  return { id: room.id, no: store.rooms.length };
}
/* Task detail: row click opens this — two tabs, the AI worklog lives "deeper" inside */
function TaskDetail({ work, roomName, onClose }) {
  const [tab, setTab] = useState("brief");
  const isBrief = tab === "brief";
  const docId = isBrief ? work.detailDoc : (work.worklogDoc || ("work:" + work.id + ":worklog"));
  const seed = isBrief ? "" : worklogSeedFor(work, roomName);
  const fname = (work.code || work.title) + (isBrief ? "-brief.md" : "-worklog.md");
  return (
    <DocEditor key={tab} docId={docId} title={fname} seed={seed} onClose={onClose}
      tabs={[
        { key: "brief", label: "📄 รายละเอียดงาน", sub: "ผู้ใช้สร้าง" },
        { key: "worklog", label: "🤖 บันทึกการทำงาน", sub: "AI ทำงาน" },
      ]}
      activeTab={tab} onTab={setTab} />
  );
}

function QuestBoard({ onQuest, can, t }) {
  _st = (typeof t === "function") ? t : ((k) => k);
  const [filter, setFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [openTask, setOpenTask] = useState(null);
  const [roomMode, setRoomMode] = useState("new");
  const [tplId, setTplId] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [q2, setQ2] = useState("");
  const mayRun = !can || can("quest.run");
  const [works, setWorks] = useState(loadWorks);
  const [creating, setCreating] = useState(false);
  const [doc, setDoc] = useState(null);
  const [title, setTitle] = useState(""); const [roomId, setRoomId] = useState("");
  const [edit, setEdit] = useState(null);
  const draftId = useRef("d" + Date.now().toString(36));
  const rooms = (() => { try { return JSON.parse(localStorage.getItem("guildos.rooms.v2") || "{}").rooms || []; } catch (e) { return []; } })();
  const tpls = (window.loadTemplates ? window.loadTemplates() : []);
  const roomBusy = (rid) => works.some(w => w.roomId === rid);
  const mayDelTask = !can || can("task.delete");
  const ST = [["queued", st("qb.st.queued")], ["active", st("qb.st.active")], ["review", st("qb.st.review")], ["done", st("qb.st.done")]];
  const PR = [["high", st("qb.pr.high")], ["normal", st("qb.pr.normal")], ["low", st("qb.pr.low")]];
  const stLabel = s => (ST.find(x => x[0] === s) || ["", "—"])[1];
  const prLabel = p => p === "urgent" ? st("qb.pr.urgent") : (PR.find(x => x[0] === p) || ["", st("qb.pr.normal")])[1];
  const roomQueue = (rid) => works.filter(x => x.roomId === rid).sort((a, b) => ((a.order ?? a.created) - (b.order ?? b.created)));
  const queuePos = (w) => { const q = roomQueue(w.roomId); const i = q.findIndex(x => x.id === w.id); return i < 0 ? 1 : i + 1; };
  const fmtTime = (t) => { try { return new Date(t).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return "—"; } };
  const bumpFront = (w) => { const peers = works.filter(x => x.roomId === w.roomId).map(x => x.order ?? x.created); const minO = peers.length ? Math.min(...peers) : Date.now(); const nx = works.map(x => x.id === w.id ? { ...x, order: minO - 1, priority: "urgent", bumped: true } : x); setWorks(nx); saveWorks(nx); };
  // ---- 2-step finish (no countdown) + warn when AI not done ----
  const finishTask = async (w) => {
    const total = taskTotal(w), step = taskStep(w), aiDone = step >= total;
    const ok = await uiConfirm({
      title: st("qb.finishTitle"),
      icon: aiDone ? "✅" : "⚠️",
      message: aiDone
        ? st("qb.finishMsgDone", { title: w.title, step, total })
        : st("qb.finishMsgEarly", { title: w.title, step, total }),
      twoStep: true,                                   // 2 ชั้น
      confirmText: aiDone ? st("qb.finishConfirmDone") : st("qb.finishConfirmEarly"),
      confirmText2: st("qb.confirmAgain"),
      warnText: aiDone
        ? st("qb.warnDone")
        : st("qb.warnEarly", { step, total }),
    });
    if (!ok) return;
    const h = window.uiLoading && window.uiLoading({ title: st("qb.closing"), message: w.title });
    setTimeout(() => {
      const nx = works.map(x => x.id === w.id ? { ...x, status: "done", step: total, doneTs: Date.now() } : x);
      setWorks(nx); saveWorks(nx);
      if (!aiDone) { try { const rm = rooms.find(r => r.id === w.roomId); window.pushNotify && window.pushNotify({ from: "HERMES · ระบบ", roomId: w.roomId, taskTitle: w.title, question: `งาน “${w.title}” ถูกปิดก่อน AI ทำเสร็จ (${step}/${total} ขั้นตอน) — ตรวจงานที่ค้าง หรือกด Recall เพื่อดึงกลับมาทำต่อได้` }); } catch (e) { } }
      h && h.close();
    }, 650);
  };
  const recallTask = (w) => {
    const total = taskTotal(w);
    const h = window.uiLoading && window.uiLoading({ title: st("qb.recalling"), message: w.title });
    setTimeout(() => {
      const nx = works.map(x => x.id === w.id ? { ...x, status: "active", step: Math.max(1, total - 3), doneTs: null, recalled: true } : x);
      setWorks(nx); saveWorks(nx);
      try { const rm = rooms.find(r => r.id === w.roomId); window.pushNotify && window.pushNotify({ from: "HERMES · ระบบ", roomId: w.roomId, taskTitle: w.title, question: `ดึงงาน “${w.title}” กลับเข้าคิวให้ AI ทำต่อแล้ว — สถานะกลับเป็น ‘กำลังลุย’` }); } catch (e) { }
      h && h.close();
    }, 700);
  };
  // ---- create a task: gen UUID + room (new-from-template or existing) + write TWO .md files ----
  const createTask = async (t, roomChoice) => {
    const h = window.uiLoading && window.uiLoading({ title: st("qb.creating"), message: st("qb.creatingMsg") });
    const id = "wk" + Date.now().toString(36);
    const uuid = genUUID();
    let rid, roomNo, rmName;
    if (roomChoice.mode === "new") {
      const cr = createRoomForTask(roomChoice.name || t, roomChoice.tplId, id);
      rid = cr.id; roomNo = cr.no; rmName = roomChoice.name || t;
    } else {
      rid = roomChoice.roomId;
      roomNo = Math.max(1, rooms.findIndex(r => r.id === rid) + 1);
      const rm = rooms.find(r => r.id === rid); rmName = rm ? rm.name : "";
    }
    const code = genTaskCode(roomNo, uuid);
    const created = Date.now();
    const meta = { code, uuid, roomNo, roomName: rmName, title: t, priority: "normal", created };
    let draftHtml = ""; try { const k = "guildos.doc.work:" + draftId.current + ":detail"; draftHtml = localStorage.getItem(k) || ""; if (draftHtml) localStorage.removeItem(k); } catch (e) { }
    const briefMd = buildBriefMd(meta);
    let briefHtml = taskMdToHtml(briefMd); if (draftHtml) briefHtml += "<hr><h3>📎 รายละเอียดที่แนบ</h3>" + draftHtml;
    try { localStorage.setItem("guildos.doc.work:" + id + ":detail", briefHtml); } catch (e) { }
    if (h) h.update({ title: st("qb.analyzing"), message: code + "-worklog.md" });
    const worklogMd = await enhanceWorklog(buildWorklogMd(meta), t);
    try { localStorage.setItem("guildos.doc.work:" + id + ":worklog", taskMdToHtml(worklogMd)); } catch (e) { }
    const task = { id, uuid, code, roomNo, title: t, roomId: rid, createdRoom: roomChoice.mode === "new", detailDoc: "work:" + id + ":detail", worklogDoc: "work:" + id + ":worklog", briefMd, worklogMd, created };
    const nx = [task, ...works]; setWorks(nx); saveWorks(nx);
    draftId.current = "d" + Date.now().toString(36);
    try { window.pushNotify && window.pushNotify({ from: "HERMES · ระบบ", roomId: rid, taskTitle: t, question: `สร้างงาน “${t}” และ${roomChoice.mode === "new" ? `ห้อง “${rmName}”` : "ผูกเข้าห้อง"}แล้ว — รหัส ${code} · ไฟล์ ${code}-brief.md / ${code}-worklog.md พร้อมห้องทำงานของ AI` }); } catch (e) { }
    h && h.close();
  };
  // worklog seed for older tasks that don't have one yet
  const softDeleteTask = async (w) => {
    if (await uiConfirm({ title: st("qb.softDelTitle"), message: st("qb.softDelMsg", { title: w.title }), confirmText: st("qb.softDelTitle") })) {
      const nx = works.map(x => x.id === w.id ? { ...x, deleted: true, deletedTs: Date.now() } : x); setWorks(nx); saveWorks(nx);
    }
  };
  const restoreTask = (w) => { const nx = works.map(x => x.id === w.id ? { ...x, deleted: false, deletedTs: null } : x); setWorks(nx); saveWorks(nx); };
  const enterTaskRoom = (w) => {
    if (!w.roomId) { setOpenTask(w); return; }   // no room → fall back to task files
    window.__pendingRoom = w.roomId;
    try { window.__guildGo && window.__guildGo("hall"); } catch (e) { }
    setTimeout(() => { try { window.dispatchEvent(new Event("guildos-enter-room")); } catch (e) { } }, 110);
  };
  const purgeTask = async (w) => {
    if (await uiConfirm({ title: st("qb.purgeMsgTitle"), message: st("qb.purgeMsg", { title: w.title, room: w.createdRoom ? st("qb.purgeRoomFrag") : "" }), danger: true })) {
      try { localStorage.removeItem("guildos.doc." + w.detailDoc); localStorage.removeItem("guildos.doc." + (w.worklogDoc || ("work:" + w.id + ":worklog"))); } catch (e) { }
      if (w.createdRoom && w.roomId) { try { const raw = localStorage.getItem("guildos.rooms.v2"); const p = JSON.parse(raw); if (p && Array.isArray(p.rooms)) { p.rooms = p.rooms.filter(r => r.id !== w.roomId); localStorage.setItem("guildos.rooms.v2", JSON.stringify(p)); } } catch (e) { } }
      const nx = works.filter(x => x.id !== w.id); setWorks(nx); saveWorks(nx);
    }
  };
  return (
    <>
    <div className="content-pad fade-in" data-no-lex>
      <PageHead kicker={st("qb.kicker")} title={st("qb.title")} tag="local"
        desc={st("qb.desc")}
        actions={mayRun ? <Btn kind="gold" sm icon="➕" onClick={() => setCreating(true)}>{st("qb.new")}</Btn> : null} />
      <div className="tb-filterbar">
        <div className="tb-filter-search">
          <span className="rs-ic">🔍</span>
          <input value={q2} onChange={e => setQ2(e.target.value)} placeholder={st("qb.searchPh")} />
          {q2 && <button className="rs-clear" onClick={() => setQ2("")}>✕</button>}
        </div>
        <div className="tb-filter-controls">
          <Select minWidth={150} value={filter} onChange={setFilter}
            options={[{ value: "all", label: st("qb.allStatus") + ` (${works.length})` },
              ...ST.map(([k, l]) => ({ value: k, label: `${l} (${works.filter(w => (w.status || "queued") === k).length})` }))]} />
          <Select minWidth={150} value={roomFilter} onChange={setRoomFilter}
            options={[{ value: "all", label: st("qb.allRooms") },
              ...rooms.filter(r => works.some(w => w.roomId === r.id)).map(r => ({ value: r.id, label: `${r.name} (${works.filter(w => w.roomId === r.id).length})` }))]} />
          {(() => { const doneCount = works.filter(w => !w.deleted && (w.status || "queued") === "done").length; return (
            <label className={`done-check ${showDone ? "on" : ""}`} title={st("qb.showDoneTitle")} style={showTrash ? { opacity: .45, pointerEvents: "none" } : null}>
              <input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} />
              <span>{st("qb.doneLabel")}{doneCount ? ` (${doneCount})` : ""}</span>
            </label>
          ); })()}
          {(() => { const trashCount = works.filter(w => w.deleted).length; if (!trashCount && !showTrash) return null; return (
            <label className={`done-check ${showTrash ? "on" : ""}`} title={st("qb.trashTitle")}>
              <input type="checkbox" checked={showTrash} onChange={e => setShowTrash(e.target.checked)} />
              <span>{st("qb.trashLabel")}{trashCount ? ` (${trashCount})` : ""}</span>
            </label>
          ); })()}
        </div>
        <span className="tb-filter-count mono">{st("qb.taskCount", { n: works.filter(w => !w.deleted).length })}</span>
      </div>
      {(() => { const sw = works.filter(w => { const st = w.status || "queued"; if (showTrash) { if (!w.deleted) return false; } else { if (w.deleted) return false; if (filter === "all") { if (st === "done" && !showDone) return false; } else if (st !== filter) return false; } if (roomFilter !== "all" && w.roomId !== roomFilter) return false; if (q2.trim()) { const rm = rooms.find(r => r.id === w.roomId); const hay = [w.title, w.code || "", rm ? rm.name : "", w.created ? fmtTime(w.created) : ""].join(" ").toLowerCase(); if (!hay.includes(q2.trim().toLowerCase())) return false; } return true; }); return (
        <>
        {sw.length ? (
        <div className="list-rows">
          {sw.map(w => { const rm = rooms.find(r => r.id === w.roomId); return (
            <div key={w.id} className="codex-row" onClick={() => enterTaskRoom(w)}>
              <span style={{ fontSize: 18 }}>📌</span>
              <div className="codex-main"><div className="codex-title">{w.title}</div>
                <div className="codex-meta" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                  {w.code && <span className="qbadge mono" title={"UUID: " + (w.uuid || "")} style={{ color: "var(--ind, var(--gold-deep))", fontWeight: 600 }}>🆔 {w.code}</span>}
                  <span>{st("qb.row.room")}{rm ? rm.name : st("qb.row.roomUnknown")}{w.roomNo ? " · #" + w.roomNo : ""}</span>
                  <span className={`qbadge st-${w.status || "queued"}`}>● {stLabel(w.status || "queued")}</span>
                  <span className={`qbadge pr-${w.priority || "normal"}`}>{st("qb.row.priority")}{prLabel(w.priority || "normal")}</span>
                  <span className="qbadge">{st("qb.row.queue", { n: queuePos(w) })}</span>
                  {w.created ? <span className="qbadge">⏰ {fmtTime(w.created)}</span> : null}
                </div>
                {(() => { const total = taskTotal(w), step = taskStep(w), pct = Math.round(step / total * 100), done = step >= total, st = w.status || "queued", working = !done && (st === "active" || st === "review"); return (
                  <div className={`task-prog ${done ? "complete" : ""} ${working ? "working" : ""}`} onClick={e => e.stopPropagation()}>
                    <div className="task-prog-track"><div className="task-prog-fill" style={{ width: pct + "%" }} /></div>
                    <span className="task-prog-label mono">{step}/{total}</span>
                    {working && <span className="task-prog-ai">{st("qb.aiWorking")}</span>}
                    {done && <span className="task-prog-ai ok">{st("qb.allSteps")}</span>}
                  </div>
                ); })()}
              </div>
              <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
                {w.deleted ? (
                  <>
                    <button className="adoc-btn" style={{ color: "var(--emerald)" }} onClick={() => restoreTask(w)} title={st("qb.restoreTitle")}>{st("qb.restore")}</button>
                    {mayDelTask && <button className="room-card-del" onClick={() => purgeTask(w)} title={st("qb.purgeTitle")}>{st("qb.purgeBtn")}</button>}
                  </>
                ) : (
                  <>
                    {(w.status || "queued") === "done"
                      ? <button className="adoc-btn qb-recall-btn" style={{ color: "var(--gold)" }} onClick={() => recallTask(w)} title={st("qb.recallTitle")}>{st("qb.recall")}</button>
                      : <button className="adoc-btn qb-done-btn" style={{ color: "var(--emerald)" }} onClick={() => finishTask(w)}>{st("qb.doneBtn")}</button>}
                    <button className="adoc-btn qb-open-btn" onClick={() => setOpenTask(w)} title={st("qb.openTitle")}>{st("qb.open")}</button>
                    <button className="adoc-btn" onClick={() => setEdit({ id: w.id, title: w.title, priority: w.priority || "normal" })} title={st("qb.editRowTitle")}>{st("qb.editBtn")}</button>
                    {mayDelTask && <button className="room-card-del" onClick={() => softDeleteTask(w)} title={st("qb.trashRowTitle")}>🗑</button>}
                  </>
                )}
              </span>
            {w.ceoReport && (
              <div className={`ceo-report ${w.status === "done" ? "is-done" : ""}`}>
                <span className="ceo-report-av">👔</span>
                <div className="ceo-report-body">
                  <div className="ceo-report-head"><b>{w.by || st("qb.boss")}</b> <span className="mono muted">{st("qb.ceoReport")}{w.reportTs ? " · " + fmtTime(w.reportTs) : ""}</span></div>
                  <div className="ceo-report-text">{w.ceoReport}</div>
                </div>
                {w.status === "done" && <span className="ceo-report-done">{st("qb.taskDoneBadge")}</span>}
              </div>
            )}
          </div>
          ); })}
        </div>
      ) : <Empty icon={showTrash ? "🗑" : "📜"} title={showTrash ? st("qb.empty.trash") : (q2 ? st("qb.empty.noFound") : st("qb.empty.none"))} sub={showTrash ? st("qb.empty.trashSub") : (mayRun ? st("qb.empty.startSub") : "")} />}
        </>
      ); })()}
      {creating && (
        <div className="drawer-overlay qedit-overlay" onClick={() => setCreating(false)}>
          <div className="builder ornate" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <div className="builder-head"><span className="ph-icon" style={{ fontSize: 18 }}>📜</span><div><div className="kicker">{st("qb.create.kicker")}</div><h2 style={{ fontFamily: "var(--font-head)", fontSize: 19, margin: "2px 0 0", color: "var(--ink)" }}>{st("qb.create.title")}</h2></div><button className="drawer-close" style={{ marginLeft: "auto" }} onClick={() => setCreating(false)}>✕</button></div>
            <div className="builder-form" style={{ padding: 18 }}>
              <div className="bf"><label className="bf-label">{st("qb.f.name")}</label><input className="bf-input" value={title} onChange={e => setTitle(e.target.value)} placeholder={st("qb.f.namePh")} /></div>
              <div className="bf"><label className="bf-label">{st("qb.f.room")}</label>
                <div className="seg-toggle">
                  <button type="button" className={roomMode === "new" ? "on" : ""} onClick={() => setRoomMode("new")}>{st("qb.seg.new")}</button>
                  <button type="button" className={roomMode === "existing" ? "on" : ""} onClick={() => setRoomMode("existing")}>{st("qb.seg.existing")}</button>
                </div>
              </div>
              {roomMode === "new" ? (
                <>
                  <div className="bf"><label className="bf-label">{st("qb.f.roomName")}</label><input className="bf-input" value={newRoomName} onChange={e => setNewRoomName(e.target.value)} placeholder={title.trim() || st("qb.f.roomNamePh")} /></div>
                  <div className="bf"><label className="bf-label">{st("qb.f.tpl")}</label>
                    <Select block value={tplId} onChange={setTplId}
                      options={[{ value: "", label: st("qb.tpl.blank") },
                        ...tpls.map(t => ({ value: t.id, label: t.name + (t.seed ? "" : st("qb.tpl.mine")) }))]} />
                  </div>
                </>
              ) : (
                <div className="bf"><label className="bf-label">{st("qb.f.assign")}</label>
                  <Select block value={roomId} onChange={setRoomId} placeholder={st("qb.selectRoom")}
                    options={[{ value: "", label: st("qb.selectRoom") },
                      ...rooms.map(r => { const n = works.filter(w => w.roomId === r.id).length; return { value: r.id, label: r.name + (n ? " (" + st("qb.queueSuffix", { n }) + ")" : " (" + st("qb.noTask") + ")") }; })]} />
                </div>
              )}
              <div className="bf"><label className="bf-label">{st("qb.f.detail")}</label><Btn kind="ghost" sm icon="📝" onClick={() => setDoc({ id: "work:" + draftId.current + ":detail", title: "รายละเอียดงาน", seed: "<h1>รายละเอียดงาน</h1><p>อธิบายงาน แนบรูป/ไฟล์เอกสารให้ AI เข้าใจ…</p>" })}>{st("qb.openEditor")}</Btn></div>
            </div>
            <div className="builder-foot">
              <Btn kind="ghost" onClick={() => setCreating(false)}>{st("common.cancel")}</Btn>
              {(() => { const ok = title.trim() && (roomMode === "new" || roomId); return (
                <Btn kind="gold" icon="✓" style={{ opacity: ok ? 1 : .5, pointerEvents: ok ? "auto" : "none" }} onClick={() => { const t = title.trim(); if (!t) return; let choice; if (roomMode === "new") choice = { mode: "new", tplId, name: newRoomName.trim() || t }; else { if (!roomId) return; choice = { mode: "existing", roomId }; } setCreating(false); setTitle(""); setRoomId(""); setNewRoomName(""); setTplId(""); createTask(t, choice); }}>{st("qb.createBtn")}</Btn>
              ); })()}
            </div>
          </div>
        </div>
      )}
      {edit && (
        <div className="drawer-overlay qedit-overlay" onClick={() => setEdit(null)}>
          <div className="qedit-modal" onClick={e => e.stopPropagation()}>
            <div className="qedit-head"><span style={{ fontSize: 18 }}>✎</span><h2>{st("qb.edit.title")}</h2><button className="drawer-close" style={{ marginLeft: "auto" }} onClick={() => setEdit(null)}>✕</button></div>
            <div className="qedit-body">
              <div className="bf"><label className="bf-label">{st("qb.f.name")}</label><input className="bf-input" value={edit.title} onChange={e => setEdit({ ...edit, title: e.target.value })} /></div>
              <div className="bf"><label className="bf-label">{st("qb.f.priority")}</label>
                {edit.priority === "urgent"
                  ? <div className="bf-input prio-locked">{st("qb.urgentLocked")} <span className="qbadge pr-urgent" style={{ marginLeft: "auto" }}>{st("qb.lockedTag")}</span></div>
                  : <Select block value={edit.priority} onChange={v => setEdit({ ...edit, priority: v })}
                      options={PR.map(([k, l]) => ({ value: k, label: l }))} />}
              </div>
              {(() => { const ew = works.find(x => x.id === edit.id); if (!ew) return null; return (
                <div className="qedit-info">
                  <div className="qei-row"><span className="qei-k">{st("qb.createdAt")}</span><span className="qei-v">{fmtTime(ew.created)}</span></div>
                  <div className="qei-row"><span className="qei-k">{st("qb.curQueue")}</span><span className="qei-v">{st("qb.inThisRoom", { n: queuePos(ew) })}</span></div>
                  <Btn kind="ghost" sm icon="⏫" style={{ alignSelf: "flex-start", opacity: ew.bumped ? .45 : 1, pointerEvents: ew.bumped ? "none" : "auto" }} onClick={() => { bumpFront(ew); setEdit({ ...edit, priority: "urgent" }); }}>{st("qb.bumpFront")}{ew.bumped ? st("qb.bumpDone") : ""}</Btn>
                  <div className="qei-note">{ew.bumped ? st("qb.bumpedNote") : st("qb.queueNote")}</div>
                </div>
              ); })()}
            </div>
            <div className="qedit-foot">
              <Btn kind="ghost" onClick={() => setEdit(null)}>{st("common.cancel")}</Btn>
              <Btn kind="gold" icon="✓" style={{ opacity: edit.title.trim() ? 1 : .5, pointerEvents: edit.title.trim() ? "auto" : "none" }} onClick={() => { const nx = works.map(x => x.id === edit.id ? { ...x, title: edit.title.trim(), priority: edit.priority } : x); setWorks(nx); saveWorks(nx); setEdit(null); }}>{st("common.save")}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
      {doc && <DocEditor docId={doc.id} title={doc.title} seed={doc.seed} onClose={() => setDoc(null)} />}
      {openTask && <TaskDetail work={openTask} roomName={(rooms.find(r => r.id === openTask.roomId) || {}).name} onClose={() => setOpenTask(null)} />}
    </>
  );
}

/* ---------------- AGENTS / ROSTER ---------------- */
function Agents({ onAgent, S, can, t }) {
  const tx = t || ((k) => k);
  const chars = S.chars;
  const mayCreate = !can || can("agent.create");
  return (
    <div className="content-pad fade-in" data-no-lex>
      <PageHead kicker={tx("agents.kicker")} title={tx("agents.title")} tag="local"
        desc={tx("agents.desc")}
        actions={<>{chars.length > 0 && <Btn kind="ghost" sm onClick={() => S.loadSamples()}>{tx("agents.reset")}</Btn>}{mayCreate && <Btn kind="gold" sm icon="➕" onClick={() => S.openBuilder()}>{tx("agents.create")}</Btn>}</>} />
      <HelpNote tag="local">{tx("agents.help")}</HelpNote>
      {chars.length === 0 ? (
        <Panel><div className="empty-state">
          <div className="empty-icon">🎭</div>
          <div className="thai-serif" style={{ fontSize: 17, color: "var(--ink-2)" }}>{tx("agents.empty")}</div>
          <div className="muted" style={{ fontSize: 13.5, marginTop: 5, marginBottom: 18, maxWidth: 420 }}>{tx("agents.emptySub")}</div>
          <div className="row" style={{ gap: 10 }}>
            <Btn kind="gold" icon="➕" onClick={() => S.openBuilder()}>{tx("agents.createFirst")}</Btn>
            <Btn kind="ghost" onClick={() => S.loadSamples()}>{tx("agents.addSamples6")}</Btn>
          </div>
        </div></Panel>
      ) : (
        <div className="grid cols-3 stagger">
          {chars.map(a => (
            <button key={a.id} className="myagent-card" onClick={() => onAgent(a)}>
              <span className="myagent-art"><CharacterSprite charId={a.characterId} walking={false} h={56} style={{ position: "static" }} /></span>
              <span className="myagent-info">
                <span className="myagent-name">{a.name}</span>
                <span className="myagent-role mono">{a.role || a.position || ""}</span>
                <span style={{ marginTop: 5 }}><StatusBadge s={a.status} /></span>
              </span>
            </button>
          ))}
          {mayCreate && <button className="agent-card" onClick={() => S.openBuilder()} style={{ alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, borderStyle: "dashed", minHeight: 110 }}>
            <span style={{ fontSize: 26, color: "var(--gold)" }}>➕</span>
            <span className="thai-serif" style={{ fontSize: 14, color: "var(--ink-2)" }}>{tx("agents.create")}</span>
          </button>}
        </div>
      )}
    </div>
  );
}

/* ---------------- COUNCIL / MEETING ---------------- */
function Meeting({ S, t }) {
  _st = (typeof t === "function") ? t : ((k) => k);
  const chars = S.chars;
  return (
    <div className="content-pad fade-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHead kicker={st("meeting.kicker")} title={st("meeting.title")} tag="demo"
        desc={st("meeting.desc")} />
      <HelpNote tag="demo">{st("meeting.help")}</HelpNote>
      <div className="grid" style={{ gridTemplateColumns: "1fr 280px", gap: 18, flex: 1, minHeight: 0 }}>
        <Panel title={st("meeting.council")} en="COUNCIL" icon="💬" bodyPad={false}
          right={<FeatureTag kind="demo" />}
          className="col" >
          <div style={{ height: "calc(100vh - 280px)", display: "flex", flexDirection: "column" }}><LiveChat /></div>
        </Panel>
        <div className="col" style={{ gap: 16 }}>
          <Panel title={st("meeting.party")} en="PARTY" icon="🎭">
            {chars.length === 0 ? <Empty icon="🎭" title={st("meeting.noParty")} /> :
            <div className="list-rows">
              {chars.filter(a => a.status !== "idle").map(a => (
                <div key={a.id} className="row" style={{ gap: 10 }}>
                  <Avatar a={a} size="sm" /><div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    <div className="mono faint" style={{ fontSize: 10 }}>{a.classEn}</div>
                  </div>
                </div>
              ))}
            </div>}
          </Panel>
          <Panel title={st("meeting.agenda")} en="AGENDA" icon="📌">
            <div className="col" style={{ gap: 10, fontSize: 13, color: "var(--ink-2)" }}>
              <div className="row" style={{ gap: 8 }}><span className="gem" style={{ width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" }} />{st("meeting.item1")}</div>
              <div className="row" style={{ gap: 8 }}><span className="gem" style={{ width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" }} />{st("meeting.item2")}</div>
              <div className="row" style={{ gap: 8 }}><span className="gem" style={{ width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" }} />{st("meeting.item3")}</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { AgentDrawer, QuestDrawer, QuestBoard, Agents, Meeting });

export {
  AgentDrawer,
  Agents,
  Meeting,
  QuestBoard,
  QuestDrawer,
  TaskDetail,
  WORKS_LS,
  buildBriefMd,
  buildWorklogMd,
  createRoomForTask,
  enhanceWorklog,
  genTaskCode,
  genUUID,
  loadWorks,
  saveWorks,
  taskHash,
  taskMdToHtml,
  taskMetaBlock,
  taskStep,
  taskTotal,
  worklogSeedFor
};
