/* PiKaOs — ES module (migrated from PiKaOs/screens-me.jsx). */
import React from 'react';
const { useState } = React;
import { ActivityRow, Btn, Empty, Meter, Panel, QuestCard, RankGem, StatusBadge } from '../components/components.jsx';
import { PERMISSIONS, fmtTok, roleByKey, usagePct } from '../data/data-users.jsx';
import { ACTIVITY, QUESTS, byId } from '../data/data.jsx';
import { RoleBadge } from './screens-admin.jsx';
import { Recall } from './screens-extra.jsx';
import { CharacterSprite, World } from './screens-world.jsx';

/* ============================================================
   MY DASHBOARD (/me) — the signed-in user's personal workspace:
   greeting, key metrics, today's focus quest (interactive),
   my quests (filterable), my agents, token budget, activity, access.
   Bilingual via Sys.T · marked data-no-lex (uses explicit T()).
   ============================================================ */

/* Bilingual step checklists for the featured quests. Falls back to
   generic numbered steps for any quest without a hand-written list. */
const QUEST_STEPS = {
  q1042: [
    { th: "ออกแบบสคีมา token (rotating refresh)", en: "Design token schema (rotating refresh)" },
    { th: "ตั้งค่า OAuth2 provider",              en: "Configure OAuth2 provider" },
    { th: "สร้าง endpoint /token",                en: "Build /token endpoint" },
    { th: "เพิ่ม refresh rotation อายุ 7 วัน",     en: "Add 7-day refresh rotation" },
    { th: "เขียน integration test",               en: "Write integration tests" },
    { th: "ร่างเอกสาร API",                       en: "Draft API documentation" },
    { th: "ตรวจความปลอดภัยก่อนปล่อย",            en: "Security review before release" },
  ],
  q1043: [
    { th: "รวบรวม dataset ฐานความรู้",     en: "Assemble knowledge dataset" },
    { th: "ตั้งค่า vector index (HNSW)",   en: "Set up vector index (HNSW)" },
    { th: "ทดลอง hybrid search",          en: "Prototype hybrid search" },
    { th: "เพิ่ม reranking layer",         en: "Add reranking layer" },
    { th: "วัดผล recall@k",                en: "Measure recall@k" },
    { th: "สรุปผลการทดลอง",                en: "Write up findings" },
  ],
};

function deadlineUrgency(q) {
  // smaller = more urgent. parse "เหลือ N ชม." else push to back
  const m = /(\d+)\s*ชม/.exec(q.deadline || "");
  if (m) return parseInt(m[1], 10);
  if (q.status === "review") return 1000;
  return 2000;
}

/* ---- one metric card with optional sparkline ---- */
function Metric({ icon, label, value, unit, foot, footTone, spark, hotFrom }) {
  return (
    <div className="me-metric">
      <div className="mm-head">
        <span className="mm-label">{label}</span>
        <span className="mm-ico">{icon}</span>
      </div>
      <div className="mm-value">{value}{unit && <span className="mm-unit">{unit}</span>}</div>
      {spark
        ? <div className="mm-spark">{spark.map((v, i) => {
            const max = Math.max(...spark) || 1;
            return <i key={i} className={hotFrom != null && i >= hotFrom ? "hot" : ""} style={{ height: `${Math.max(12, Math.round(v / max * 100))}%` }} />;
          })}</div>
        : null}
      {foot && <div className={`mm-foot ${footTone || ""}`}>{foot}</div>}
    </div>
  );
}

/* ---- today's focus: the most urgent active quest, with a live checklist ---- */
function AccessPanel({ me, can, Sys, T }) {
  const [open, setOpen] = useState(false);
  const granted = PERMISSIONS.filter(p => can(p.key));
  const shown = open ? granted : granted.slice(0, 6);
  return (
    <Panel title={T("My access", "สิทธิ์ของฉัน")} en="ACCESS" icon="🔑">
      <div className="me-role-row">
        <RoleBadge roleKey={me.role} roles={Sys.roles} T={T} />
        <span className="muted" style={{ fontSize: 12 }}>{T(roleByKey(Sys.roles, me.role).en, roleByKey(Sys.roles, me.role).th)}</span>
      </div>
      <div className="col" style={{ gap: 5 }}>
        {shown.map(p => <div key={p.key} className="access-line"><span className="access-tick">✓</span>{T(p.en, p.th)}</div>)}
        {granted.length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>{T("Read-only access", "สิทธิ์อ่านอย่างเดียว")}</div>}
        {granted.length > 6 && <button type="button" className="access-more" onClick={() => setOpen(o => !o)}>{open ? ("▾ " + T("Show less", "ย่อ")) : ("▸ +" + (granted.length - 6) + " " + T("more", "สิทธิ์เพิ่มเติม"))}</button>}
      </div>
    </Panel>
  );
}

function FocusQuest({ q, T, onOpen }) {
  const defs = QUEST_STEPS[q.id] || Array.from({ length: q.steps }, (_, i) => ({ th: `ขั้นตอนที่ ${i + 1}`, en: `Step ${i + 1}` }));
  const [done, setDone] = useState(() => defs.map((_, i) => i < q.stepDone));
  const doneCount = done.filter(Boolean).length;
  const prog = Math.round(doneCount / defs.length * 100);
  const party = q.party.map(byId).filter(Boolean);
  const lead = byId(q.lead);
  const toggle = (i) => setDone(d => d.map((v, j) => j === i ? !v : v));

  return (
    <div className="focus-quest fade-in">
      <div className="fq-banner"><span className="fq-pulse" />{T("Today's focus", "งานที่ต้องโฟกัสวันนี้")}</div>
      <div className="fq-body">
        <div className="fq-top">
          <RankGem r={q.rank} />
          <div className="fq-title">{q.title}</div>
          <span className="fq-deadline">⏳ {q.deadline}</span>
        </div>
        <div className="fq-desc">{q.desc}</div>
        <div className="fq-progress-row">
          <Meter kind="xp" val={prog} />
          <span className="fq-progress-num">{doneCount}/{defs.length} {T("steps", "ขั้น")} · {prog}%</span>
        </div>

        <div className="fq-steps">
          {defs.map((s, i) => (
            <button key={i} className={`fq-step ${done[i] ? "done" : ""}`} onClick={() => toggle(i)}>
              <span className="fq-check">✓</span>
              <span className="fq-step-label">{T(s.en, s.th)}</span>
              <span className="fq-step-n">{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>

        <div className="fq-foot">
          <div className="fq-party">
            {party.map((p, i) => (
              <span key={p.id} className="fq-party-av" style={{ marginLeft: i ? -8 : 0, zIndex: 9 - i }} title={p.name}>{p.icon}</span>
            ))}
          </div>
          {lead && <span className="muted" style={{ fontSize: 12 }}>{T("Lead", "นำโดย")} · {lead.name.split(" ")[0]}</span>}
          <span className="fq-reward" style={{ marginLeft: "auto" }}>◈ <b>{q.reward.toLocaleString()}</b></span>
          <Btn kind="gold" sm onClick={onOpen}>{T("Open quest", "เปิดเควส")}</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---- token budget rail: usage ring + split + by-agent breakdown ---- */
function BudgetPanel({ me, myAgents, T }) {
  const pct = usagePct(me);
  const remaining = me.quota == null ? null : Math.max(0, me.quota - me.used);
  const ringColor = me.quota == null ? "var(--emerald)" : pct >= 90 ? "var(--crimson)" : pct >= 70 ? "var(--gold)" : "var(--emerald)";
  const periodTh = { weekly: "สัปดาห์นี้", monthly: "เดือนนี้", daily: "วันนี้" }[me.period] || me.period;
  const periodEn = { weekly: "this week", monthly: "this month", daily: "today" }[me.period] || me.period;

  // distribute usage across my agents, weighted by their mana draw
  const totalMana = myAgents.reduce((s, a) => s + a.mana, 0) || 1;
  const shares = myAgents.map(a => ({ a, tok: Math.round(me.used * a.mana / totalMana) }))
    .sort((x, y) => y.tok - x.tok);
  const maxShare = Math.max(...shares.map(s => s.tok), 1);

  // rough daily burn → projected runway
  const dailyBurn = Math.round(me.used / 5);
  const daysLeft = remaining == null ? null : (dailyBurn ? Math.floor(remaining / dailyBurn) : 99);

  return (
    <Panel title={T("Token budget", "งบโทเคน")} en="BUDGET" icon="🔵">
      {me.quota == null ? (
        <div className="muted" style={{ fontSize: 13, padding: "6px 0" }}>{T("Your account has no token limit.", "บัญชีของคุณไม่จำกัดโทเคน")}</div>
      ) : (
        <>
          <div className="budget-ring-wrap">
            <div className="budget-ring" style={{ background: `conic-gradient(${ringColor} ${pct * 3.6}deg, var(--bg-4) 0deg)` }}>
              <div className="br-inner">
                <div className="br-pct" style={{ color: pct >= 90 ? "var(--crimson)" : "var(--ink)" }}>{pct}%</div>
                <div className="br-cap">{T("used", "ใช้แล้ว")}</div>
              </div>
            </div>
            <div className="budget-meta">
              <div className="bm-row"><span className="bm-k">{T("Used", "ใช้ไป")}</span><span className="bm-v">{fmtTok(me.used)}</span></div>
              <div className="bm-row"><span className="bm-k">{T("Quota", "โควตา")}</span><span className="bm-v">{fmtTok(me.quota)}</span></div>
              <div className="bm-row"><span className="bm-k">{T("Remaining", "คงเหลือ")}</span><span className={`bm-v ${pct >= 90 ? "crit" : ""}`}>{fmtTok(remaining)}</span></div>
            </div>
          </div>

          <div className="budget-split">
            <div className="bs-cell">
              <div className="bs-k">{T("Daily burn", "เผาผลาญ/วัน")}</div>
              <div className="bs-v">{fmtTok(dailyBurn)} <small>token</small></div>
            </div>
            <div className="bs-cell">
              <div className="bs-k">{T("Runway", "พอใช้อีก")}</div>
              <div className="bs-v">{daysLeft} <small>{T("days", "วัน")}</small></div>
            </div>
          </div>

          <div className="bm-row" style={{ marginTop: 4 }}>
            <span className="mono faint" style={{ fontSize: 11 }}>{T("resets", "รีเซ็ต")} · {T(periodEn, periodTh)}</span>
            <span className="mono faint" style={{ fontSize: 11 }}>{fmtTok(remaining)} {T("left", "เหลือ")}</span>
          </div>

          {pct >= 90 && <div className="quota-warn" data-no-lex>⚠ {T("You're near your quota — large jobs may be blocked.", "ใกล้เต็มโควตา — งานใหญ่อาจถูกระงับ")}</div>}
        </>
      )}

      {myAgents.length > 0 && (
        <div className="by-agent">
          <div className="ba-cap">{T("By agent", "แยกตาม Agent")}</div>
          {shares.map(({ a, tok }) => (
            <div className="ba-row" key={a.id}>
              <span className="ba-ico">{a.icon}</span>
              <span className="ba-name">{a.name.split(" ")[0]}</span>
              <span className="ba-bar"><i style={{ width: `${Math.round(tok / maxShare * 100)}%` }} /></span>
              <span className="ba-val">{fmtTok(tok)}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

function MyDashboard({ Sys, onAgent, onQuest }) {
  const { me, T, can } = Sys;
  const allChars = window.__chars || [];
  const myAgents = allChars; // agents are shared across the system — show all
  const myAgentIds = new Set(myAgents.map(a => a.id));
  const myQuests = QUESTS.filter(q => myAgentIds.has(q.lead));
  const activeQuests = myQuests.filter(q => q.status === "active" || q.status === "review");
  const doneThisWeek = myQuests.filter(q => q.status === "done").length;
  const onlineAgents = myAgents.filter(a => a.status === "on" || a.status === "busy").length;
  const avgSuccess = myAgents.length ? Math.round(myAgents.reduce((s, a) => s + a.success, 0) / myAgents.length) : 0;
  const pct = usagePct(me);
  const remaining = me.quota == null ? null : Math.max(0, me.quota - me.used);
  const myActivity = ACTIVITY.filter(ev => myAgentIds.has(ev.who)).slice(0, 5);

  // pick today's focus quest (most urgent active), and a quest-filter tab
  const focus = activeQuests.slice().sort((a, b) => deadlineUrgency(a) - deadlineUrgency(b))[0] || null;
  const [qtab, setQtab] = useState("active");
  const QTABS = [
    { k: "active", th: "กำลังทำ", en: "Active" },
    { k: "review", th: "รอตรวจ", en: "Review" },
    { k: "done", th: "เสร็จแล้ว", en: "Done" },
    { k: "all", th: "ทั้งหมด", en: "All" },
  ];
  const listQuests = (qtab === "all" ? myQuests : myQuests.filter(q => q.status === qtab))
    .filter(q => !focus || q.id !== focus.id);

  // greeting + date
  const now = new Date();
  const hour = now.getHours();
  const greet = hour < 12 ? T("Good morning", "สวัสดีตอนเช้า") : hour < 17 ? T("Good afternoon", "สวัสดีตอนบ่าย") : T("Good evening", "สวัสดีตอนค่ำ");
  const firstName = me.display.split(" ")[0];
  const dayTh = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"][now.getDay()];
  const monTh = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."][now.getMonth()];
  const dateStr = T(
    now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }),
    `วัน${dayTh} ${now.getDate()} ${monTh} ${now.getFullYear() + 543}`
  );

  // mock 7-day token spend (Mon→Sun), last two bars = today-ish (hot)
  const dailySpend = [42, 55, 38, 61, 47, 35, 20];

  return (
    <div className="content-pad fade-in">
      {/* greeting hero */}
      <div className="me-hero">
        <div className="me-hero-av">{me.avatar || "🧙"}</div>
        <div className="me-hero-main">
          <div className="me-greet-row">
            <h2 className="me-greet">{greet}, {firstName}</h2>
          </div>
          <div className="me-date">{dateStr}</div>
          <div className="me-summary">
            <span className="me-chip"><span className="me-chip-dot" /><b>{onlineAgents}/{myAgents.length}</b> {T("agents (system)", "Agent ทั้งระบบ")}</span>
            <span className="me-chip">📜 <b>{activeQuests.length}</b> {T("tasks due today", "งานที่ค้างวันนี้")}</span>
            <span className="me-chip">🔵 {T("remaining tokens", "จำนวนโทเคนคงเหลือ")} <b>{me.quota == null ? "∞" : `${pct}%`}</b></span>
          </div>
        </div>
        <div className="me-hero-actions">
          <Btn kind="ghost" sm icon="🌍" onClick={() => Sys.go("world")}>{T("Workspace", "แผนผังการทำงาน")}</Btn>
        </div>
      </div>

      {/* metric row */}
      <div className="me-metrics stagger">
        <Metric icon="🎭" label={T("All agents", "เอเจนต์ทั้งหมด")} value={`${onlineAgents}/${myAgents.length}`}
          foot={onlineAgents ? T("working now", "กำลังทำงาน") : T("all idle", "ว่างทั้งหมด")} footTone={onlineAgents ? "up" : ""} />
        <Metric icon="📜" label={T("Active quests", "งานที่กำลังทำ")} value={activeQuests.length} unit={T("open", "งาน")}
          foot={`${doneThisWeek} ${T("done this week", "เสร็จสัปดาห์นี้")}`} footTone="up" />
        <Metric icon="🔵" label={T("Tokens used", "โทเคนที่ใช้")} value={fmtTok(me.used)} unit="token"
          spark={dailySpend} hotFrom={5}
          foot={me.quota ? `${pct}% ${T("of quota", "ของโควตา")}` : T("unlimited", "ไม่จำกัด")} footTone={pct >= 90 ? "down" : "warn"} />
        <Metric icon="🏆" label={T("Avg success", "อัตราสำเร็จเฉลี่ย")} value={avgSuccess} unit="%"
          foot={T("across your agents", "เฉลี่ยทีมของคุณ")} footTone="up" />
      </div>

      {/* main grid */}
      <div className="me-grid">
        <div className="col" style={{ gap: 18, minWidth: 0 }}>
          {focus
            ? <FocusQuest q={focus} T={T} onOpen={() => onQuest(focus)} />
            : <Panel title={T("Today's focus", "งานที่ต้องโฟกัสวันนี้")} icon="📌">
                <Empty icon="📜" title={T("No active quests", "ยังไม่มีงานที่กำลังทำ")} sub={T("Assign a quest to one of your agents", "มอบหมายงานให้ Agent ของคุณ")} />
              </Panel>}

          <Panel title={T("My quests", "งานของฉัน")} en="MY QUESTS" icon="📜"
            right={<div className="tabs">{QTABS.map(t => (
              <button key={t.k} className={`tab ${qtab === t.k ? "active" : ""}`} onClick={() => setQtab(t.k)}>{T(t.en, t.th)}</button>
            ))}</div>}>
            {listQuests.length === 0
              ? <Empty icon="📜" title={T("Nothing here", "ไม่มีงานในหมวดนี้")} sub={T("Try another tab", "ลองดูแท็บอื่น")} />
              : <div className="list-rows">{listQuests.map(q => <QuestCard key={q.id} q={q} onClick={() => onQuest(q)} />)}</div>}
          </Panel>

          <Panel title={T("All agents", "เอเจนต์ทั้งหมด")} en="ALL AGENTS" icon="🎭"
            right={<Btn kind="ghost" sm onClick={() => Sys.go("agents")}>{T("All agents →", "ดูทั้งหมด →")}</Btn>}>
            {myAgents.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎭</div>
                <div className="thai-serif" style={{ fontSize: 16, color: "var(--ink-2)" }}>{T("You don't own any agents yet", "คุณยังไม่มี Agent")}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>{T("Create your first agent — name, role, skills and rules", "สร้าง Agent ตัวแรก — ชื่อ หน้าที่ สกิล และกฎ")}</div>
                {can("agent.create") && <Btn kind="gold" icon="➕" onClick={() => Sys.openBuilder()}>{T("New agent", "สร้าง Agent")}</Btn>}
              </div>
            ) : (
              <div className="grid cols-2">{myAgents.map(a => (
                <button key={a.id} className="myagent-card" onClick={() => onAgent(a)}>
                  <span className="myagent-art"><CharacterSprite charId={a.characterId} walking={false} h={56} style={{ position: "static" }} /></span>
                  <span className="myagent-info">
                    <span className="myagent-name">{a.name}</span>
                    <span className="myagent-role mono">{a.role || a.position || ""}</span>
                    <span style={{ marginTop: 5 }}><StatusBadge s={a.status} /></span>
                  </span>
                </button>
              ))}</div>
            )}
          </Panel>
        </div>

        <div className="me-rail">
          <BudgetPanel me={me} myAgents={myAgents} T={T} />

          <Panel title={T("Quick actions", "ทางลัด")} en="ACTIONS" icon="⚡">
            <div className="qa-grid">
              {can("agent.create") && <button className="qa-btn" onClick={() => Sys.openBuilder()}><span className="qa-ico">➕</span>{T("New agent", "สร้าง Agent")}</button>}
              <button className="qa-btn" onClick={() => Sys.go("quests")}><span className="qa-ico">📜</span>{T("Quest board", "กระดานงาน")}</button>
              <button className="qa-btn" onClick={() => Sys.go("search")}><span className="qa-ico">🔍</span>{T("Recall", "ค้นความรู้")}</button>
              <button className="qa-btn" onClick={() => Sys.go("world")}><span className="qa-ico">💬</span>{T("World", "แผนผังการทำงาน")}</button>
            </div>
          </Panel>

          <Panel title={T("My activity", "ความเคลื่อนไหวของฉัน")} en="ACTIVITY" icon="✦"
            right={<Btn kind="ghost" sm onClick={() => Sys.go("stats")}>{T("All →", "ทั้งหมด →")}</Btn>}>
            {myActivity.length === 0
              ? <Empty icon="✦" title={T("No recent activity", "ยังไม่มีความเคลื่อนไหว")} />
              : myActivity.map((ev, i) => <ActivityRow key={i} ev={ev} />)}
          </Panel>

          <AccessPanel me={me} can={can} Sys={Sys} T={T} />
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { MyDashboard, FocusQuest, BudgetPanel, Metric });

export {
  AccessPanel,
  BudgetPanel,
  FocusQuest,
  Metric,
  MyDashboard,
  QUEST_STEPS,
  deadlineUrgency
};
