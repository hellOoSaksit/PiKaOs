/* PiKaOs — ES module (migrated from PiKaOs-Core/components.jsx). */
import React from 'react';
import { byId, statusLabel } from '../data/data.jsx';
import { CharacterSprite } from '../screens/screens-world.jsx';

/* ============================================================
   SHARED UI PRIMITIVES
   ============================================================ */

function Avatar({ a, size = "", showRing = true }) {
  if (!a) return null;
  const h = size === "lg" ? 60 : size === "sm" ? 30 : 42;
  const cls = ["avatar", "portrait", size, showRing ? a.status : ""].filter(Boolean).join(" ");
  return (
    <div className={cls} style={{ "--av": a.color }} title={a.name}>
      <CharacterSprite charId={a.characterId} seed={a.id || a.name} walking={false} h={h}
        style={{ position: "absolute", bottom: size === "sm" ? 1 : 2, left: "50%", transform: "translateX(-50%)" }} />
      {showRing && <span className="a-ring" />}
    </div>
  );
}

function RankGem({ r }) { return <span className={`rank ${r}`}>{r}</span>; }

function StatusBadge({ s }) {
  const map = { on: "on", busy: "busy", idle: "idle", away: "idle" };
  return <span className={`badge ${map[s] || "idle"}`}><span className="dot" />{statusLabel[s]}</span>;
}

function Meter({ kind = "mana", val }) {
  return <div className={`meter ${kind}`}><i style={{ width: `${val}%` }} /></div>;
}

function Panel({ title, en, icon, right, children, className = "", ornate = false, bodyPad = true }) {
  return (
    <section className={`panel ${ornate ? "ornate" : ""} ${className}`}>
      {title && (
        <div className="panel-head">
          {icon && <span className="ph-icon">{icon}</span>}
          <h3>{title}</h3>
          {en && <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{en}</span>}
          <span className="ph-spacer" />
          {right}
        </div>
      )}
      <div className={bodyPad ? "panel-body" : "panel-body no-pad"}>{children}</div>
    </section>
  );
}

function Btn({ kind = "gold", sm, icon, children, onClick, style, title }) {
  return (
    <button className={`btn btn-${kind} ${sm ? "btn-sm" : ""}`} onClick={onClick} style={style} title={title}>
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}

function StatTile({ label, value, unit, delta, deltaTone, icon }) {
  return (
    <div className="stat-tile">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="st-label">{label}</div>
        {icon && <span style={{ fontSize: 16, opacity: .8 }}>{icon}</span>}
      </div>
      <div className="st-value">{value}{unit && <span className="unit">{unit}</span>}</div>
      {delta && <div className={`st-delta ${deltaTone || ""}`}>{delta}</div>}
    </div>
  );
}

function Divider() { return <div className="divider"><span className="gem" /></div>; }

// Adventurer roster card
function AgentCard({ a, onClick, compact }) {
  return (
    <button className={`agent-card ${compact ? "compact" : ""}`} onClick={onClick}>
      <Avatar a={a} size={compact ? "sm" : ""} />
      <div className="ac-body">
        <div className="ac-top">
          <span className="ac-name">{a.name}</span>
          <RankGem r={a.rank} />
        </div>
        <div className="ac-role mono">{a.classEn} · {a.role}</div>
        {!compact && (
          <div className="ac-task">
            <span className="ac-task-dot" data-s={a.status} />
            <span className="muted" style={{ fontSize: 12.5 }}>{a.task}</span>
          </div>
        )}
        <div className="ac-meta">
          <StatusBadge s={a.status} />
          <span className="mono faint" style={{ fontSize: 10.5 }}>Lv.{a.level}</span>
          <span className="ac-mana mono"><i className="mana-orb" />{a.tokens}</span>
        </div>
      </div>
    </button>
  );
}

// Quest card
function QuestCard({ q, onClick }) {
  const lead = byId(q.lead);
  const party = q.party.map(byId).filter(Boolean);
  const statusMap = {
    active: { c: "busy", t: "กำลังลุย" }, queued: { c: "idle", t: "ในคิว" },
    review: { c: "info", t: "รอตรวจ" }, done: { c: "on", t: "สำเร็จ" }, failed: { c: "warn", t: "ล้มเหลว" },
  };
  const st = statusMap[q.status];
  return (
    <button className={`quest-card status-${q.status}`} onClick={onClick}>
      <div className="qc-left">
        <RankGem r={q.rank} />
      </div>
      <div className="qc-body">
        <div className="qc-top">
          <span className="qc-id mono">{q.id.toUpperCase()}</span>
          <span className={`badge ${st.c}`}><span className="dot" />{st.t}</span>
          <span className="qc-deadline mono faint">{q.deadline}</span>
        </div>
        <div className="qc-title">{q.title}</div>
        <div className="qc-progress-row">
          <Meter kind="xp" val={q.progress} />
          <span className="mono" style={{ fontSize: 11, color: "var(--ink-3)", minWidth: 70, textAlign: "right" }}>
            {q.stepDone}/{q.steps} ขั้น · {q.progress}%
          </span>
        </div>
        <div className="qc-foot">
          <div className="qc-party">
            {party.length === 0 && <span className="muted mono" style={{ fontSize: 11 }}>ยังไม่ได้มอบหมาย</span>}
            {party.map((p, i) => (
              <span key={p.id} className="qc-party-av" style={{ marginLeft: i ? -8 : 0, zIndex: 9 - i, overflow: "hidden" }} title={p.name}>{window.CharacterSprite ? <CharacterSprite charId={p.characterId} walking={false} h={24} style={{ position: "static" }} /> : p.icon}</span>
            ))}
            {lead && <span className="muted mono" style={{ fontSize: 11, marginLeft: 8 }}>นำโดย {lead.name.split(" ")[0]}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

// Activity feed row
function ActivityRow({ ev }) {
  const a = byId(ev.who);
  if (!a) return null;
  return (
    <div className="act-row">
      <span className="act-icon" data-tone={ev.tone}>{ev.icon}</span>
      <div className="act-body">
        <div style={{ fontSize: 13 }}><span className="gold-text" style={{ fontWeight: 600 }}>{a.name.split(" ")[0]}</span> <span className="muted">{ev.text}</span></div>
        <div className="mono faint" style={{ fontSize: 10.5 }}>{ev.time}ที่ผ่านมา</div>
      </div>
    </div>
  );
}

// Chat message
function ChatMessage({ m }) {
  if (m.kind === "system") {
    return (
      <div className="chat-sys">
        <span className="chat-sys-crest">⚜</span>
        <div className="chat-sys-body">
          <span className="chat-sys-name">{m.who}</span>
          <span className="muted" style={{ fontSize: 13 }}>{m.text}</span>
        </div>
        <span className="mono faint chat-time">{m.time}</span>
      </div>
    );
  }
  const a = byId(m.who);
  if (!a) return null;
  return (
    <div className="chat-msg">
      <Avatar a={a} size="sm" showRing={false} />
      <div className="chat-msg-body">
        <div className="chat-msg-head">
          <span className="chat-msg-name" style={{ color: a.color }}>{a.name}</span>
          <span className="badge" style={{ padding: "0 6px", fontSize: 9.5 }}>{a.classEn}</span>
          <span className="mono faint chat-time">{m.time}</span>
        </div>
        <div className="chat-bubble">{m.text}</div>
        {m.attach && <div className="chat-attach mono"><span>📎</span>{m.attach}</div>}
      </div>
    </div>
  );
}

function TypingDots({ a }) {
  return (
    <div className="chat-msg typing">
      <Avatar a={a} size="sm" showRing={false} />
      <div className="chat-msg-body">
        <div className="chat-msg-head"><span className="chat-msg-name" style={{ color: a.color }}>{a.name}</span></div>
        <div className="chat-bubble typing-bubble"><span /><span /><span /></div>
      </div>
    </div>
  );
}

// Empty state
function Empty({ icon = "🗺️", title, sub }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <div className="thai-serif" style={{ fontSize: 16, color: "var(--ink-2)" }}>{title}</div>
      {sub && <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// Page header inside content
function PageHead({ kicker, title, desc, actions, tag }) {
  return (
    <div className="page-head">
      <div>
        <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
          {kicker && <div className="kicker">{kicker}</div>}
          {tag && <FeatureTag kind={tag} />}
        </div>
        <h2 className="page-title">{title}</h2>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {actions && <div className="row" style={{ gap: 10 }}>{actions}</div>}
    </div>
  );
}

/* ---- Feature status tag: tells users plainly whether something is wired to AI ----
   live  = ต่อ AI จริง · มีผล
   local = บันทึกจริงในเครื่อง · มีผลกับระบบ (ไม่ใช่ AI)
   demo  = ตัวอย่างสาธิต · ยังไม่มีผลจริง */
const FEATURE_TAGS = {
  live:  { ic: "🟢", label: "ต่อ AI จริง · มีผล", cls: "ft-live", tip: "ส่วนนี้เชื่อมต่อกับ AI จริง — พิมพ์แล้วได้คำตอบจริง" },
  local: { ic: "💾", label: "บันทึกจริง · มีผล", cls: "ft-local", tip: "ข้อมูลถูกบันทึกจริงในเครื่องของคุณ มีผลต่อระบบจริง ( ยังไม่ได้ต่อ AI )" },
  demo:  { ic: "◌", label: "ตัวอย่างสาธิต · ยังไม่มีผล", cls: "ft-demo", tip: "ส่วนนี้เป็นตัวอย่างเพื่อแสดงหน้าตา ยังไม่ได้เชื่อมกับ AI จริง" },
};
function FeatureTag({ kind = "demo" }) {
  const t = FEATURE_TAGS[kind] || FEATURE_TAGS.demo;
  return <span className={`feature-tag ${t.cls}`} title={t.tip}><span className="ft-ic">{t.ic}</span>{t.label}</span>;
}

/* small inline help note explaining a command in plain Thai */
function HelpNote({ children, tag }) {
  return (
    <div className="help-note">
      <span className="help-note-ic">ⓘ</span>
      <span className="help-note-text">{children}</span>
      {tag && <FeatureTag kind={tag} />}
    </div>
  );
}

Object.assign(window, {
  Avatar, RankGem, StatusBadge, Meter, Panel, Btn, StatTile, Divider,
  AgentCard, QuestCard, ActivityRow, ChatMessage, TypingDots, Empty, PageHead,
  FeatureTag, HelpNote,
});

export {
  ActivityRow,
  AgentCard,
  Avatar,
  Btn,
  ChatMessage,
  Divider,
  Empty,
  FEATURE_TAGS,
  FeatureTag,
  HelpNote,
  Meter,
  PageHead,
  Panel,
  QuestCard,
  RankGem,
  StatTile,
  StatusBadge,
  TypingDots
};
