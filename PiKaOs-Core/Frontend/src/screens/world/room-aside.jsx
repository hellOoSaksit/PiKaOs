/* PiKaOs — room side panel: tab container (chat · info · sessions · files ·
   exports), the room info tab, and the shared/per-agent .md file lists. */
import React from 'react';
const { useState } = React;
import { Select } from '../../components/ui/Dropdown.jsx';
import { wt } from './wt.js';
import { DOC_SEED } from './doc.jsx';
import { RoomChat } from './chat.jsx';
import { RoomSessions } from './sessions.jsx';
import { RoomExports } from './exports.jsx';

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

export { SHARED_FILES, PERAGENT_FILES, RoomInfo, RoomAside };
