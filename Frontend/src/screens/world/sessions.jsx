/* PiKaOs — room "work sessions" panel + helpers. */
import React from 'react';
const { useState, useEffect } = React;
import { wt } from './wt.js';

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

export { loadSessions, saveSessions, sessionTime, RoomSessions };
