/* PiKaOs — COUNCIL / MEETING: the live council chat with a party + agenda rail. */
import React from 'react';
import { Avatar, Empty, FeatureTag, HelpNote, PageHead, Panel } from '../../components/components.jsx';
import { LiveChat } from '../screens-main.jsx';
import { st, setSt } from './st.js';

/* ---------------- COUNCIL / MEETING ---------------- */
function Meeting({ S, t }) {
  setSt(t);
  const chars = S.chars;
  return (
    <div className="content-pad fade-in" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <PageHead kicker={st("meeting.kicker")} title={st("meeting.title")} tag="demo"
        desc={st("meeting.desc")} />
      <HelpNote tag="demo">{st("meeting.help")}</HelpNote>
      <div className="grid" style={{ gridTemplateColumns: "1fr 280px", gap: 18, flex: 1, minHeight: 0 }}>
        <Panel title={st("meeting.council")} en="COUNCIL" icon="💬" bodyPad={false}
          right={<FeatureTag kind="demo" />}
          className="col" >
          <div style={{ height: "calc(100vh - 280px)", display: "flex", flexDirection: "column" }}><LiveChat /></div>
        </Panel>
        <div className="col" style={{ gap: 16 }}>
          <Panel title={st("meeting.party")} en="PARTY" icon="🎭">
            {chars.length === 0 ? <Empty icon="🎭" title={st("meeting.noParty")} /> :
            <div className="list-rows">
              {chars.filter(a => a.status !== "idle").map(a => (
                <div key={a.id} className="row" style={{ gap: 10 }}>
                  <Avatar a={a} size="sm" /><div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name}</div>
                    <div className="mono faint" style={{ fontSize: 10 }}>{a.classEn}</div>
                  </div>
                </div>
              ))}
            </div>}
          </Panel>
          <Panel title={st("meeting.agenda")} en="AGENDA" icon="📌">
            <div className="col" style={{ gap: 10, fontSize: 13, color: "var(--ink-2)" }}>
              <div className="row" style={{ gap: 8 }}><span className="gem" style={{ width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" }} />{st("meeting.item1")}</div>
              <div className="row" style={{ gap: 8 }}><span className="gem" style={{ width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" }} />{st("meeting.item2")}</div>
              <div className="row" style={{ gap: 8 }}><span className="gem" style={{ width: 6, height: 6, background: "var(--gold)", transform: "rotate(45deg)" }} />{st("meeting.item3")}</div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export { Meeting };
