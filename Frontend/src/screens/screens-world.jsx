/* PiKaOs — ES module (migrated from PiKaOs/screens-world.jsx). */
import React from 'react';
const { useState, useEffect, useRef } = React;
import { charSetById, roomAgents } from '../lib/characters.jsx';
import { Btn, FeatureTag, PageHead } from '../components/components.jsx';
import { Select } from '../components/ui/Dropdown.jsx';
import { fmtTok } from '../data/data-users.jsx';
import { QUESTS } from '../data/data.jsx';
import { bfsPath, blankRoom, buildGrid, idx, randomWalkable, seatCells, templateFromRoom, useRooms, useTemplates } from '../lib/room-store.jsx';
import { CATS, FLOOR_TYPES, FURN, PAL, drawObject, drawRoom, effFootprint, objCells } from '../lib/room-tiles.jsx';
import { ACTS, ROLE_ACTS, Sound, advanceActivity, pickActivity, spawnSubs, tickSubs } from '../lib/world-life.jsx';

/* ============================================================
   WORLD — room-select lobby + top-down build-your-room sandbox.
   Pick a room card → enter a Sims-style top-down room you can
   decorate (paint floors, raise walls, place & rotate furniture).
   Guild agents wander the room and sit at chairs to feel alive.
   Layouts autosave to localStorage. HERMES rides along (floating).
   ============================================================ */

/* ---------------- character sprite (animated idle / walk sheets) ---------------- */
let _wt = (k) => k;
const wt = (k, v) => _wt(k, v);
function CharacterSprite({ charId, walking, h = 40, flip = false, style }) {
  const set = charSetById(charId) || { idleUrl: "/assets/ceo-idle.png", walkUrl: "/assets/ceo-walk.png", fw: 158, fh: 356, n: 40 };
  const n = set.n || 40;
  const dispW = Math.round(h * set.fw / set.fh);
  const url = walking ? (set.walkUrl || set.idleUrl) : set.idleUrl;
  return (
    <div className="ceo-sprite" aria-hidden="true"
      style={{ width: dispW, height: Math.round(h),
        backgroundImage: `url("${url}")`,
        backgroundSize: `calc(${dispW}px * ${n}) 100%`,
        backgroundPositionX: `calc(var(--f, 0) * ${dispW}px * -1)`,
        transform: flip ? "scaleX(-1)" : "none", ...style }} />
  );
}

/* ---- CEO summary (combined chat) + per-room chat helpers ---- */
function _agentLine(c) {
  const actKey = ((typeof ROLE_ACTS !== "undefined" && ROLE_ACTS[c.classKey]) || ["thinking"])[0];
  const act = (typeof ACTS !== "undefined" && ACTS[actKey]) || { th: "กำลังคิด" };
  const left = QUESTS.filter(q => q.party.includes(c.id) && q.status !== "done").reduce((s, q) => s + Math.max(0, (q.steps || 0) - (q.stepDone || 0)), 0);
  return `${c.name.split(" ")[0]} (${act.th}${left ? `, เหลือ ${left} งาน` : ""})`;
}
function ceoContext(rooms, chars) {
  const lines = rooms.map((r, i) => {
    const mem = roomAgents(r, i, rooms, chars);
    const tok = mem.reduce((s, c) => s + (c.mana || 0), 0);
    return `ห้อง ${r.name}: ${mem.length} คน, token ${tok}. ${mem.slice(0, 4).map(_agentLine).join("; ") || "ว่าง"}`;
  });
  return `คุณคือ CEO ของระบบ มีหน้าที่สรุปภาพรวมว่าแต่ละห้องทำอะไร ถึงไหนแล้ว ใช้ token เท่าไร ตอบไทยสั้นกระชับ.\n${lines.join("\n")}`;
}
function ceoReply(p, rooms, chars) {
  const q = p.toLowerCase();
  const busy = chars.filter(c => c.status === "busy" || c.status === "on").length;
  const tok = chars.reduce((s, c) => s + (c.mana || 0), 0);
  if (/(token|โทเคน|ใช้ไป|ต้นทุน|งบ)/.test(q)) {
    const per = rooms.map((r, i) => `${r.name} ${roomAgents(r, i, rooms, chars).reduce((s, c) => s + (c.mana || 0), 0)}`).join(" · ");
    return `รวมใช้ ~${tok} token ครับ แยกตามห้อง: ${per}`;
  }
  if (/(ใคร|who|ห้องไหน)/.test(q))
    return rooms.map((r, i) => `${r.name}: ${roomAgents(r, i, rooms, chars).map(c => c.name.split(" ")[0]).join(", ") || "—"}`).join(" | ");
  return `รายงานภาพรวมครับ: ${rooms.length} ห้อง · ${chars.length} เอเจนต์ (กำลังทำงาน ${busy}). ` +
    rooms.map((r, i) => { const m = roomAgents(r, i, rooms, chars); return `${r.name} ${m.length} คน${m.length ? " — " + _agentLine(m[0]) : ""}`; }).join(" · ");
}
function roomReply(p, room, roomChars) {
  if (!roomChars.length) return `ห้อง ${room.name} ยังไม่มีเอเจนต์ครับ — กด ‘✨ สร้างเอเจนต์’ เพื่อเพิ่ม`;
  const named = roomChars.find(c => p.includes(c.name.split(" ")[0]));
  if (named) return `${named.name}: ${_agentLine(named)} — งานปัจจุบัน “${named.task}”`;
  const q = p.toLowerCase();
  if (/(ใคร|who|มีใคร)/.test(q)) return `ห้องนี้มี: ${roomChars.map(c => c.name).join(", ")}`;
  if (/(ทำอะไร|งาน|ยุ่ง|สถานะ|activity)/.test(q)) return roomChars.map(_agentLine).join(" · ");
  return `ถามทีมในห้อง ${room.name} ได้เลยครับ เช่น “ใครทำอะไรอยู่” หรือเอ่ยชื่อสมาชิกเพื่อถามรายตัว`;
}

/* ---- the .md files an AI Agent System should carry (room side panel) ---- */
const SHARED_FILES = [
  { f: "PERSONA.md", th: "บุคลิก/น้ำเสียงร่วม", d: "พูดเสียงเดียวกันทั้งทีม ไม่ให้ output ขัดกัน" },
  { f: "CONSTRAINTS.md", th: "กฎความปลอดภัย/ธุรกิจ", d: "บังคับทุกตัวเท่ากัน" },
  { f: "WORKFLOW.md", th: "ตำแหน่งใน pipeline", d: "แต่ละตัวรู้ว่าอยู่ตรงไหนของงาน" },
  { f: "GLOSSARY.md", th: "ศัพท์ร่วม", d: "ใช้คำศัพท์เดียวกัน ลด hallucination" },
];
const PERAGENT_FILES = [
  { f: "SKILL.md", th: "ความสามารถเฉพาะตัว", d: "แต่ละตัวทำได้ไม่เหมือนกัน" },
  { f: "TOOLS.md", th: "tools ที่ตัวนี้ใช้", d: "ไม่ต้องรู้ tools ที่ไม่ได้ใช้" },
  { f: "EXAMPLES.md", th: "ตัวอย่างเฉพาะงาน", d: "input/output ของงานตัวเอง" },
  { f: "REFERENCE.md", th: "ข้อมูลเทคนิคเฉพาะด้าน", d: "API/schema เฉพาะทาง" },
];
function RoomChat({ room, roomChars }) {
  const greet = { who: "ai", text: `ถามทีมในห้อง “${room.name}” ได้เลยครับ — เอ่ยชื่อสมาชิกเพื่อถามรายตัว หรือเลือกหัวข้อด้านล่าง`, choices: ["ใครทำอะไรอยู่", "สรุปคิวงาน", "สถานะล่าสุด", "📎 ขอส่งไฟล์ให้ทีม"] };
  const [msgs, setMsgs] = useState([greet]);
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  const [atts, setAtts] = useState([]); const [menu, setMenu] = useState(false);
  const sc = useRef(null), fileRef = useRef(null), imgRef = useRef(null), reqRef = useRef(null);
  const followups = ["ใครทำอะไรอยู่", "สรุปคิวงาน", "📎 ขอส่งไฟล์ให้ทีม"];
  useEffect(() => { if (sc.current) sc.current.scrollTop = sc.current.scrollHeight; }, [msgs, busy, atts]);
  const readFile = (file, kind) => new Promise(res => { const rd = new FileReader(); rd.onload = () => res({ id: Date.now() + "_" + Math.random().toString(36).slice(2), kind, name: file.name, size: file.size, dataUrl: rd.result }); rd.readAsDataURL(file); });
  const pickFiles = async (e, kind) => { const files = [...e.target.files]; e.target.value = ""; for (const f of files) { const a = await readFile(f, kind); setAtts(p => [...p, a]); } setMenu(false); };
  const send = async (text, extraAtts) => {
    const t = (text ?? draft).trim(); const sendAtts = extraAtts || atts;
    if ((!t && sendAtts.length === 0) || busy) return;
    setMsgs(m => [...m, { who: "me", text: t, attachments: sendAtts }]);
    setDraft(""); setAtts([]); setMenu(false); setBusy(true);
    if (!sendAtts.length && /ขอส่งไฟล์|ส่งไฟล์ให้ทีม|อัปโหลด|แนบไฟล์ให้/.test(t)) {
      await new Promise(r => setTimeout(r, 450));
      setMsgs(m => [...m, { who: "ai", text: "ได้เลยครับ — แนบไฟล์หรือรูปที่อยากให้ทีมช่วยดู ผมจะให้ Agent อ่านและสรุปให้", request: "any" }]);
      setBusy(false); return;
    }
    if (sendAtts.length) {
      await new Promise(r => setTimeout(r, 600));
      const names = sendAtts.map(a => a.name).join(", ");
      setMsgs(m => [...m, { who: "ai", text: `รับไฟล์ “${names}” แล้วครับ — ให้ Agent ในห้องช่วยวิเคราะห์และสรุปผล จากนั้นจะส่งออกเป็นไฟล์ในแท็บ ‘ไฟล์ส่งออก’`, choices: followups }]);
      setBusy(false); return;
    }
    let reply = "";
    try { if (window.claude && window.claude.complete) { const sys = `คุณเป็นผู้ช่วยรายงานสถานะของทีมในห้อง ${room.name}. สมาชิก: ${roomChars.map(_agentLine).join("; ") || "ว่าง"}. ตอบไทยสั้นกระชับ`; reply = await window.claude.complete(sys + "\n\nคำถาม: " + t); } } catch (e) { reply = ""; }
    if (!reply || !reply.trim()) reply = roomReply(t, room, roomChars);
    setMsgs(m => [...m, { who: "ai", text: reply.trim(), choices: followups }]);
    setBusy(false);
  };
  const onAiUpload = async (e) => { const files = [...e.target.files]; e.target.value = ""; const list = []; for (const f of files) list.push(await readFile(f, f.type.startsWith("image") ? "image" : "file")); send("", list); };
  return (
    <div className="ra-chat">
      <div className="ra-scroll" ref={sc}>
        {msgs.map((m, i) => (
          <div key={i} className={`rc-msg ${m.who}`}>
            <div className={`wbubble ${m.who}`}>{m.who === "ai" && <span className="wbubble-ic">🤖</span>}<span className="wbubble-txt">{m.text}</span></div>
            {m.attachments && m.attachments.length > 0 && (
              <div className="wb-atts">{m.attachments.map(a => a.kind === "image"
                ? <img key={a.id} className="wb-att-img" src={a.dataUrl} alt={a.name} title={a.name} />
                : <span key={a.id} className="wb-att">📎 {a.name}</span>)}</div>
            )}
            {m.request && (
              <div className="rc-req">
                <button className="rc-reqbtn" onClick={() => reqRef.current && reqRef.current.click()}>⬆ เลือกไฟล์/รูปเพื่อส่งให้ทีม</button>
                <input ref={reqRef} type="file" multiple style={{ display: "none" }} onChange={onAiUpload} />
              </div>
            )}
            {m.choices && m.choices.length > 0 && (
              <div className="rc-choices">{m.choices.map((c, j) => <button key={j} className="rc-choice" onClick={() => send(c)} disabled={busy}>{c}</button>)}</div>
            )}
          </div>
        ))}
        {busy && <div className="wbubble ai"><span className="wbubble-ic">🤖</span><span className="typing-bubble" style={{ display: "inline-flex" }}><span /><span /><span /></span></div>}
      </div>
      {atts.length > 0 && (
        <div className="rc-atts">
          {atts.map(a => (
            <span key={a.id} className="rc-att">
              {a.kind === "image" ? <img src={a.dataUrl} alt="" /> : <span className="rc-att-ic">📎</span>}
              <span className="rc-att-name">{a.name}</span>
              <button onClick={() => setAtts(p => p.filter(x => x.id !== a.id))}>✕</button>
            </span>
          ))}
        </div>
      )}
      <div className="rc-compose">
        <div className="rc-plus-wrap">
          <button className="rc-plus" onClick={() => setMenu(v => !v)} title="แนบไฟล์ / รูป">＋</button>
          {menu && (
            <div className="rc-menu">
              <button onClick={() => fileRef.current && fileRef.current.click()}>📎 แนบไฟล์</button>
              <button onClick={() => imgRef.current && imgRef.current.click()}>🖼 แนบรูป</button>
              <button onClick={() => { setMenu(false); send("📎 ขอส่งไฟล์ให้ทีม"); }}>🤖 ให้ AI ขอไฟล์</button>
            </div>
          )}
        </div>
        <input className="rc-text" value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="ถามทีม หรือพิมพ์ข้อความ…" />
        <button className="rc-send" onClick={() => send()} disabled={busy} title="ส่ง">➤</button>
        <input ref={fileRef} type="file" multiple style={{ display: "none" }} onChange={e => pickFiles(e, "file")} />
        <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => pickFiles(e, "image")} />
      </div>
    </div>
  );
}
const EXPORT_TYPES = {
  xlsx: { label: "Excel", icon: "📊", tone: "emerald", ext: "xls", mime: "application/vnd.ms-excel" },
  json: { label: "JSON", icon: "🧾", tone: "gold", ext: "json", mime: "application/json" },
  csv: { label: "CSV", icon: "📈", tone: "sapphire", ext: "csv", mime: "text/csv" },
  md: { label: "Markdown", icon: "📝", tone: "violet", ext: "md", mime: "text/markdown" },
};
function exportSeed(roomId) {
  const now = Date.now();
  return [
    { id: "ex_" + roomId + "_1", name: "agent-report", type: "xlsx", size: "24 KB", by: "นักวิเคราะห์", ts: now - 3600e3 },
    { id: "ex_" + roomId + "_2", name: "task-result", type: "json", size: "3 KB", by: "HERMES", ts: now - 7200e3 },
    { id: "ex_" + roomId + "_3", name: "data-summary", type: "csv", size: "8 KB", by: "เก็บข้อมูล", ts: now - 86400e3 },
  ];
}
function loadExports(roomId) {
  const k = "guildos.exports." + roomId;
  try { const s = localStorage.getItem(k); if (s) return JSON.parse(s); } catch (e) { }
  const seed = exportSeed(roomId); try { localStorage.setItem(k, JSON.stringify(seed)); } catch (e) { } return seed;
}
function saveExports(roomId, list) { try { localStorage.setItem("guildos.exports." + roomId, JSON.stringify(list)); } catch (e) { } }
function exportTimeLabel(ts) { try { return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
function genExportContent(exp, room) {
  const rows = [["agent", "task", "status", "tokens"], ["นักวิเคราะห์", "สรุปข้อมูลตลาด", "done", "12400"], ["เก็บข้อมูล", "รวบรวมรายงาน", "active", "6200"], ["นักวิจัย", "ค้นคว้าแนวทาง", "review", "9100"]];
  if (exp.type === "json") return JSON.stringify({ room: room.name, file: exp.name, generatedBy: "PiKaOs · AI", rows: rows.slice(1).map(r => ({ agent: r[0], task: r[1], status: r[2], tokens: +r[3] })) }, null, 2);
  if (exp.type === "csv") return rows.map(r => r.join(",")).join("\n");
  if (exp.type === "md") return `# ${exp.name}\n\nส่งออกจากห้อง **${room.name}** โดย AI\n\n| Agent | Task | Status | Tokens |\n|---|---|---|---|\n` + rows.slice(1).map(r => `| ${r.join(" | ")} |`).join("\n") + "\n";
  // xlsx → HTML table (.xls opens in Excel)
  return `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${rows[0].map(h => `<th>${h}</th>`).join("")}</tr>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
}
function downloadExport(exp, room) {
  const t = EXPORT_TYPES[exp.type] || EXPORT_TYPES.json;
  const blob = new Blob([genExportContent(exp, room)], { type: t.mime + ";charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = exp.name + "." + t.ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function RoomExports({ room }) {
  const [exps, setExps] = useState(() => loadExports(room.id));
  useEffect(() => { setExps(loadExports(room.id)); }, [room.id]);
  const simulate = () => {
    const types = Object.keys(EXPORT_TYPES); const type = types[Math.floor(Math.random() * types.length)];
    const names = ["agent-report", "analysis", "dataset", "summary", "result", "metrics"];
    const e = { id: "ex" + Date.now(), name: names[Math.floor(Math.random() * names.length)] + "-" + (Math.floor(Math.random() * 900) + 100), type, size: (Math.floor(Math.random() * 40) + 2) + " KB", by: ["นักวิเคราะห์", "เก็บข้อมูล", "HERMES", "นักวิจัย"][Math.floor(Math.random() * 4)], ts: Date.now() };
    const nx = [e, ...exps]; setExps(nx); saveExports(room.id, nx);
  };
  const removeExp = (id) => { const nx = exps.filter(x => x.id !== id); setExps(nx); saveExports(room.id, nx); };
  return (
    <div className="ra-files ra-exports">
      <div className="ra-files-head mono ra-exp-headrow">
        <span>{wt("rx.head")}</span>
        <button type="button" className="ra-exp-gen" onClick={simulate}>{wt("rx.gen")}</button>
      </div>
      {exps.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>{wt("rx.empty")}</div> : exps.map(e => {
        const t = EXPORT_TYPES[e.type] || EXPORT_TYPES.json;
        return (
          <div key={e.id} className={`ra-exp tone-${t.tone}`}>
            <div className="ra-exp-ic">{t.icon}</div>
            <div className="ra-exp-main">
              <div className="ra-exp-name mono">{e.name}.{t.ext}</div>
              <div className="ra-exp-meta">{t.label} · {e.size}</div>
              <div className="ra-exp-by mono">🤖 {e.by} · {exportTimeLabel(e.ts)}</div>
            </div>
            <div className="ra-exp-actions">
              <button type="button" onClick={() => downloadExport(e, room)} title={wt("rx.download")}>⬇</button>
              <button type="button" onClick={() => removeExp(e.id)} title={wt("rx.delete")}>✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function loadSessions(roomId) {
  const k = "guildos.sessions." + roomId;
  try { const s = localStorage.getItem(k); if (s) return JSON.parse(s); } catch (e) { }
  const now = Date.now();
  const seed = [
    { id: "se_" + roomId + "_1", name: "คุยสรุปงานเช้า", ts: now - 86400e3 * 2, msgs: 14, note: "วางแผน sprint + แบ่งงานให้ agent" },
    { id: "se_" + roomId + "_2", name: "รีวิวผลทดสอบ", ts: now - 86400e3, msgs: 9, note: "ตรวจ regression + แก้บั๊ก" },
  ];
  try { localStorage.setItem(k, JSON.stringify(seed)); } catch (e) { } return seed;
}
function saveSessions(roomId, list) { try { localStorage.setItem("guildos.sessions." + roomId, JSON.stringify(list)); } catch (e) { } }
function sessionTime(ts) { try { return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
function RoomSessions({ room }) {
  const [list, setList] = useState(() => loadSessions(room.id));
  useEffect(() => { setList(loadSessions(room.id)); }, [room.id]);
  const save = () => {
    const names = ["คุยงานรอบใหม่", "ประชุมทีม", "วางแผนงาน", "ติดตามความคืบหน้า"];
    const e = { id: "se" + Date.now(), name: names[Math.floor(Math.random() * names.length)], ts: Date.now(), msgs: Math.floor(Math.random() * 20) + 3, note: "บันทึกเซสชันการทำงานในห้อง" };
    const nx = [e, ...list]; setList(nx); saveSessions(room.id, nx);
  };
  const remove = (id) => { const nx = list.filter(x => x.id !== id); setList(nx); saveSessions(room.id, nx); };
  return (
    <div className="ra-files ra-sessions">
      <div className="ra-files-head mono ra-exp-headrow">
        <span>{wt("rs.head")}</span>
        <button type="button" className="ra-exp-gen" onClick={save}>{wt("rs.save")}</button>
      </div>
      {list.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>{wt("rs.empty")}</div> : list.map(s => (
        <div key={s.id} className="ra-exp tone-sapphire">
          <div className="ra-exp-ic">🗂</div>
          <div className="ra-exp-main">
            <div className="ra-exp-name mono">{s.name}</div>
            <div className="ra-exp-meta">💬 {wt("rs.msgs", { n: s.msgs })} · {s.note}</div>
            <div className="ra-exp-by mono">🕒 {sessionTime(s.ts)}</div>
          </div>
          <div className="ra-exp-actions"><button type="button" onClick={() => remove(s.id)} title={wt("rs.delete")}>✕</button></div>
        </div>
      ))}
    </div>
  );
}
function RoomInfo({ room, roomChars, onOpenDoc }) {
  const works = (() => { try { return JSON.parse(localStorage.getItem("guildos.works.v1") || "[]"); } catch (e) { return []; } })();
  const linked = works.filter(w => w.id === room.taskId || w.roomId === room.id);
  const ST = { queued: wt("qb.st.queued"), active: wt("qb.st.active"), review: wt("qb.st.review"), done: wt("qb.st.done") };
  const openDoc = (id, title) => onOpenDoc && onOpenDoc({ id, title, seed: "" });
  return (
    <div className="ra-files ra-roominfo">
      <div className="ra-files-head mono" style={{ flexBasis: "100%" }}>{wt("ri.head")}</div>
      <div className="ri-meta">
        <div className="ri-mrow"><span className="ri-k">{wt("ri.room")}</span><span className="ri-v">{room.name}</span></div>
        <div className="ri-mrow"><span className="ri-k">{wt("ri.dept")}</span><span className="ri-v">{room.dept || wt("world.deptGeneral")}</span></div>
        <div className="ri-mrow"><span className="ri-k">{wt("ri.members")}</span><span className="ri-v">{wt("ri.agentCount", { n: roomChars.length })}</span></div>
        <div className="ri-mrow"><span className="ri-k">{wt("ri.linked")}</span><span className="ri-v">{wt("ri.taskCount", { n: linked.length })}</span></div>
      </div>
      {linked.length === 0
        ? <div className="muted" style={{ fontSize: 12, flexBasis: "100%" }}>{wt("ri.noLink")}</div>
        : linked.map(w => (
          <div key={w.id} className="ri-task">
            <div className="ri-task-top">
              {w.code && <span className="ri-code mono">🆔 {w.code}</span>}
              <span className={`qbadge st-${w.status || "queued"}`}>● {ST[w.status || "queued"]}</span>
            </div>
            <div className="ri-task-title">{w.title}</div>
            <div className="ri-task-actions">
              <button onClick={() => openDoc(w.detailDoc, (w.code || w.title) + "-brief.md")}>{wt("ri.brief")}</button>
              <button onClick={() => openDoc(w.worklogDoc || ("work:" + w.id + ":worklog"), (w.code || w.title) + "-worklog.md")}>{wt("ri.worklog")}</button>
              <button onClick={() => { try { window.__guildGo && window.__guildGo("quests"); } catch (e) { } }}>{wt("ri.board")}</button>
            </div>
          </div>
        ))}
    </div>
  );
}
function RoomAside({ room, roomChars, onOpenDoc, tab, setTab }) {
  const [selAgent, setSel] = useState("");
  const sel = roomChars.find(c => c.id === selAgent) ? selAgent : (roomChars[0] ? roomChars[0].id : "");
  const selName = (roomChars.find(c => c.id === sel) || {}).name || "";
  const open = (id, title, f) => onOpenDoc && onOpenDoc({ id, title, seed: DOC_SEED[f] || "" });
  return (
    <div className={"room-aside panel" + (tab === "chat" ? " ra-tall" : "")}>
      <div className="ra-tabs">
        <button className={`ra-tab ${tab === "chat" ? "on" : ""}`} onClick={() => setTab("chat")}>{wt("world.aside.chat")}</button>
        <button className={`ra-tab ${tab === "info" ? "on" : ""}`} onClick={() => setTab("info")}>{wt("world.aside.info")}</button>
        <button className={`ra-tab ${tab === "sessions" ? "on" : ""}`} onClick={() => setTab("sessions")}>{wt("world.aside.sessions")}</button>
        <button className={`ra-tab ${tab === "files" ? "on" : ""}`} onClick={() => setTab("files")}>{wt("world.aside.files")}</button>
        <button className={`ra-tab ${tab === "exports" ? "on" : ""}`} onClick={() => setTab("exports")}>{wt("world.aside.exports")}</button>
      </div>
      {tab === "chat" ? <RoomChat room={room} roomChars={roomChars} /> : tab === "info" ? <RoomInfo room={room} roomChars={roomChars} onOpenDoc={onOpenDoc} /> : tab === "sessions" ? <RoomSessions room={room} /> : tab === "exports" ? <RoomExports room={room} /> : (
        <div className="ra-files">
          <div className="ra-files-head mono">{wt("world.shared")}</div>
          {SHARED_FILES.map(m => (
            <button key={m.f} type="button" className="ra-file ra-file--shared" onClick={() => open("shared:" + m.f, m.f + wt("world.sharedSuffix"), m.f)}>
              <div className="ra-file-name mono">{m.f} <span className="ra-file-open">↗</span></div>
              <div className="ra-file-th">{wt("rfile." + m.f + ".t")}</div>
              <div className="ra-file-d">{wt("rfile." + m.f + ".d")}</div>
            </button>
          ))}
          <div className="ra-files-head mono" style={{ marginTop: 12 }}>{wt("world.perAgent")}</div>
          {roomChars.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>{wt("world.noAgentRoom")}</div> : (
            <>
              <Select className="ra-agent-sel" block value={sel} onChange={setSel}
                options={roomChars.map(c => ({ value: c.id, label: c.name }))} />
              {PERAGENT_FILES.map(m => (
                <button key={m.f} type="button" className="ra-file" onClick={() => open("agent:" + sel + ":" + m.f, m.f + " · " + selName.split(" ")[0], m.f)}>
                  <div className="ra-file-name mono">{m.f} <span className="ra-file-open">↗</span></div>
                  <div className="ra-file-th">{wt("rfile." + m.f + ".t")}</div>
                  <div className="ra-file-d">{wt("rfile." + m.f + ".d")}</div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
/* ---------------- room thumbnail ---------------- */
function RoomThumb({ room }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) drawRoom(ref.current, room, { cell: 9 }); }, [room]);
  return <canvas ref={ref} className="room-thumb-cv" />;
}

/* ---------------- templates tab ---------------- */
function TemplatesTab({ templates, canCreate, canManage, onUse, onRename, onDelete }) {
  return (
    <div className="room-picker">
      {templates.map(t => (
        <div key={t.id} className="room-card tpl-card">
          <div className="room-card-art"><RoomThumb room={t} /><span className="tpl-badge">{wt("world.tplBadge")}</span></div>
          <div className="room-card-foot">
            {canManage
              ? <input className="room-card-name" defaultValue={t.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== t.name) onRename(t.id, v); }} onKeyDown={e => e.key === "Enter" && e.target.blur()} />
              : <div className="room-card-name" style={{ pointerEvents: "none" }}>{t.name}</div>}
            <div className="room-card-meta mono">
              <span>🏢 {t.dept || wt("world.deptGeneral")}</span>
              <span>🪑 {(t.objects || []).length}</span>
              {canManage && !t.seed && <button className="room-card-del" title={wt("world.delTplTitle")} onClick={() => onDelete(t.id, t.name)}>🗑</button>}
            </div>
            {canCreate
              ? <Btn kind="gold" sm icon="＋" style={{ marginTop: 8, width: "100%" }} onClick={() => onUse(t)}>{wt("world.useTpl")}</Btn>
              : <div className="qei-note" style={{ marginTop: 8 }}>{wt("world.needCreatePerm")}</div>}
          </div>
        </div>
      ))}
      {!templates.length && <div className="empty-state" style={{ gridColumn: "1/-1" }}>{wt("world.noTpl")}</div>}
    </div>
  );
}

/* ---------------- room picker (lobby) ---------------- */
function RoomPicker({ rooms, chars, onEnter, onCreate, onRename, onDelete, canCreate, canDelete, query }) {
  const q = (query || "").trim().toLowerCase();
  const allWorks = (() => { try { return JSON.parse(localStorage.getItem("guildos.works.v1") || "[]"); } catch (e) { return []; } })();
  const taskById = {}; allWorks.forEach(w => { taskById[w.id] = w; });
  const roomVisible = (r) => { if (!r.taskId) return true; const tk = taskById[r.taskId]; if (!tk) return false; return !(tk.status === "done" || tk.deleted); };
  const shown = rooms.map((r, i) => ({ r, i })).filter(({ r }) => roomVisible(r) && (!q || r.name.toLowerCase().includes(q) || (r.dept || "").toLowerCase().includes(q)));
  return (
    <div className="room-picker">
      {shown.map(({ r, i }) => {
        const objs = (r.objects || []).length;
        const members = roomAgents(r, i, rooms, chars).length;
        const queue = allWorks.filter(x => x.roomId === r.id).length;
        return (
          <div key={r.id} className="room-card" onClick={() => onEnter(r.id)}>
            <div className="room-card-art"><RoomThumb room={r} />
              <span className="room-card-tag" title={wt("world.deptTitle")}>🏷️ {r.dept || wt("world.deptGeneral")}</span>
              {queue > 0 && <span className="room-card-q">📋 {wt("world.queueLabel", { n: queue })}</span>}
              <span className="room-card-enter">{wt("world.enterRoom")}</span></div>
            <div className="room-card-foot">
              <input className="room-card-name" defaultValue={r.name} readOnly={!canDelete} onClick={e => e.stopPropagation()}
                onBlur={e => { if (!canDelete) return; const v = e.target.value.trim(); if (v && v !== r.name) onRename(r.id, v); }} onKeyDown={e => e.key === "Enter" && e.target.blur()} />
              <div className="room-card-ceo" title={wt("world.ceoTitle")}><span className="rcc-badge">👔</span> {r.ceo || "CEO"}</div>
              <div className="room-card-meta mono">
                <span>👥 {members}</span><span>📋 {wt("world.queueLabel", { n: queue })}</span><span>🪑 {objs}</span>
                {canDelete && <button className="room-card-del" title={wt("world.delRoomTitle")} onClick={async e => { e.stopPropagation(); if (await uiConfirm({ title: wt("world.delRoomTitle"), message: wt("world.delRoomMsg", { name: r.name }), danger: true })) onDelete(r.id); }}>🗑</button>}
              </div>
            </div>
          </div>
        );
      })}
      {shown.length === 0 && <div className="room-empty muted">{q ? wt("world.noRoomFound") : wt("world.noRoom")}</div>}
      {canCreate && (
        <button className="room-card room-card-new" onClick={onCreate}>
          <span className="rc-plus">＋</span><span className="thai-serif" style={{ fontWeight: 700, fontSize: 15 }}>{wt("world.newRoomCard")}</span>
          <span className="muted" style={{ fontSize: 12 }}>{wt("world.newRoomCardSub")}</span>
        </button>
      )}
    </div>
  );
}

/* ---------------- living agents ---------------- */
function useLivingAgents(room, active, chars) {
  const stateRef = useRef({ agents: [], claimed: new Set() });
  const roomRef = useRef(room); roomRef.current = room;
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);
  const [, force] = React.useReducer(x => x + 1, 0);
  const sig = chars.map(c => c.id).join(",");
  useEffect(() => {
    const g = buildGrid(room);
    stateRef.current.claimed = new Set();
    stateRef.current.agents = chars.map(c => { const s = randomWalkable(g, room.w, room.h) || [1, 1]; return { id: c.id, char: c, cx: s[0], cy: s[1], path: [], sitUntil: 0, seat: null, goalSeat: null, warp: null, activity: "walking", actUntil: 0, bubble: null, subs: [], face: 0 }; });
    force();
  }, [room.id, sig]);
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => {
      const rm = roomRef.current, w = rm.w, h = rm.h;
      const g = buildGrid(rm); const seats = seatCells(rm); const st = stateRef.current; const now = Date.now();
      st.agents.forEach(a => {
        if (a.warp) return;                               // mid-teleport
        // ----- seated & working: drive the live activity -----
        if (a.seat && a.sitUntil > now) {
          if (now >= a.actUntil) advanceActivity(a, now);
          tickSubs(a, now);
          return;
        }
        // seat session ended → stand up
        if (a.seat) { st.claimed.delete(a.seat.x + "," + a.seat.y); a.seat = null; a.activity = "walking"; a.bubble = null; a.subs = []; }
        if (a.path.length) { const [nx, ny] = a.path.shift(); if (nx < a.cx) a.face = 1; else if (nx > a.cx) a.face = 0; a.cx = nx; a.cy = ny; a.activity = "walking"; a.bubble = null; return; }
        // GOING TO WORK → warp straight to the seat (ignores walls)
        if (Math.random() < 0.6 && seats.length) {
          const free = seats.filter(s => !st.claimed.has(s.x + "," + s.y) && g[idx(s.x, s.y, w)]);
          if (free.length) {
            const s = free[(Math.random() * free.length) | 0];
            st.claimed.add(s.x + "," + s.y);
            a.warp = "out";
            setTimeout(() => {
              if (!aliveRef.current) return;
              a.cx = s.x; a.cy = s.y; a.seat = s; a.sitUntil = Date.now() + 9000 + Math.random() * 13000;
              a.activity = pickActivity(a.char); a.actUntil = Date.now() + 1600 + Math.random() * 2200; a.bubble = null;
              if (["running", "searching", "thinking"].includes(a.activity) && Math.random() < 0.6) spawnSubs(a, Date.now());
              a.warp = "in"; force();
              setTimeout(() => { if (aliveRef.current) { a.warp = null; force(); } }, 380);
            }, 300);
            return;
          }
        }
        // idle wandering → stroll on foot (keeps the room alive)
        const goal = randomWalkable(g, w, h);
        if (goal) { const p = bfsPath(g, w, h, a.cx, a.cy, goal[0], goal[1]); if (p) a.path = p; }
      });
      force();
    }, 520);
    return () => clearInterval(iv);
  }, [active]);
  return stateRef.current.agents;
}

/* ---------------- the canvas + build interactions ---------------- */
function RoomCanvas({ room, build, tool, setTool, apply, chars, onAgent, maxW }) {
  const cvRef = useRef(null), wrapRef = useRef(null), painting = useRef(false), lastCell = useRef(null);
  const [hover, setHover] = useState(null);
  const [cellPx, setCellPx] = useState(22);
  const agents = useLivingAgents(room, !build, chars);

  useEffect(() => { if (cvRef.current) drawRoom(cvRef.current, room, { cell: 24 }); }, [room]);
  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver(es => { const w = es[0].contentRect.width; setCellPx(w / room.w); });
    ro.observe(wrapRef.current); return () => ro.disconnect();
  }, [room.w]);

  const cellAt = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * room.w);
    const y = Math.floor((e.clientY - r.top) / r.height * room.h);
    if (x < 0 || y < 0 || x >= room.w || y >= room.h) return null; return { x, y };
  };
  const down = (e) => {
    if (!build) return; const c = cellAt(e); if (!c) return;
    try { wrapRef.current.setPointerCapture(e.pointerId); } catch (_) { } painting.current = true; lastCell.current = c.x + "," + c.y;
    apply(c.x, c.y, true);
  };
  const move = (e) => {
    const c = cellAt(e); setHover(c);
    if (!build || !painting.current || !c) return;
    const k = c.x + "," + c.y; if (k === lastCell.current) return; lastCell.current = k;
    if (tool.type !== "object") apply(c.x, c.y, false);
  };
  const up = () => { painting.current = false; lastCell.current = null; };

  // ghost footprint while placing an object
  let ghost = null;
  if (build && hover && tool.type === "object" && tool.key) {
    const f = effFootprint(tool.key, tool.rot);
    ghost = { x: hover.x, y: hover.y, w: f.w, h: f.h };
  }
  const pc = (n, d) => (n / d * 100) + "%";

  return (
    <div className="room-canvas-wrap" ref={wrapRef}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => { setHover(null); up(); }}
      style={{ cursor: build ? "crosshair" : "default", maxWidth: maxW ? maxW + "px" : undefined }}>
      <canvas ref={cvRef} className="room-canvas" />

      {build && hover && tool.type !== "object" && (
        <div className="rc-hi" style={{ left: pc(hover.x, room.w), top: pc(hover.y, room.h), width: pc(1, room.w), height: pc(1, room.h) }} />
      )}
      {ghost && (
        <div className="rc-ghost" style={{ left: pc(ghost.x, room.w), top: pc(ghost.y, room.h), width: pc(ghost.w, room.w), height: pc(ghost.h, room.h) }} />
      )}

      <svg className="rc-links" viewBox={`0 0 ${room.w} ${room.h}`} preserveAspectRatio="none">
        {agents.flatMap(a => (a.subs || []).map(s => (
          <line key={s.id} x1={a.cx + 0.5} y1={a.cy + 0.2} x2={a.cx + 0.5 + s.dx} y2={a.cy + 0.45 + s.dy} />
        )))}
      </svg>
      <div className="rc-agents">
        {agents.map(a => {
          const act = ACTS[a.activity] || null;
          const actCls = (a.seat && !a.warp && act) ? act.cls : "";
          return (
          <button key={a.id} className={`rc-agent ${a.seat && !a.warp ? "seated" : ""} ${a.warp ? "warping warp-" + a.warp : ""} ${actCls}`}
            title={`${a.char.name}${act ? " · " + act.th : ""}`}
            style={{ left: pc(a.cx + 0.5, room.w), top: pc(a.cy + 0.62, room.h), zIndex: 10 + a.cy }}
            onClick={(e) => { e.stopPropagation(); onAgent && onAgent(a.char); }}>
            {a.warp && <span className="rc-warp-fx" />}
            {a.bubble
              ? <span className={`rc-bubble ${a.bubble.kind}`}>{act ? act.icon : ""} {a.bubble.text}</span>
              : (a.seat && !a.warp && act && act.cls ? <span className="rc-actchip">{act.icon}</span> : null)}
            <span className="rc-agent-shadow" />
            <span className="rc-agent-status" data-s={a.char.status} />
            <CharacterSprite charId={a.char.characterId} walking={!a.seat && !a.warp} h={Math.max(26, cellPx * 2)} flip={a.face === 1} style={{ position: "static" }} />
          </button>
        );})}
        {agents.flatMap(a => (a.subs || []).map(s => {
          const sa = ACTS[s.act] || ACTS.running;
          return (
          <div key={s.id} className={`rc-subagent ${sa.cls}`} title={`sub-agent · ${sa.th}`}
            style={{ left: pc(a.cx + 0.5 + s.dx, room.w), top: pc(a.cy + 0.62 + s.dy, room.h), zIndex: 9 + a.cy }}>
            <span className="rc-sub-tag">sub</span><span className="rc-sub-act">{sa.icon}</span>
            <span className="rc-agent-shadow" />
            <CharacterSprite charId={a.char.characterId} walking={false} h={Math.max(18, cellPx * 1.35)} style={{ position: "static" }} />
          </div>
        );}))}
      </div>
    </div>
  );
}

/* ---------------- build palette ---------------- */
function ItemPreview({ kind }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = FURN[kind]; if (!d || !ref.current) return;
    const cell = 16, cv = ref.current; cv.width = d.w * cell; cv.height = d.h * cell;
    const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, cv.width, cv.height);
    drawObject(ctx, { key: kind, x: 0, y: 0, rot: 0 }, cell);
  }, [kind]);
  return <canvas ref={ref} className="item-prev" />;
}
function BuildPalette({ tool, setTool, canPlace = true, canMove = true }) {
  const [cat, setCat] = useState("floor");
  const items = Object.keys(FURN).filter(k => FURN[k].cat === cat);
  const pick = (t) => {
    if ((t.type === "floor" || t.type === "struct" || t.type === "object") && !canPlace) return;
    if (t.type === "erase" && !canMove) return;
    setTool(prev => ({ ...prev, ...t }));
  };
  return (
    <div className="build-palette panel">
      <div className="bp-cats">
        {CATS.map(c => <button key={c.key} className={`bp-cat ${cat === c.key ? "on" : ""}`} onClick={() => setCat(c.key)}>{wt("cat." + c.key)}</button>)}
      </div>
      {(!canPlace || !canMove) && (
        <div className="bp-lock mono">🔒 {!canPlace && wt("world.lockPlace")}{!canPlace && !canMove && " · "}{!canMove && wt("world.lockMove")}</div>
      )}
      <div className="bp-body">
        {cat === "floor" && (
          <div className="bp-grid">
            {FLOOR_TYPES.map(f => (
              <button key={f.v} disabled={!canPlace} className={`bp-item ${tool.type === "floor" && tool.floor === f.v ? "on" : ""}`} onClick={() => pick({ type: "floor", floor: f.v })}>
                <span className="bp-swatch" style={{ background: f.swatch }} /><span className="bp-label">{wt("floor." + f.v)}</span>
              </button>
            ))}
            <button disabled={!canPlace} className={`bp-item ${tool.type === "floor" && tool.floor === 0 ? "on" : ""}`} onClick={() => pick({ type: "floor", floor: 0 })}>
              <span className="bp-swatch" style={{ background: "#0b0e14", border: "1px dashed var(--ink-4)" }} /><span className="bp-label">{wt("world.eraseFloor")}</span>
            </button>
          </div>
        )}
        {cat === "struct" && (
          <div className="bp-grid">
            <button disabled={!canPlace} className={`bp-item ${tool.type === "struct" && tool.struct === 1 ? "on" : ""}`} onClick={() => pick({ type: "struct", struct: 1 })}><span className="bp-swatch" style={{ background: PAL.wall }} /><span className="bp-label">{wt("world.wall")}</span></button>
            <button disabled={!canPlace} className={`bp-item ${tool.type === "struct" && tool.struct === 2 ? "on" : ""}`} onClick={() => pick({ type: "struct", struct: 2 })}><span className="bp-swatch" style={{ background: PAL.doorMat }} /><span className="bp-label">{wt("world.door")}</span></button>
            <button disabled={!canPlace} className={`bp-item ${tool.type === "struct" && tool.struct === 0 ? "on" : ""}`} onClick={() => pick({ type: "struct", struct: 0 })}><span className="bp-swatch" style={{ background: "transparent", border: "1px dashed var(--ink-4)" }} /><span className="bp-label">{wt("world.removeWall")}</span></button>
          </div>
        )}
        {!["floor", "struct"].includes(cat) && (
          <div className="bp-grid">
            {items.map(k => (
              <button key={k} disabled={!canPlace} className={`bp-item ${tool.type === "object" && tool.key === k ? "on" : ""}`} onClick={() => pick({ type: "object", key: k })}>
                <span className="bp-prevwrap"><ItemPreview kind={k} /></span><span className="bp-label">{wt("furn." + k)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bp-tools">
        <button className={`bp-tool ${tool.type === "erase" ? "on" : ""}`} disabled={!canMove} onClick={() => pick({ type: "erase" })}>{wt("world.toolErase")}</button>
        <button className="bp-tool" onClick={() => setTool(p => ({ ...p, rot: ((p.rot || 0) + 1) % 4 }))} disabled={tool.type !== "object" || !canPlace}>{wt("world.toolRotate")}</button>
      </div>
    </div>
  );
}

/* ---------------- room view (orchestrates canvas + palette) ---------------- */
function RoomView({ room, chars, onAgent, onExit, update, rename, can, onSpawn, onOpenDoc, canTemplate, onSaveTemplate }) {
  const [build, setBuild] = useState(false);
  const canBuild = !can || can("room.build");
  const canPlace = !can || can("room.place");
  const canMove  = !can || can("room.move");
  const canReset = !can || can("room.reset");
  const canRename = !can || can("room.delete");
  const canCreate = !can || can("agent.create");
  useEffect(() => { if (build && !canBuild) setBuild(false); }, [build, canBuild]);
  const [soundOn, setSoundOn] = useState(() => Sound.on);
  const toggleSound = () => { const v = !soundOn; setSoundOn(v); Sound.set(v); };
  const bodyRef = useRef(null); const [bw, setBw] = useState(900);
  useEffect(() => {
    if (!bodyRef.current) return;
    const ro = new ResizeObserver(es => setBw(es[0].contentRect.width));
    ro.observe(bodyRef.current); return () => ro.disconnect();
  }, []);
  const wide = bw >= 760;
  const [asideTab, setAsideTab] = useState("chat");
  const asideBottom = !build;                                  // view mode: dock aside at the bottom
  const availW = (build && wide) ? bw - 314 : bw;              // full width when aside is below
  const asidePeek = asideBottom ? 92 : 0;                      // small peek (tab bar) — canvas dominates, dock scrolls
  const maxH = (typeof window !== "undefined" ? window.innerHeight : 800) - 180 - asidePeek;
  const canvasMaxW = Math.max(220, Math.min(availW, maxH * room.w / room.h));
  const [tool, setTool] = useState({ type: "floor", floor: 1, struct: 1, key: null, rot: 0 });

  // ----- history (undo / redo) + reset to default -----
  const roomRef = useRef(room); roomRef.current = room;
  const updateRef = useRef(update); updateRef.current = update;
  const histRef = useRef({ past: [], future: [] });
  const [, bumpHist] = React.useReducer(x => x + 1, 0);
  useEffect(() => { histRef.current = { past: [], future: [] }; bumpHist(); }, [room.id]);
  const snapState = (r) => JSON.stringify([r.floor, r.struct, r.objects]);
  const snapshot = React.useCallback(() => { const r = roomRef.current; histRef.current.past.push(snapState(r)); if (histRef.current.past.length > 60) histRef.current.past.shift(); histRef.current.future = []; bumpHist(); }, []);
  const applySnap = (snap) => { const [floor, struct, objects] = JSON.parse(snap); updateRef.current(roomRef.current.id, r => ({ ...r, floor, struct, objects })); };
  const doUndo = React.useCallback(() => { const h = histRef.current; if (!h.past.length) return; h.future.push(snapState(roomRef.current)); applySnap(h.past.pop()); bumpHist(); }, []);
  const doRedo = React.useCallback(() => { const h = histRef.current; if (!h.future.length) return; h.past.push(snapState(roomRef.current)); applySnap(h.future.pop()); bumpHist(); }, []);
  const resetDefault = async () => { if (!(await uiConfirm({ title: wt("world.resetRoomTitle"), message: wt("world.resetRoomMsg"), danger: true }))) return; snapshot(); const blank = blankRoom(roomRef.current.name); updateRef.current(roomRef.current.id, r => ({ ...r, floor: blank.floor, struct: blank.struct, objects: [] })); };

  useEffect(() => {
    const onKey = (e) => {
      if (!build) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); doRedo(); return; }
      if (e.key === "r" || e.key === "R") setTool(p => ({ ...p, rot: ((p.rot || 0) + 1) % 4 }));
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [build, doUndo, doRedo]);

  const apply = (x, y, isDown) => {
    const w = room.w, i = idx(x, y, w);
    if (tool.type === "floor") update(room.id, r => { const f = r.floor.slice(); f[i] = tool.floor; return { ...r, floor: f }; });
    else if (tool.type === "struct") update(room.id, r => { const s = r.struct.slice(); s[i] = tool.struct; const f = r.floor.slice(); if (tool.struct === 2 && !f[i]) f[i] = 1; return { ...r, struct: s, floor: f }; });
    else if (tool.type === "erase") update(room.id, r => {
      const hit = (r.objects || []).filter(o => !FURN[o.key].floorDecor).reverse().find(o => objCells(o).some(([cx, cy]) => cx === x && cy === y))
        || (r.objects || []).find(o => objCells(o).some(([cx, cy]) => cx === x && cy === y));
      if (hit) return { ...r, objects: r.objects.filter(o => o !== hit) };
      if (r.struct[i]) { const s = r.struct.slice(); s[i] = 0; return { ...r, struct: s }; }
      const f = r.floor.slice(); f[i] = 0; return { ...r, floor: f };
    });
    else if (tool.type === "object" && isDown && tool.key) {
      const f = effFootprint(tool.key, tool.rot);
      update(room.id, r => {
        for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) {
          const cx = x + xx, cy = y + yy; if (cx < 0 || cy < 0 || cx >= r.w || cy >= r.h) return r;
          const ci = idx(cx, cy, r.w); if (!r.floor[ci] || r.struct[ci] === 1) return r;
          if ((r.objects || []).some(o => !FURN[o.key].floorDecor && objCells(o).some(([ox, oy]) => ox === cx && oy === cy))) return r;
        }
        return { ...r, objects: [...(r.objects || []), { key: tool.key, x, y, rot: tool.rot || 0 }] };
      });
    }
  };
  const applyEdit = (x, y, isDown) => {
    const t = tool.type;
    if ((t === "floor" || t === "struct" || t === "object") && !canPlace) return;
    if (t === "erase" && !canMove) return;
    if (isDown) snapshot();
    apply(x, y, isDown);
  };

  return (
    <div className="room-view fade-in">
      <div className="rv-topbar">
        <button className="btn btn-ghost btn-sm" onClick={onExit}>{wt("world.allRooms")}</button>
        <input className="rv-name" defaultValue={room.name} key={room.id} readOnly={!canRename}
          onBlur={e => { if (!canRename) { e.target.value = room.name; return; } const v = e.target.value.trim(); if (v && v !== room.name) rename(room.id, v); }} onKeyDown={e => e.key === "Enter" && e.target.blur()} />
        <span className="rv-spacer" />
        {build && (
          <div className="rv-actions">
            <button className="btn btn-ghost btn-sm btn-icon" onClick={doUndo} disabled={!histRef.current.past.length} title={wt("world.undoTitle")}>↶</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={doRedo} disabled={!histRef.current.future.length} title={wt("world.redoTitle")}>↷</button>
            <button className="btn btn-danger btn-sm" onClick={resetDefault} title={wt("world.resetTitle")} style={{ display: canReset ? "" : "none" }}>{wt("world.reset")}</button>
          </div>
        )}
        <button className={`btn btn-ghost btn-sm btn-icon ${soundOn ? "rv-sound-on" : ""}`} onClick={toggleSound} title={wt("world.soundTitle")}>{soundOn ? "🔔" : "🔕"}</button>
        {canCreate && <button className="btn btn-gold btn-sm" onClick={() => onSpawn && onSpawn()} title={wt("world.spawnTitle")}>{wt("world.spawnAgent")}</button>}
        <span className="live-badge"><span className="pulse-dot" />🎭 {chars.length}</span>
        {canTemplate && <button className="btn btn-ghost btn-sm" onClick={() => onSaveTemplate && onSaveTemplate()} title={wt("world.saveTplTitle")}>{wt("world.saveTpl")}</button>}
        {canBuild
          ? <button className={`btn btn-sm ${build ? "btn-gold" : "btn-ghost"}`} onClick={() => setBuild(b => !b)}>{build ? wt("world.buildDone") : wt("world.buildMode")}</button>
          : <span className="rv-nobuild mono" title={wt("world.viewOnlyTitle")}>{wt("world.viewOnly")}</span>}
      </div>
      {build && <div className="rv-hint mono">{(canPlace || canMove) ? wt("world.buildHint") : wt("world.viewHint")}</div>}
      <div className={`rv-body ${build ? "is-build" : "is-view"}`} ref={bodyRef}>
        <RoomCanvas room={room} build={build} tool={tool} setTool={setTool} apply={applyEdit} chars={chars} onAgent={onAgent} maxW={canvasMaxW} />
        {build && <BuildPalette tool={tool} setTool={setTool} canPlace={canPlace} canMove={canMove} />}
        {!build && <RoomAside room={room} roomChars={chars} onOpenDoc={onOpenDoc} tab={asideTab} setTab={setAsideTab} />}
      </div>
    </div>
  );
}

/* ---------------- full-page doc editor (TipTap, exec-command fallback) ---------------- */
let _tiptapP;
function loadTiptap() {
  if (!_tiptapP) _tiptapP = (async () => {
    const core = await import("https://esm.sh/@tiptap/core@2.11.5");
    const sk = await import("https://esm.sh/@tiptap/starter-kit@2.11.5");
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
    }).catch(() => { if (dead) return; if (faRef.current) faRef.current.innerHTML = initial; setMode("fallback"); });
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
      else if (faRef.current) { faRef.current.innerHTML = html; saveFallback(); }
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
    }).catch(() => { if (dead) return; if (faRef.current) faRef.current.innerHTML = initialHtml; setMode("fallback"); });
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

/* ---------------- OVERVIEW dashboard (per-room) ---------------- */
function OverviewTab({ rooms, chars, onOpen, query }) {
  const q = (query || "").trim().toLowerCase();
  const shown = rooms.map((r, i) => ({ r, i })).filter(({ r, i }) => {
    if (!q) return true;
    if (r.name.toLowerCase().includes(q)) return true;
    return roomAgents(r, i, rooms, chars).some(c => c.name.toLowerCase().includes(q));
  });
  return (
    <div className="ov-grid">
      {shown.map(({ r, i }) => {
        const members = roomAgents(r, i, rooms, chars);
        const active = members.filter(c => c.status === "on" || c.status === "busy").length;
        const tokens = members.reduce((s, c) => s + (c.mana || 0), 0);
        return (
          <div key={r.id} className="ov-card" onClick={() => onOpen(r.id)}>
            <div className="ov-head">
              <div className="ov-thumb"><RoomThumb room={r} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="ov-name">{r.name}</div>
                <div className="ov-stats mono">
                  <span>👥 {members.length}</span>
                  <span className="ov-active">🟢 {wt("world.ovActive", { n: active })}</span>
                  <span>🔵 {fmtTok(tokens)} token</span>
                </div>
              </div>
              <span className="ov-enter">{wt("world.enterRoom")}</span>
            </div>
            <div className="ov-agents">
              {members.length === 0 ? <div className="muted" style={{ fontSize: 12, padding: "6px 2px" }}>{wt("world.ovNoAgent")}</div> :
                members.slice(0, 5).map(c => {
                  const actKey = ((typeof ROLE_ACTS !== "undefined" && ROLE_ACTS[c.classKey]) || ["thinking"])[0];
                  const act = (typeof ACTS !== "undefined" && ACTS[actKey]) || { icon: "💭", th: "กำลังคิด" };
                  const quests = QUESTS.filter(q => q.party.includes(c.id) && q.status !== "done");
                  const left = quests.reduce((s, q) => s + Math.max(0, (q.steps || 0) - (q.stepDone || 0)), 0);
                  return (
                    <div key={c.id} className="ov-agent">
                      <span className="ov-dot" data-s={c.status} />
                      <span className="ov-aname">{c.name.split(" ")[0]}</span>
                      <span className="ov-act">{act.icon} {act.th}</span>
                      <span className="ov-task" title={c.task}>{c.task}</span>
                      <span className="ov-left mono">{left > 0 ? wt("world.ovLeft", { n: left }) : wt("world.ovIdle")}</span>
                    </div>
                  );
                })}
              {members.length > 5 && <div className="muted" style={{ fontSize: 11, paddingLeft: 2 }}>{wt("world.ovMore", { n: members.length - 5 })}</div>}
            </div>
          </div>
        );
      })}
      {shown.length === 0 && <div className="room-empty muted">{wt("world.ovNoMatch")}</div>}
    </div>
  );
}

/* ---------------- HERMES chat (full tab) ---------------- */
function HermesChat({ rooms, chars }) {
  const [msgs, setMsgs] = useState([{ who: "ai", text: "ผมคือ ระบบแชตรวมทุกห้องครับ — ถามได้ว่าแต่ละห้องทำอะไรถึงไหนแล้ว ใช้ token ไปเท่าไหร่ หรือใครอยู่ห้องไหน" }]);
  const [draft, setDraft] = useState(""); const [busy, setBusy] = useState(false);
  const sc = useRef(null);
  useEffect(() => { if (sc.current) sc.current.scrollTop = sc.current.scrollHeight; }, [msgs, busy]);
  const send = async (text) => {
    const t = (text ?? draft).trim(); if (!t || busy) return;
    setMsgs(m => [...m, { who: "me", text: t }]); setDraft(""); setBusy(true);
    let reply = "";
    try { if (window.claude && window.claude.complete) { const sys = ceoContext(rooms, chars); reply = await window.claude.complete(sys + "\n\nคำถาม: " + t); } } catch (e) { reply = ""; }
    if (!reply || !reply.trim()) reply = ceoReply(t, rooms, chars);
    setMsgs(m => [...m, { who: "ai", text: reply.trim() }]); setBusy(false);
  };
  const chips = ["สรุปภาพรวม", "ห้องไหนใช้ token เยอะ?", "ใครอยู่ห้องไหน?"];
  return (
    <div className="hermes-fulltab ornate">
      <div className="hermes-log-head">
        <span className="wchat-crest">👔</span>
        <div><div className="wchat-name">PiKaChat</div><div className="mono faint" style={{ fontSize: 10 }}>สรุปภาพรวมทุกห้อง</div></div>
        <FeatureTag kind="live" />
      </div>
      <div className="hermes-log-scroll" ref={sc}>
        {msgs.map((m, i) => <div key={i} className={`wbubble ${m.who}`}>{m.who === "ai" && <span className="wbubble-ic">⚜</span>}<span>{m.text}</span></div>)}
        {busy && <div className="wbubble ai"><span className="wbubble-ic">⚜</span><span className="typing-bubble" style={{ display: "inline-flex" }}><span /><span /><span /></span></div>}
      </div>
      <div className="wchat-chips">{chips.map(c => <button key={c} className="tag-sg" onClick={() => send(c)}>{c}</button>)}</div>
      <div className="hermes-inputbar hermes-inputbar--tab">
        <span className="hermes-crest-sm">👔</span>
        <input value={draft} onChange={e => setDraft(e.target.value)} onKeyDown={e => e.key === "Enter" && send()} placeholder="ถาม CEO เรื่องภาพรวม…" />
        <button className="hermes-send" onClick={() => send()}>ส่ง</button>
      </div>
    </div>
  );
}

/* ---------------- WORLD (tabs: rooms · overview · chat) ---------------- */
function World({ onAgent, S, can, t }) {
  _wt = (typeof t === "function") ? t : ((k) => k);
  const chars = S.chars;
  const canRoomCreate = !can || can("room.create");
  const canRoomDelete = !can || can("room.delete");
  const canTemplate = !can || can("room.template");
  const canManageOpts = !can || can("options.manage");
  const DEPT_LS = "guildos.depts.v1";
  const [depts, setDepts] = useState(() => { try { return JSON.parse(localStorage.getItem(DEPT_LS)) || ["ทั่วไป", "Engineering", "Marketing", "Research", "Design", "Operations"]; } catch (e) { return ["ทั่วไป", "Engineering", "Marketing", "Research", "Design", "Operations"]; } });
  const addDept = async () => { const r = await window.uiPrompt({ title: wt("world.addDeptTitle"), placeholder: wt("world.addDeptPh") }); const v = (r || "").trim(); if (!v) return; setDepts(prev => { const nx = prev.includes(v) ? prev : [...prev, v]; try { localStorage.setItem(DEPT_LS, JSON.stringify(nx)); } catch (e) { } return nx; }); setNDept(v); };
  const RM = useRooms();
  const TPL = useTemplates();
  const [tab, setTab] = useState("rooms");
  const [query, setQuery] = useState("");
  const [ovQuery, setOvQuery] = useState("");
  const [doc, setDoc] = useState(null);
  const [creating, setCreating] = useState(false);
  const [nName, setNName] = useState(""); const [nDept, setNDept] = useState(""); const [nCeo, setNCeo] = useState("CEO"); const [nTpl, setNTpl] = useState("");
  const [enteredId, setEnteredId] = useState(null);
  const room = enteredId ? RM.rooms.find(r => r.id === enteredId) : null;
  const roomIndex = room ? RM.rooms.findIndex(r => r.id === room.id) : -1;
  const roomChars = room ? roomAgents(room, roomIndex, RM.rooms, chars) : chars;
  useEffect(() => { if (enteredId && !room) setEnteredId(null); }, [enteredId, room]);
  useEffect(() => {
    const consume = () => { if (window.__pendingRoom) { const rid = window.__pendingRoom; window.__pendingRoom = null; setTab("rooms"); setEnteredId(rid); } };
    consume(); window.addEventListener("guildos-enter-room", consume);
    return () => window.removeEventListener("guildos-enter-room", consume);
  }, []);
  const openRoom = (id) => { setTab("rooms"); setEnteredId(id); };
  const enterRoom = (id) => { const rm = RM.rooms.find(r => r.id === id); const h = window.uiLoading && window.uiLoading({ title: wt("world.entering"), message: rm ? rm.name : "" }); setTimeout(() => { setEnteredId(id); h && h.close(); }, 760); };
  const createRoom = () => { if (canRoomCreate) { setNName("ห้องใหม่ " + (RM.rooms.length + 1)); setNDept(depts[0] || "ทั่วไป"); setNCeo("CEO"); setNTpl(""); setCreating(true); } };
  const createFromTpl = (tpl) => { if (!canRoomCreate) return; setNName((tpl.name || "ห้องใหม่") + " " + (RM.rooms.length + 1)); setNDept(tpl.dept || depts[0] || "ทั่วไป"); setNCeo("CEO"); setNTpl(tpl.id); setTab("rooms"); setCreating(true); };
  const submitRoom = () => { if (!nName.trim()) return; const tpl = nTpl ? TPL.templates.find(t => t.id === nTpl) : null; const extra = { dept: nDept.trim() || "ทั่วไป", ceo: "CEO" }; const id = tpl ? RM.createFromTemplate(nName.trim(), tpl, extra) : RM.create(nName.trim(), extra); setCreating(false); setEnteredId(id); };
  const saveRoomAsTemplate = async (room) => {
    if (!canTemplate) return;
    const name = await window.uiPrompt({ title: wt("world.saveTplPrompt.title"), message: wt("world.saveTplPrompt.msg"), placeholder: room.name, value: room.name });
    const v = (name || "").trim(); if (!v) return;
    TPL.add(templateFromRoom(room, v));
    try { window.uiAlert({ title: wt("world.savedTitle"), message: wt("world.savedMsg", { name: v }) }); } catch (e) { }
  };

  if (room) {
    return (
      <>
      <div className="content-pad fade-in world-screen" data-no-lex>
        <PageHead kicker={wt("world.kicker")} title={room.name} tag="live"
          desc={wt("world.roomDesc")}
          actions={<span className="live-badge"><span className="pulse-dot" />LIVE</span>} />
        <RoomView room={room} chars={roomChars} onAgent={onAgent} onExit={() => setEnteredId(null)} update={RM.update} rename={RM.rename} can={can}
          onSpawn={() => S.openBuilder && S.openBuilder({ homeRoom: room.id })} onOpenDoc={setDoc}
          canTemplate={canTemplate} onSaveTemplate={() => saveRoomAsTemplate(room)} />
      </div>
        {doc && <DocEditor docId={doc.id} title={doc.title} seed={doc.seed} onClose={() => setDoc(null)} />}
      </>
    );
  }

  return (
    <>
    <div className="content-pad fade-in world-screen" data-no-lex>
      <PageHead kicker={wt("world.kicker")} title={wt("world.lobbyTitle")} tag="live"
        desc={wt("world.lobbyDesc")}
        actions={<span className="live-badge"><span className="pulse-dot" />LIVE</span>} />

      <div className="world-tabs">
        <button className={`wtab ${tab === "rooms" ? "on" : ""}`} onClick={() => setTab("rooms")}>{wt("world.tab.rooms")}</button>
        <button className={`wtab ${tab === "templates" ? "on" : ""}`} onClick={() => setTab("templates")}>{wt("world.tab.templates")} ({TPL.templates.length})</button>
        <button className={`wtab ${tab === "overview" ? "on" : ""}`} onClick={() => setTab("overview")}>📊 Overview</button>
        <button className={`wtab ${tab === "chat" ? "on" : ""}`} onClick={() => setTab("chat")}>{wt("world.tab.chat")}</button>
      </div>

      {tab === "rooms" && (
        <>
          <div className="rooms-toolbar">
            <div className="room-search">
              <span className="rs-ic">🔍</span>
              <input value={query} onChange={e => setQuery(e.target.value)} placeholder={wt("world.searchRoom")} />
              {query && <button className="rs-clear" onClick={() => setQuery("")}>✕</button>}
            </div>
            {canRoomCreate && <Btn kind="gold" sm icon="＋" onClick={createRoom}>{wt("world.createRoom")}</Btn>}
          </div>
          <RoomPicker rooms={RM.rooms} chars={chars} onEnter={enterRoom} onCreate={createRoom} onRename={RM.rename} onDelete={RM.remove}
            canCreate={canRoomCreate} canDelete={canRoomDelete} query={query} />
        </>
      )}
      {tab === "overview" && (
        <>
          <div className="rooms-toolbar">
            <div className="room-search">
              <span className="rs-ic">🔍</span>
              <input value={ovQuery} onChange={e => setOvQuery(e.target.value)} placeholder={wt("world.searchOv")} />
              {ovQuery && <button className="rs-clear" onClick={() => setOvQuery("")}>✕</button>}
            </div>
          </div>
          <OverviewTab rooms={RM.rooms} chars={chars} onOpen={openRoom} query={ovQuery} />
        </>
      )}
      {tab === "templates" && (
        <TemplatesTab templates={TPL.templates} canCreate={canRoomCreate} canManage={canTemplate}
          onUse={createFromTpl} onRename={TPL.rename} onDelete={async (id, name) => { if (await window.uiConfirm({ title: wt("world.delTplTitle"), message: wt("world.delTplMsg", { name }), danger: true })) TPL.remove(id); }} />
      )}
      {tab === "chat" && <HermesChat rooms={RM.rooms} chars={chars} />}
      {creating && (
        <div className="drawer-overlay qedit-overlay" onClick={() => setCreating(false)}>
          <div className="qedit-modal" onClick={e => e.stopPropagation()}>
            <div className="qedit-head"><span style={{ fontSize: 18 }}>🏠</span><h2>{wt("world.create.title")}</h2><button className="drawer-close" style={{ marginLeft: "auto" }} onClick={() => setCreating(false)}>✕</button></div>
            <div className="qedit-body">
              <div className="bf"><label className="bf-label">{wt("world.f.roomName")}</label><input className="bf-input" value={nName} onChange={e => setNName(e.target.value)} placeholder={wt("world.f.roomNamePh")} /></div>
              <div className="bf"><label className="bf-label">{wt("world.f.startFrom")}</label>
                <Select block value={nTpl} onChange={setNTpl}
                  options={[{ value: "", label: wt("world.tplBlank") },
                    ...TPL.templates.map(t => ({ value: t.id, label: wt("world.tplOpt", { name: t.name }) }))]} />
                <div className="qei-note">{wt("world.tplNote")}</div>
              </div>
              <div className="bf"><label className="bf-label">{wt("world.f.dept")}</label>
                <div style={{ display: "flex", gap: 8 }}>
                  <Select value={nDept} onChange={setNDept} style={{ flex: 1 }} block
                    options={depts.map(d => ({ value: d, label: d }))} />
                  {canManageOpts && <Btn kind="ghost" sm icon="➕" onClick={addDept}>{wt("world.addDept")}</Btn>}
                </div>
                {!canManageOpts && <div className="qei-note">{wt("world.deptPermNote")}</div>}
              </div>
              <div className="bf"><label className="bf-label">{wt("world.f.ceo")}</label>
                <div className="bf-input prio-locked" style={{ display: "flex", alignItems: "center", gap: 8 }}>👔 Agent CEO <span className="qbadge" style={{ marginLeft: "auto" }}>{wt("world.ceoFixed")}</span></div>
                <div className="qei-note">{wt("world.ceoNote")}</div></div>
            </div>
            <div className="qedit-foot">
              <Btn kind="ghost" onClick={() => setCreating(false)}>{wt("common.cancel")}</Btn>
              <Btn kind="gold" icon="✓" style={{ opacity: (nName.trim() && nCeo.trim()) ? 1 : .5, pointerEvents: (nName.trim() && nCeo.trim()) ? "auto" : "none" }} onClick={submitRoom}>{wt("world.createBtn")}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
      {doc && <DocEditor docId={doc.id} title={doc.title} seed={doc.seed} onClose={() => setDoc(null)} />}
    </>
  );
}

Object.assign(window, { World, HermesChat, OverviewTab, RoomPicker, RoomView, RoomCanvas, BuildPalette });
// publish shared graphics components so window-guarded usages keep working across modules
window.CharacterSprite = CharacterSprite;
window.DocEditor = DocEditor;
window.RichBody = RichBody;

export {
  BuildPalette,
  CharacterSprite,
  DOC_SEED,
  DocEditor,
  RichBody,
  EXPORT_TYPES,
  HermesChat,
  ItemPreview,
  OverviewTab,
  PERAGENT_FILES,
  RoomAside,
  RoomCanvas,
  RoomChat,
  RoomExports,
  RoomInfo,
  RoomPicker,
  RoomSessions,
  RoomThumb,
  RoomView,
  SHARED_FILES,
  TemplatesTab,
  World,
  _agentLine,
  _tiptapP,
  ceoContext,
  ceoReply,
  downloadExport,
  exportSeed,
  exportTimeLabel,
  genExportContent,
  loadExports,
  loadSessions,
  loadTiptap,
  roomReply,
  saveExports,
  saveSessions,
  sessionTime,
  useLivingAgents
};
