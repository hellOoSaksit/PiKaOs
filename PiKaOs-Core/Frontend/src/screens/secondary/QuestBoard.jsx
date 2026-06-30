/* PiKaOs — QUEST BOARD: the task list (create/edit/finish/recall/soft-delete),
   plus TaskDetail (the two-tab brief/worklog doc viewer). */
import React from 'react';
const { useState, useRef } = React;
import { Btn, Empty, PageHead } from '../../components/components.jsx';
import { Select } from '../../components/ui/Dropdown.jsx';
import { DocEditor } from '../../components/doc-editor.jsx';
import { st, setSt } from './st.js';
import {
  loadWorks, saveWorks, taskTotal, taskStep, genUUID, genTaskCode,
  buildBriefMd, buildWorklogMd, enhanceWorklog, taskMdToHtml,
  worklogSeedFor, createRoomForTask,
} from './task-utils.js';

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
  setSt(t);
  const [filter, setFilter] = useState("all");
  const [showDone, setShowDone] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [openTask, setOpenTask] = useState(null);
  const [roomMode, setRoomMode] = useState("new");
  const [tplId, setTplId] = useState("");
  const [newRoomName, setNewRoomName] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [q2, setQ2] = useState("");
  const mayRun = !can || can("task.run");
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
      if (!aiDone) { try { const rm = rooms.find(r => r.id === w.roomId); window.pushNotify && window.pushNotify({ from: "ผู้ควบคุมกลาง · ระบบ", roomId: w.roomId, taskTitle: w.title, question: `งาน “${w.title}” ถูกปิดก่อน AI ทำเสร็จ (${step}/${total} ขั้นตอน) — ตรวจงานที่ค้าง หรือกด Recall เพื่อดึงกลับมาทำต่อได้` }); } catch (e) { } }
      h && h.close();
    }, 650);
  };
  const recallTask = (w) => {
    const total = taskTotal(w);
    const h = window.uiLoading && window.uiLoading({ title: st("qb.recalling"), message: w.title });
    setTimeout(() => {
      const nx = works.map(x => x.id === w.id ? { ...x, status: "active", step: Math.max(1, total - 3), doneTs: null, recalled: true } : x);
      setWorks(nx); saveWorks(nx);
      try { const rm = rooms.find(r => r.id === w.roomId); window.pushNotify && window.pushNotify({ from: "ผู้ควบคุมกลาง · ระบบ", roomId: w.roomId, taskTitle: w.title, question: `ดึงงาน “${w.title}” กลับเข้าคิวให้ AI ทำต่อแล้ว — สถานะกลับเป็น ‘กำลังลุย’` }); } catch (e) { }
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
    try { window.pushNotify && window.pushNotify({ from: "ผู้ควบคุมกลาง · ระบบ", roomId: rid, taskTitle: t, question: `สร้างงาน “${t}” และ${roomChoice.mode === "new" ? `ห้อง “${rmName}”` : "ผูกเข้าห้อง"}แล้ว — รหัส ${code} · ไฟล์ ${code}-brief.md / ${code}-worklog.md พร้อมห้องทำงานของ AI` }); } catch (e) { }
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

export { TaskDetail, QuestBoard };
