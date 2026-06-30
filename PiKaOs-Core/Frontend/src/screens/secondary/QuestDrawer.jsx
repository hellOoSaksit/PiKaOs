/* PiKaOs — QUEST DRAWER: quest detail (steps checklist, assignees, tracking). */
import React from 'react';
import { Btn, RankGem, StatusBadge } from '../../components/components.jsx';
import { byId } from '../../data/data.jsx';
import { CharacterSprite } from '../../components/CharacterSprite.jsx';
import { st, setSt } from './st.js';

/* ---------------- QUEST DRAWER ---------------- */
function QuestDrawer({ q, onClose, onAgent, t }) {
  setSt(t);
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

export { QuestDrawer };
