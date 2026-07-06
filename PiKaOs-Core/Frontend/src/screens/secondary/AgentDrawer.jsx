/* PiKaOs — AGENT DRAWER: full agent detail panel (portrait, model/room, goal,
   skills/tools/workflows, core + extra rules, downloadable .md files). */
import React from 'react';
import { loadCoreRules } from '../../lib/characters.jsx';
import { Avatar, Btn, StatusBadge } from '../../components/components.jsx';
import { CharacterSprite } from '../../components/CharacterSprite.jsx';
import { st, setSt } from './st.js';
import { sanitizeHtml } from '../../lib/sanitize.js';

/* ---------------- AGENT DRAWER ---------------- */
function AgentDrawer({ a, onClose, onEdit, onDelete, t }) {
  setSt(t);
  let roomName = null;
  try { if (a.homeRoom) { const rs = (JSON.parse(localStorage.getItem("guildos.rooms.v2") || "{}").rooms) || []; roomName = (rs.find(r => r.id === a.homeRoom) || {}).name || null; } } catch (e) { }
  const core = (window.loadCoreRules ? loadCoreRules() : []);
  let extra = []; try { extra = JSON.parse(localStorage.getItem("guildos.docfiles." + a.id) || "[]"); } catch (e) { }
  const mdFiles = ["SKILL.md", "TOOLS.md", "EXAMPLES.md", "REFERENCE.md", ...extra];
  const dlMd = (f) => {
    let html = ""; try { html = localStorage.getItem("guildos.doc.agent:" + a.id + ":" + f) || ""; } catch (e) { }
    const div = document.createElement("div"); div.innerHTML = sanitizeHtml(html);
    const txt = (div.innerText || "").trim() || ("# " + f.replace(/\.md$/, ""));
    const blob = new Blob([txt + "\n"], { type: "text/markdown;charset=utf-8" });
    const el = document.createElement("a"); el.href = URL.createObjectURL(blob); el.download = f;
    document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(el.href), 1200);
  };
  const Section = ({ title, children }) => <div><div className="kicker" style={{ marginBottom: 9 }}>{title}</div>{children}</div>;
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-head">
          <div className="ad-portrait">{window.CharacterSprite ? <CharacterSprite charId={a.characterId} walking={false} h={84} style={{ position: "static" }} /> : <Avatar a={a} size="lg" />}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 20, margin: 0, color: "var(--ink)" }}>{a.name}</h2>
            <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 4 }}>{[a.position, a.role].filter(Boolean).join(" · ")}</div>
            <div style={{ marginTop: 8 }}><StatusBadge s={a.status} /></div>
          </div>
          <button className="drawer-close" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">
          {a.desc && <p style={{ margin: 0, color: "var(--ink-2)", fontSize: 13.5, lineHeight: 1.6 }}>{a.desc}</p>}

          <div className="kv">
            <div className="kv-item"><div className="kv-label">{st("ad.model")}</div><div className="kv-val" style={{ fontSize: 12.5, fontFamily: "var(--font-mono)" }}>{a.model}</div></div>
            <div className="kv-item"><div className="kv-label">{st("ad.homeRoom")}</div><div className="kv-val" style={{ fontSize: 13 }}>{roomName || "—"}</div></div>
          </div>

          {a.goal && <Section title={st("bld.f.goal")}><div className="panel inset" style={{ padding: "11px 13px", fontSize: 13.5, color: "var(--ink)", lineHeight: 1.5 }}>🎯 {a.goal}</div></Section>}

          <Section title={st("bld.f.skill")}>
            <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
              {(a.skills && a.skills.length) ? a.skills.map((s, i) => <span key={i} className="badge magic" style={{ fontSize: 12 }}>✦ {s}{(a.skillDocs && a.skillDocs[s]) ? " 📄" : ""}</span>) : <span className="muted" style={{ fontSize: 12.5 }}>—</span>}
            </div>
          </Section>

          {a.tools && a.tools.length > 0 && <Section title={st("bld.f.tools")}><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{a.tools.map(t => <span key={t} className="tag">{t}</span>)}</div></Section>}

          {a.workflows && a.workflows.length > 0 && <Section title={st("bld.f.wf")}><div className="row" style={{ gap: 6, flexWrap: "wrap" }}>{a.workflows.map(id => { const w = (window.__workflows || []).find(x => x.id === id); return w ? <span key={id} className="tag" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span>{w.icon}</span>{w.name}</span> : null; })}</div></Section>}

          {core.length > 0 && <Section title={st("bld.f.core")}><div className="col" style={{ gap: 7 }}>{core.map((r, i) => <div key={i} className="row" style={{ gap: 8, alignItems: "flex-start" }}><span className="ad-core-badge">{st("bld.core.badge")}</span><span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{r}</span></div>)}</div></Section>}

          {a.rules && a.rules.length > 0 && <Section title={st("ad.rulesMore")}><div className="col" style={{ gap: 8 }}>{a.rules.map((r, i) => <div key={i} className="row" style={{ gap: 9, alignItems: "flex-start" }}><span className="rule-num" style={{ marginTop: 1 }}>{i + 1}</span><span style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5 }}>{r}</span></div>)}</div></Section>}

          <Section title={st("ad.mdFiles")}>
            <div className="col" style={{ gap: 6 }}>
              {mdFiles.map(f => (
                <div key={f} className="adoc-row">
                  <span className="adoc-name mono">📄 {f}</span>
                  <button type="button" className="adoc-btn" onClick={() => dlMd(f)}>⬇ .md</button>
                </div>
              ))}
            </div>
          </Section>

          <div className="row" style={{ gap: 10 }}>
            <Btn kind="gold" icon="✎" style={{ flex: 1 }} onClick={() => onEdit && onEdit(a)}>{st("ad.edit")}</Btn>
            {a.locked
              ? <Btn kind="ghost" style={{ opacity: .6, pointerEvents: "none" }}>{st("ad.cantDelete")}</Btn>
              : <Btn kind="ghost" onClick={async () => { if (await uiConfirm({ title: st("ad.delTitle"), message: st("ad.delMsg", { name: a.name }), danger: true })) onDelete && onDelete(a.id); }}
                  style={{ color: "var(--crimson)", borderColor: "color-mix(in srgb,var(--crimson) 40%,transparent)" }}>{st("ad.delete")}</Btn>}
          </div>
          {a.locked && <div className="qei-note" style={{ marginTop: 8 }}>{st("ad.ceoLocked")}</div>}
        </div>
      </div>
    </div>
  );
}

export { AgentDrawer };
