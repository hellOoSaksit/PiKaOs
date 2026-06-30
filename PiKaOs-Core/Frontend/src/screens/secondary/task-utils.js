/* PiKaOs — Quest Board task helpers: localStorage persistence, progress math,
   per-task UUID + room code, the two auto-generated .md docs (brief/worklog),
   a tiny Markdown→HTML renderer, and room creation bound to a task. */

/* ---------------- works storage + progress ---------------- */
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

## 🤖 แผนเริ่มต้นจาก ผู้ควบคุมกลาง
_ผู้ควบคุมกลาง กำลังวิเคราะห์งาน… จะเติมแผน/subtask ให้อัตโนมัติ_

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
    return md.replace(/_ผู้ควบคุมกลาง กำลังวิเคราะห์งาน…[^\n]*/, "- แตกงานเป็นขั้นตอนย่อย แล้วลงมือทีละขั้น ตรวจผลทุกขั้นก่อนไปต่อ");
  }
  const prompt = `คุณคือ ผู้ควบคุมกลาง ผู้ควบคุมระบบ AI multi-agent ช่วยวางแผนงานต่อไปนี้ให้ Agent ลงมือทำต่อได้ทันที ตอบเป็นภาษาไทย เป็น Markdown สั้นกระชับ ภายใต้หัวข้อย่อยเหล่านี้เท่านั้น:
**Subtask ที่ควรทำ:** (checkbox \`- [ ]\` 3–6 ข้อ เรียงตามลำดับ)
**ข้อควรระวัง:** (2–3 ข้อ)
**เกณฑ์ตรวจรับงาน:** (2–3 ข้อ)

ห้ามมีคำนำหรือคำลงท้ายอื่น · ชื่องาน: "${title}"`;
  try {
    const r = await Promise.race([
      window.claude.complete(prompt),
      new Promise((_, rej) => setTimeout(() => rej("timeout"), 14000)),
    ]);
    if (r && r.trim()) return md.replace(/_ผู้ควบคุมกลาง กำลังวิเคราะห์งาน…[^\n]*/, r.trim());
  } catch (e) { }
  return md.replace(/_ผู้ควบคุมกลาง กำลังวิเคราะห์งาน…[^\n]*/, "- แตกงานเป็นขั้นตอนย่อย แล้วลงมือทีละขั้น ตรวจผลทุกขั้นก่อนไปต่อ");
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
  return taskMdToHtml(buildWorklogMd(meta).replace(/_ผู้ควบคุมกลาง กำลังวิเคราะห์งาน…[^\n]*/, "- แตกงานเป็นขั้นตอนย่อย แล้วลงมือทีละขั้น ตรวจผลทุกขั้นก่อนไปต่อ"));
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

export {
  WORKS_LS, loadWorks, saveWorks, taskHash, taskTotal, taskStep,
  genUUID, genTaskCode, taskMetaBlock, buildBriefMd, buildWorklogMd,
  enhanceWorklog, taskMdToHtml, worklogSeedFor, createRoomForTask,
};
