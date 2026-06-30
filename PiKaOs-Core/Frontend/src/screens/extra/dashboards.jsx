/* PiKaOs — read-only dashboard screens: Mana, Treasury, Chronicle (stats),
   Quest Log, and Watchtower (health checks). */
import React from 'react';
import { Avatar, Empty, Meter, PageHead, Panel, RankGem, StatTile } from '../../components/components.jsx';
import { TOKENS, TASKS, TREASURY, byId } from '../../data/data.jsx';

/* ---------------- TOKENS ---------------- */
function Mana({ S, t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const chars = S.chars;
  const pctBalance = Math.round(TOKENS.balance / TOKENS.cap * 100);
  const totalMana = chars.reduce((s, c) => s + c.tokens, 0) || 1;
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("mana.kicker")} title={xt("mana.title")} tag="demo"
        desc={xt("mana.desc")} />
      <div className="grid cols-4 stagger" style={{ marginBottom: 18 }}>
        <StatTile label={xt("mana.balance")} value={(TOKENS.balance/1000).toFixed(1)} unit="K" delta={xt("mana.capPct", { n: pctBalance })} icon="🔵" />
        <StatTile label={xt("mana.spentToday")} value={(TOKENS.spentToday/1000).toFixed(1)} unit="K" delta={xt("mana.vsYesterday")} deltaTone="down" icon="🔥" />
        <StatTile label={xt("mana.spentWeek")} value={(TOKENS.spentWeek/1000).toFixed(1)} unit="K" icon="📅" />
        <StatTile label={xt("mana.burnRate")} value={TOKENS.burnRate} unit={xt("mana.perHr")} delta={xt("mana.normal")} deltaTone="up" icon="⚡" />
      </div>
      <div className="grid cols-2">
        <Panel title={xt("mana.capacity")} en="CAPACITY" icon="🔵">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
            <span className="muted" style={{ fontSize: 13 }}>{TOKENS.balance.toLocaleString()} / {TOKENS.cap.toLocaleString()} token</span>
            <span className="gold-text mono" style={{ fontSize: 13 }}>{pctBalance}%</span>
          </div>
          <Meter kind="mana" val={pctBalance} />
          <div className="muted" style={{ fontSize: 12.5, marginTop: 14, lineHeight: 1.6 }}>{xt("mana.capacityNote")}</div>
        </Panel>
        <Panel title={xt("mana.byAgent")} en="BY AGENT" icon="🎭">
          {chars.length === 0 ? <Empty icon="🔵" title={xt("mana.noUsage")} sub={xt("mana.noUsageSub")} /> :
          <div className="col" style={{ gap: 12 }}>
            {[...chars].sort((x, y) => y.tokens - x.tokens).map(a => {
              const pct = Math.round(a.tokens / totalMana * 100);
              return (
                <div key={a.id} className="stat-line">
                  <span className="sl-label" style={{ display: "flex", alignItems: "center", gap: 7, width: 130, flexBasis: 130 }}>
                    <span style={{ fontSize: 14 }}>{a.icon}</span><span style={{ fontSize: 12.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{a.name.split(" ")[0]}</span>
                  </span>
                  <Meter kind="mana" val={pct} /><span className="sl-num">{pct}%</span>
                </div>
              );
            })}
          </div>}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- TREASURY ---------------- */
function Treasury({ t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("treasury.kicker")} title={xt("treasury.title")} tag="demo"
        desc={xt("treasury.desc")} />
      <div className="grid cols-3 stagger" style={{ marginBottom: 18 }}>
        <StatTile label={xt("treasury.gold")} value={TREASURY.gold.toLocaleString()} unit="◈" icon="💰" />
        <StatTile label={xt("treasury.artifacts")} value={TREASURY.artifacts} unit={xt("treasury.artifactsUnit")} delta={xt("treasury.artifactsDelta")} icon="🏺" />
        <StatTile label={xt("treasury.thisWeek")} value={TREASURY.thisWeek.toLocaleString()} unit="◈" delta="▲ +18%" deltaTone="up" icon="📈" />
      </div>
      <Panel title={xt("treasury.rewardLog")} en="REWARD LOG" icon="📜">
        <div className="list-rows">
          {TREASURY.log.map((r, i) => (
            <div key={i} className="codex-row" style={{ cursor: "default" }}>
              <span className="codex-type">🏆</span>
              <div className="codex-main"><div className="codex-title">{r.title}</div><div className="codex-meta">{r.quest.toUpperCase()} · {r.when}</div></div>
              <span className="gold-text mono" style={{ fontSize: 14, fontWeight: 600 }}>◈ +{r.reward}</span>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- CHRONICLE (stats) ---------------- */
function Chronicle({ S, t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const chars = S.chars;
  const bars = [42, 58, 51, 73, 66, 88, 79];
  const days = xt("chronicle.days").split(",");
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("chronicle.kicker")} title={xt("chronicle.title")} tag="demo"
        desc={xt("chronicle.desc")} />
      <div className="grid cols-4 stagger" style={{ marginBottom: 18 }}>
        <StatTile label={xt("chronicle.totalDone")} value="1,284" delta={xt("chronicle.totalDoneDelta")} deltaTone="up" icon="🏆" />
        <StatTile label={xt("chronicle.winRate")} value="94" unit="%" delta="▲ +1.2%" deltaTone="up" icon="⚔️" />
        <StatTile label={xt("chronicle.avgTime")} value="3.4" unit={xt("chronicle.avgUnit")} delta={xt("chronicle.faster")} deltaTone="up" icon="⏱️" />
        <StatTile label={xt("chronicle.activeAgents")} value={chars.length} delta={xt("chronicle.allReady")} icon="🎭" />
      </div>
      <div className="grid cols-2">
        <Panel title={xt("chronicle.perDay")} en="PER DAY" icon="📊">
          <div style={{ display: "flex", alignItems: "flex-end", gap: 14, height: 180, padding: "10px 4px 0" }}>
            {bars.map((h, i) => (
              <div key={i} className="col" style={{ flex: 1, alignItems: "center", gap: 8, justifyContent: "flex-end", height: "100%" }}>
                <div style={{ width: "100%", height: `${h}%`, borderRadius: "6px 6px 2px 2px", background: i === 5 ? "var(--gold-grad)" : "var(--raised-grad)",
                  border: "1px solid " + (i === 5 ? "var(--gold-deep)" : "var(--line)"), boxShadow: i === 5 ? "0 0 14px -2px var(--gold-glow)" : "none", transition: "height .5s" }} />
                <span className="mono faint" style={{ fontSize: 11 }}>{days[i]}</span>
              </div>
            ))}
          </div>
        </Panel>
        <Panel title={xt("chronicle.leaderboard")} en="LEADERBOARD" icon="🥇">
          {chars.length === 0 ? <Empty icon="🥇" title={xt("chronicle.noRank")} sub={xt("chronicle.noRankSub")} /> :
          <div className="list-rows">
            {[...chars].sort((a,b) => b.tasksDone - a.tasksDone).slice(0,5).map((a, i) => (
              <div key={a.id} className="row" style={{ gap: 11 }}>
                <span className="display" style={{ width: 22, color: i === 0 ? "var(--gold-bright)" : "var(--ink-3)", fontSize: 15 }}>{i + 1}</span>
                <Avatar a={a} size="sm" />
                <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, color: "var(--ink)" }}>{a.name}</div><div className="mono faint" style={{ fontSize: 10.5 }}>{a.classEn}</div></div>
                <span className="mono" style={{ fontSize: 13, color: "var(--ink-2)" }}>{a.tasksDone} {xt("chronicle.tasksUnit")}</span>
              </div>
            ))}
          </div>}
        </Panel>
      </div>
    </div>
  );
}

/* ---------------- QUEST LOG ---------------- */
function QuestLog({ t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const done = TASKS.filter(q => q.status === "done").concat(TASKS.filter(q => q.status !== "done"));
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("qlog.kicker")} title={xt("qlog.title")} tag="demo"
        desc={xt("qlog.desc")} />
      <Panel bodyPad={false}>
        <div style={{ padding: 6 }}>
          {done.map(q => {
            const lead = byId(q.lead);
            const leadName = lead ? lead.name.split(" ")[0] : "—";
            const stMap = { active:["busy",xt("qb.st.active")], queued:["idle",xt("qb.st.queued")], review:["info",xt("qb.st.review")], done:["on",xt("qb.st.done")], failed:["warn",xt("qlog.st.failed")] };
            const [c,stLabel] = stMap[q.status];
            return (
              <div key={q.id} className="row" style={{ gap: 13, padding: "12px 12px", borderBottom: "1px solid var(--line-soft)" }}>
                <RankGem r={q.rank} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-head)", fontWeight: 700, fontSize: 14, color: "var(--ink)" }}>{q.title}</div>
                  <div className="mono faint" style={{ fontSize: 11 }}>{q.id.toUpperCase()} · {xt("qlog.leadBy", { name: leadName })}</div>
                </div>
                <span className={`badge ${c}`}><span className="dot" />{stLabel}</span>
                <span className="gold-text mono" style={{ fontSize: 13, width: 80, textAlign: "right" }}>◈ {q.reward.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

/* ---------------- WATCHTOWER (health checks) ---------------- */
function Watchtower({ t }) {
  const xt = (typeof t === "function") ? t : ((k) => k);
  const checks = [
    { label: xt("watch.chk.hermes"), ok: true, note: xt("watch.chk.hermesNote") },
    { label: xt("watch.chk.kb"), ok: true, note: xt("watch.chk.kbNote") },
    { label: xt("watch.chk.err"), ok: true, note: xt("watch.chk.errNote") },
    { label: xt("watch.chk.mana"), ok: false, note: xt("watch.chk.manaNote") },
  ];
  return (
    <div className="content-pad fade-in">
      <PageHead kicker={xt("watch.kicker")} title={xt("watch.title")} tag="demo"
        desc={xt("watch.desc")} />
      <div className="grid cols-2 stagger">
        {checks.map((c, i) => (
          <Panel key={i}>
            <div className="row" style={{ gap: 13 }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, display: "grid", placeItems: "center", fontSize: 18,
                background: c.ok ? "color-mix(in srgb,var(--emerald) 14%,transparent)" : "color-mix(in srgb,var(--crimson) 14%,transparent)",
                border: "1px solid " + (c.ok ? "color-mix(in srgb,var(--emerald) 45%,transparent)" : "color-mix(in srgb,var(--crimson) 45%,transparent)") }}>
                {c.ok ? "✓" : "!"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: "var(--ink)" }}>{c.label}</div>
                <div className="mono" style={{ fontSize: 11.5, color: c.ok ? "var(--ink-3)" : "var(--crimson)" }}>{c.note}</div>
              </div>
              <span className={`badge ${c.ok ? "on" : "warn"}`}><span className="dot" />{c.ok ? xt("watch.ok") : xt("watch.warn")}</span>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

export { Mana, Treasury, Chronicle, QuestLog, Watchtower };
