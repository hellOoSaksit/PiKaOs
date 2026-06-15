/* PiKaOs — lobby views: room thumbnail, templates tab, room picker, and the
   per-room Overview dashboard. */
import React from 'react';
const { useEffect, useRef } = React;
import { roomAgents } from '../../lib/characters.jsx';
import { Btn } from '../../components/components.jsx';
import { fmtTok } from '../../data/data-users.jsx';
import { QUESTS } from '../../data/data.jsx';
import { drawRoom } from '../../lib/room-tiles.jsx';
import { ACTS, ROLE_ACTS } from '../../lib/world-life.jsx';
import { wt } from './wt.js';

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

export { RoomThumb, TemplatesTab, RoomPicker, OverviewTab };
