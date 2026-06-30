/* PiKaOs — AGENTS / ROSTER: the agent grid + empty state + create entry points. */
import React from 'react';
import { Btn, HelpNote, PageHead, Panel, StatusBadge } from '../../components/components.jsx';
import { CharacterSprite } from '../../components/CharacterSprite.jsx';

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

export { Agents };
