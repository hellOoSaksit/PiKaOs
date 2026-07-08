/* PiKaOs — ES module (migrated from PiKaOs-Core/components.jsx). */
import React from 'react';

/* ============================================================
   SHARED UI PRIMITIVES
   ============================================================ */

function RankGem({ r }) { return <span className={`rank ${r}`}>{r}</span>; }

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

/* `disabled` is forwarded — it used to be accepted and silently dropped, so every caller that wrote
   `disabled={busy}` still fired its onClick. `.btn:disabled` styling has existed all along, which is
   how the omission stayed invisible. `type="button"` because a bare <button> inside a <form> submits. */
function Btn({ kind = "gold", sm, icon, children, onClick, style, title, disabled }) {
  return (
    <button type="button" className={`btn btn-${kind} ${sm ? "btn-sm" : ""}`}
      onClick={onClick} style={style} title={title} disabled={disabled}>
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

// NOTE: TypingDots used to render an <Avatar> (backed by CharacterSprite); the
// game-component cluster (Avatar/AgentCard/QuestCard/ActivityRow/ChatMessage +
// CharacterSprite) was deleted as dead code once RBAC left Core. TypingDots is
// the one KEPT primitive that depended on it, so its avatar swatch is now a
// plain colored dot using the still-shared .avatar/.portrait/.sm classes.
function TypingDots({ a }) {
  return (
    <div className="chat-msg typing">
      <span className="avatar portrait sm" style={{ "--av": a.color }} />
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
  RankGem, Meter, Panel, Btn, StatTile, Divider,
  TypingDots, Empty, PageHead,
  FeatureTag, HelpNote,
});

export {
  Btn,
  Divider,
  Empty,
  FEATURE_TAGS,
  FeatureTag,
  HelpNote,
  Meter,
  PageHead,
  Panel,
  RankGem,
  StatTile,
  TypingDots
};
