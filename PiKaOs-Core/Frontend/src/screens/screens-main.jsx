/* PiKaOs — ES module (migrated from PiKaOs-Core/screens-main.jsx). */
import React from 'react';
const { useState, useEffect, useRef } = React;
import { ActivityRow, AgentCard, Btn, ChatMessage, FeatureTag, HelpNote, PageHead, Panel, QuestCard, StatTile, TypingDots } from '../components/components.jsx';
import { ACTIVITY, CHAT, ORG, TOKENS, TASKS, byId } from '../data/data.jsx';
import { CharacterSprite } from './screens-world.jsx';
import { randPos } from '../lib/store.jsx';

/* ============================================================
   MAIN SCREENS — Login, Guild Hall, shared LiveChat
   ============================================================ */

/* ---------------- LIVE CHAT (reused) ---------------- */
function LiveChat({ seed = CHAT, compact = false }) {
  const [msgs, setMsgs] = useState(seed);
  const [typing, setTyping] = useState(null);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, typing]);

  // simulate a live agent reply
  useEffect(() => {
    const replies = [
      { who: "a5", text: "test suite ผ่าน 142/146 — มี 4 เคสที่เกี่ยวกับ token expiry ขอให้ช่างดูอีกที" },
      { who: "a6", text: "พบงานวิจัยที่ชี้ว่า hybrid + rerank ดีกว่า ~14% บนชุดข้อมูลองค์กร จะสรุปเข้าคลังความรู้" },
      { who: "a4", text: "ปรับ diagram แล้ว เพิ่ม flow สำหรับ social login ตามที่อ้อยเสนอ" },
    ];
    let i = 0;
    const tick = () => {
      const r = replies[i % replies.length];
      if (!byId(r.who)) { i++; return; }   // skip if that adventurer isn't in the guild
      setTyping(byId(r.who));
      setTimeout(() => {
        setTyping(null);
        setMsgs((m) => [...m, { id: "live" + Date.now(), who: r.who, text: r.text, time: nowTime() }]);
        i++;
      }, 2200);
    };
    const iv = setInterval(tick, 9000);
    return () => clearInterval(iv);
  }, []);

  const send = () => {
    if (!draft.trim()) return;
    setMsgs((m) => [...m, { id: "u" + Date.now(), who: "ผู้ควบคุมกลาง", role: "master", kind: "system", text: draft, time: nowTime() }]);
    setDraft("");
  };

  return (
    <div className="chat-wrap">
      <div className="chat-scroll" ref={scrollRef}>
        {msgs.map((m) => <ChatMessage key={m.id} m={m} />)}
        {typing && <TypingDots a={typing} />}
      </div>
      <div className="chat-input">
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="สั่งการห้องประชุมกลางในนามผู้นำ…" />
        <Btn kind="gold" sm onClick={send}>ส่ง</Btn>
      </div>
    </div>
  );
}
function nowTime() { const d = new Date(); return `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`; }

/* ---------------- PIXEL FLOORPLAN (characters walk) ---------------- */
const FLOOR_ROOMS = [
  { th: "ห้องที่ประชุม", en: "COUNCIL", x: 5, y: 9, w: 43, h: 40 },
  { th: "คลังความรู้", en: "CODEX VAULT", x: 52, y: 8, w: 43, h: 36 },
  { th: "ลานฝึก", en: "TRAINING YARD", x: 6, y: 54, w: 40, h: 40 },
  { th: "โรงตีเหล็ก", en: "FORGE", x: 52, y: 50, w: 43, h: 44 },
];

function FloorMap({ chars, height = 220, big = false, onAgent }) {
  const [pos, setPos] = useState(() => Object.fromEntries(chars.map(c => [c.id, c.pos || randPos()])));

  // keep a position for every current character
  useEffect(() => {
    setPos(prev => {
      const next = { ...prev };
      chars.forEach(c => { if (!next[c.id]) next[c.id] = c.pos || randPos(); });
      Object.keys(next).forEach(id => { if (!chars.find(c => c.id === id)) delete next[id]; });
      return next;
    });
  }, [chars.map(c => c.id).join(",")]);

  // wander
  useEffect(() => {
    if (!chars.length) return;
    const iv = setInterval(() => {
      setPos(prev => {
        const c = chars[Math.floor(Math.random() * chars.length)];
        if (!c) return prev;
        const cur = prev[c.id] || randPos();
        return { ...prev, [c.id]: {
          x: Math.max(10, Math.min(90, cur.x + (Math.random() * 22 - 11))),
          y: Math.max(14, Math.min(86, cur.y + (Math.random() * 16 - 8))),
        } };
      });
    }, 2400);
    return () => clearInterval(iv);
  }, [chars.length]);

  return (
    <div className="worldmap" style={{ height }}>
      {FLOOR_ROOMS.map(r => (
        <div key={r.en} className="wm-room" style={{ left: r.x + "%", top: r.y + "%", width: r.w + "%", height: r.h + "%" }}>
          <span className="wm-label">{r.th} · {r.en}</span>
        </div>
      ))}
      {chars.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 30, opacity: .5 }}>🏰</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>ยังไม่มีเอเจนต์ — เพิ่มเอเจนต์เพื่อเริ่มงาน</div>
          </div>
        </div>
      )}
      {chars.map(c => {
        const p = pos[c.id] || c.pos || { x: 50, y: 50 };
        return (
          <button key={c.id} className="wm-token" onClick={() => onAgent && onAgent(c)}
            style={{ left: p.x + "%", top: p.y + "%", border: "none", background: "transparent", cursor: onAgent ? "pointer" : "default", padding: 0 }}>
            <CharacterSprite charId={c.characterId} seed={c.id} walking={false} h={big ? 52 : 42} style={{ position: "static" }} />
            <span className="wm-name" style={{ borderColor: c.color }}>{c.name.split(" ")[0]}{big ? " · " + (c.position || c.role || "") : ""}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ---------------- ALERTS (overview) ---------------- */
function AlertsPanel({ chars, go }) {
  const [dismissed, setDismissed] = useState([]);
  const usedPct = Math.round((TOKENS.cap - TOKENS.balance) / TOKENS.cap * 100);
  const base = [];
  if (usedPct >= 55) base.push({ id: "mana", sev: usedPct >= 80 ? "critical" : "warn", icon: "🔵",
    title: "โทเคนใกล้เต็มเพดาน", detail: `ใช้ไปแล้ว ${usedPct}% ของเพดานวันนี้ · เผา ${TOKENS.burnRate}/ชม.`, time: "เมื่อสักครู่", to: "mana" });
  const failed = TASKS.filter(q => q.status === "failed").length;
  if (failed) base.push({ id: "failed", sev: "critical", icon: "⚠️", title: "งานล้มเหลว",
    detail: `${failed} งานไม่สำเร็จ ต้องตรวจสอบ`, time: "5 นาที", to: "history" });
  const queued = TASKS.filter(q => q.status === "queued").length;
  if (queued) base.push({ id: "queued", sev: "warn", icon: "📜", title: "งานรอเริ่มงาน",
    detail: `${queued} งานอยู่ในคิว ยังไม่ได้มอบหมาย`, time: "12 นาที", to: "quests" });
  const review = TASKS.filter(q => q.status === "review").length;
  if (review) base.push({ id: "review", sev: "info", icon: "🔍", title: "รอตรวจผลงาน",
    detail: `${review} งานเสร็จแล้ว รอการตรวจรับ`, time: "20 นาที", to: "history" });
  const away = chars.filter(a => a.status === "away" || a.status === "idle").length;
  if (away) base.push({ id: "away", sev: "info", icon: "🎭", title: "เอเจนต์ไม่พร้อมรบ",
    detail: `${away} คนกำลังพักหรือไม่อยู่`, time: "30 นาที", to: "agents" });

  const alerts = base.filter(a => !dismissed.includes(a.id));
  const crit = alerts.filter(a => a.sev === "critical").length;
  return (
    <Panel title="การแจ้งเตือน" en="ALERTS" icon="🔔" bodyPad={false}
      right={alerts.length
        ? <span className={`alert-count ${crit ? "crit" : ""}`}>{alerts.length}</span>
        : <span className="mono faint" style={{ fontSize: 11 }}>ปกติ</span>}>
      <div className="alerts">
        {alerts.length === 0 && <div className="alert-empty">✓ ไม่มีการแจ้งเตือน — ระบบทำงานปกติ</div>}
        {alerts.map(a => (
          <div key={a.id} className={`alert-row alert-sev-${a.sev}`}>
            <span className="alert-ic">{a.icon}</span>
            <button className="alert-body" onClick={() => a.to && go(a.to)} style={{ cursor: a.to ? "pointer" : "default" }}>
              <div className="alert-title"><span className="alert-dot" />{a.title}</div>
              <div className="alert-detail">{a.detail}</div>
              <div className="mono faint alert-time">{a.time}</div>
            </button>
            <button className="alert-dismiss" title="ปิดการแจ้งเตือน" onClick={() => setDismissed(d => [...d, a.id])}>✕</button>
          </div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------- ORG HALL ---------------- */
function GuildHall({ onAgent, onQuest, go, S, can, t }) {
  const tx = t || ((k) => k);
  const chars = S.chars;
  const mayCreate = !can || can("agent.create");
  const online = chars.filter(a => a.status !== "away" && a.status !== "idle").length;
  const activeQuests = TASKS.filter(q => q.status === "active").length;
  return (
    <div className="content-pad fade-in" data-no-lex>
      <PageHead
        kicker={tx("hall.kicker")}
        title={tx("hall.title")}
        desc={tx("hall.desc")}
        actions={<><Btn kind="ghost" sm icon="📜" onClick={() => go("quests")}>{tx("hall.questBoard")}</Btn>{mayCreate && <Btn kind="gold" sm icon="➕" onClick={() => S.openBuilder()}>{tx("hall.createAgent")}</Btn>}</>}
      />
      <HelpNote tag="local"><b>{tx("hall.helpLabel")}</b> {tx("hall.help").replace(tx("hall.helpLabel"), "").trim()}</HelpNote>

      <div className="grid cols-4 stagger" style={{ marginBottom: 18 }}>
        <StatTile label={tx("hall.stat.activeWork")} value={activeQuests} unit={tx("common.unit.work")} icon="📜" />
        <StatTile label={tx("hall.stat.agentsActive")} value={`${online}/${chars.length}`} delta={chars.length ? tx("hall.delta.ready") : tx("hall.delta.noAgent")} icon="🎭" />
        <StatTile label={tx("hall.stat.tokensLeft")} value={(TOKENS.balance/1000).toFixed(1)} unit={tx("common.unit.ktoken")} icon="🔵" />
        <StatTile label={tx("hall.stat.avgSuccess")} value={chars.length ? Math.round(chars.reduce((s,c)=>s+(c.success||0),0)/chars.length) : 0} unit="%" icon="🏆" />
      </div>

      <div className="hall-grid">
        <div className="col" style={{ gap: 18 }}>
          <Panel title={tx("hall.questBoard")} en="ACTIVE TASKS" icon="📜"
            right={<Btn kind="ghost" sm onClick={() => go("quests")}>{tx("common.viewAll")}</Btn>}>
            <div className="list-rows">
              {TASKS.filter(q => q.status === "active" || q.status === "review").map(q => (
                <QuestCard key={q.id} q={q} onClick={() => onQuest(q)} />
              ))}
            </div>
          </Panel>

          <Panel title={tx("hall.panel.roster")} en="ROSTER" icon="🎭"
            right={<Btn kind="ghost" sm onClick={() => go("agents")}>{tx("common.viewAll")}</Btn>}>
            {chars.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">🎭</div>
                <div className="thai-serif" style={{ fontSize: 16, color: "var(--ink-2)" }}>{tx("hall.empty.roster")}</div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4, marginBottom: 16 }}>{tx("hall.empty.rosterSub")}</div>
                <div className="row" style={{ gap: 10 }}>
                  {mayCreate && <Btn kind="gold" icon="➕" onClick={() => S.openBuilder()}>{tx("hall.createAgent")}</Btn>}
                  <Btn kind="ghost" onClick={() => S.loadSamples()}>{tx("hall.addSamples")}</Btn>
                </div>
              </div>
            ) : (
              <div className="grid cols-2">
                {chars.map(a => <AgentCard key={a.id} a={a} onClick={() => onAgent(a)} />)}
              </div>
            )}
          </Panel>
        </div>

        <div className="rail">
          <AlertsPanel chars={chars} go={go} />
          <Panel title={tx("hall.panel.council")} en="COUNCIL" icon="💬" className="rail-chat" bodyPad={false}
            right={<FeatureTag kind="demo" />}>
            <LiveChat />
          </Panel>

          <Panel title={tx("hall.panel.activity")} en="ACTIVITY" icon="✦">
            {ACTIVITY.slice(0, 5).map((ev, i) => <ActivityRow key={i} ev={ev} />)}
          </Panel>

          <Panel title={tx("hall.panel.floorplan")} en="FLOORPLAN" icon="🗺️" bodyPad={false}
            right={<Btn kind="ghost" sm onClick={() => go("world")}>{tx("hall.expand")}</Btn>}>
            <div style={{ padding: 12 }}><FloorMap chars={chars} onAgent={onAgent} /></div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { LiveChat, FloorMap, AlertsPanel, GuildHall, nowTime });

export {
  AlertsPanel,
  FLOOR_ROOMS,
  FloorMap,
  GuildHall,
  LiveChat,
  nowTime
};
