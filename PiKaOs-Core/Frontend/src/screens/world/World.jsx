/* PiKaOs — WORLD top-level screen (tabs: rooms · templates · overview · chat).
   Pick a room card → enter a Sims-style top-down room you can decorate.
   Guild agents wander and sit at chairs to feel alive. Layouts autosave to
   localStorage. Orchestrator/PiKaChat rides along. */
import React from 'react';
const { useState, useEffect } = React;
import { roomAgents } from '../../lib/characters.jsx';
import { Btn, PageHead } from '../../components/components.jsx';
import { Select } from '../../components/ui/Dropdown.jsx';
import { templateFromRoom, useRooms, useTemplates } from '../../lib/room-store.jsx';
import { wt, setWt } from './wt.js';
import { RoomView } from './build.jsx';
import { DocEditor } from '../../components/doc-editor.jsx';
import { RoomPicker, TemplatesTab, OverviewTab } from './lobby.jsx';
import { HermesChat } from './chat.jsx';

/* ---------------- WORLD (tabs: rooms · overview · chat) ---------------- */
function World({ onAgent, S, can, t }) {
  setWt(t);
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

export { World };
