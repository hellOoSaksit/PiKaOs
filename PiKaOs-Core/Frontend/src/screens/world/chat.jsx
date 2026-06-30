/* PiKaOs — WORLD chat: CEO summary helpers, per-room chat, and the
   full-tab HERMES/PiKaChat. */
import React from 'react';
const { useState, useEffect, useRef } = React;
import { roomAgents } from '../../lib/characters.jsx';
import { FeatureTag } from '../../components/components.jsx';
import { TASKS } from '../../data/data.jsx';
import { ACTS, ROLE_ACTS } from '../../lib/world-life.jsx';

/* ---- CEO summary (combined chat) + per-room chat helpers ---- */
function _agentLine(c) {
  const actKey = ((typeof ROLE_ACTS !== "undefined" && ROLE_ACTS[c.roleKey]) || ["thinking"])[0];
  const act = (typeof ACTS !== "undefined" && ACTS[actKey]) || { th: "กำลังคิด" };
  const left = TASKS.filter(q => q.party.includes(c.id) && q.status !== "done").reduce((s, q) => s + Math.max(0, (q.steps || 0) - (q.stepDone || 0)), 0);
  return `${c.name.split(" ")[0]} (${act.th}${left ? `, เหลือ ${left} งาน` : ""})`;
}
function ceoContext(rooms, chars) {
  const lines = rooms.map((r, i) => {
    const mem = roomAgents(r, i, rooms, chars);
    const tok = mem.reduce((s, c) => s + (c.tokens || 0), 0);
    return `ห้อง ${r.name}: ${mem.length} คน, token ${tok}. ${mem.slice(0, 4).map(_agentLine).join("; ") || "ว่าง"}`;
  });
  return `คุณคือ CEO ของระบบ มีหน้าที่สรุปภาพรวมว่าแต่ละห้องทำอะไร ถึงไหนแล้ว ใช้ token เท่าไร ตอบไทยสั้นกระชับ.\n${lines.join("\n")}`;
}
function ceoReply(p, rooms, chars) {
  const q = p.toLowerCase();
  const busy = chars.filter(c => c.status === "busy" || c.status === "on").length;
  const tok = chars.reduce((s, c) => s + (c.tokens || 0), 0);
  if (/(token|โทเคน|ใช้ไป|ต้นทุน|งบ)/.test(q)) {
    const per = rooms.map((r, i) => `${r.name} ${roomAgents(r, i, rooms, chars).reduce((s, c) => s + (c.tokens || 0), 0)}`).join(" · ");
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

export { _agentLine, ceoContext, ceoReply, roomReply, RoomChat, HermesChat };
