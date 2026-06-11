/* PiKaOs — ES module (migrated from PiKaOs/screens-workflows.jsx). */
import React from 'react';
const { useState } = React;
import { Btn, Empty, HelpNote, PageHead, Panel, StatTile } from '../components/components.jsx';
import { WF_STATUS, WF_TRIGGER, simulateRun, wfById } from '../data/data-workflows.jsx';
import { QUESTS } from '../data/data.jsx';
import { Field } from './screens-builder.jsx';
import { Select } from '../components/ui/Dropdown.jsx';

/* ============================================================
   WORKFLOWS · "โต๊ะปรุงเวท" (Activepieces) — §4.7
   - workflow list (enable/disable, run)
   - run modal: builds a form from input_schema → simulated webhook → tool_run
   - tool_runs history: status, input/output/error, filter by agent/quest/status
   - builder canvas: mock embedded Activepieces editor (step graph)
   Bilingual via Sys.T, container marked data-no-lex.
   ============================================================ */

function WfStatusBadge({ status, T }) {
  const s = WF_STATUS[status] || WF_STATUS.ok;
  return <span className={`badge ${s.cls}`} data-no-lex>{status === "running" && <span className="spin-dot" />}{T(s.en, s.th)}</span>;
}

function agentName(id) { const a = (window.__chars || []).find(c => c.id === id); return a ? a.name.split(" ")[0] : null; }
function agentIcon(id) { const a = (window.__chars || []).find(c => c.id === id); return a ? a.icon : "🤖"; }
function questTitle(id) { const q = (typeof QUESTS !== "undefined" ? QUESTS : []).find(x => x.id === id); return q ? q.title : null; }

/* ---------------- RUN MODAL ---------------- */
function RunModal({ Sys, wf, onClose }) {
  const { T } = Sys;
  const [form, setForm] = useState(() => {
    const o = {};
    (wf.input_schema || []).forEach(f => { o[f.key] = f.type === "select" ? (f.options[0] || "") : ""; });
    return o;
  });
  const [run, setRun] = useState(null);       // null | {status,output,error,dur}
  const [running, setRunning] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const missing = (wf.input_schema || []).some(f => f.required && !String(form[f.key] ?? "").trim());

  const go = async () => {
    if (missing || running) return;
    setRunning(true); setRun({ status: "running" });
    const res = await simulateRun(wf, form);
    setRun(res);
    Sys.recordRun(wf, form, res);
    setRunning(false);
  };

  return (
    <div className="drawer-overlay" onClick={onClose} style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
      <div className="userform ornate" onClick={e => e.stopPropagation()} style={{ width: "min(580px, 96vw)" }}>
        <div className="builder-head">
          <span className="ph-icon" style={{ fontSize: 20 }}>{wf.icon}</span>
          <div>
            <div className="kicker">{T("Run workflow", "ร่ายเวิร์กโฟลว์")} · {WF_TRIGGER[wf.trigger].ic} {T(WF_TRIGGER[wf.trigger].en, WF_TRIGGER[wf.trigger].th)}</div>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 19, margin: "2px 0 0", color: "var(--ink)" }}>{T(wf.nameEn, wf.name)}</h2>
          </div>
          <button className="drawer-close" onClick={onClose} style={{ marginLeft: "auto" }}>✕</button>
        </div>

        <div className="userform-body">
          {!run || run.status === "running" ? (
            <>
              <div className="muted" style={{ fontSize: 12.5, lineHeight: 1.55 }}>{T(wf.descEn, wf.desc)}</div>
              <div className="wf-endpoint mono">POST {wf.webhook_url}</div>
              {(wf.input_schema || []).map(f => (
                <Field key={f.key} label={T(f.labelEn, f.label) + (f.required ? " *" : "")}>
                  {f.type === "select" ? (
                    <Select block value={form[f.key]} onChange={v => set(f.key, v)} options={f.options.map(o => ({ value: o, label: o }))} />
                  ) : f.type === "textarea" ? (
                    <textarea className="bf-input" rows={3} value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder || ""} />
                  ) : (
                    <input className="bf-input" type={f.type === "number" ? "number" : "text"} value={form[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder || ""} />
                  )}
                </Field>
              ))}
              {(wf.input_schema || []).length === 0 && <div className="muted" style={{ fontSize: 12.5 }}>{T("This workflow takes no input.", "เวิร์กโฟลว์นี้ไม่ต้องป้อนข้อมูล")}</div>}
            </>
          ) : (
            <div className="col" style={{ gap: 14 }}>
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <WfStatusBadge status={run.status} T={T} />
                <span className="mono faint" style={{ fontSize: 12 }}>{T("completed in", "ใช้เวลา")} {run.dur}</span>
              </div>
              <div>
                <div className="kicker" style={{ marginBottom: 6 }}>{T("Input", "ข้อมูลเข้า")}</div>
                <pre className="wf-json">{JSON.stringify(form, null, 2)}</pre>
              </div>
              {run.status === "ok" ? (
                <div>
                  <div className="kicker" style={{ marginBottom: 6 }}>{T("Output", "ผลลัพธ์")}</div>
                  <pre className="wf-json ok">{JSON.stringify(run.output, null, 2)}</pre>
                </div>
              ) : (
                <div>
                  <div className="kicker" style={{ marginBottom: 6 }}>{T("Error", "ข้อผิดพลาด")}</div>
                  <pre className="wf-json err">{run.error}</pre>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="userform-foot">
          {!run || run.status === "running" ? (
            <>
              <Btn kind="ghost" onClick={onClose}>{T("Cancel", "ยกเลิก")}</Btn>
              <Btn kind="gold" icon={running ? "" : "✦"} onClick={go} style={{ opacity: missing ? .5 : 1, pointerEvents: missing || running ? "none" : "auto" }}>
                {running ? T("Running…", "กำลังรัน…") : T("Run now", "รันเลย")}
              </Btn>
            </>
          ) : (
            <>
              <Btn kind="ghost" onClick={() => setRun(null)}>{T("Run again", "รันอีกครั้ง")}</Btn>
              <Btn kind="gold" onClick={onClose}>{T("Done", "เสร็จสิ้น")}</Btn>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- BUILDER CANVAS (mock embedded editor) ---------------- */
function BuilderCanvas({ Sys, wf, onClose }) {
  const { T, can } = Sys;
  return (
    <div className="drawer-overlay" onClick={onClose} style={{ justifyContent: "center", alignItems: "center", padding: 24 }}>
      <div className="wf-builder ornate" onClick={e => e.stopPropagation()}>
        <div className="builder-head" style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <span className="ph-icon" style={{ fontSize: 20 }}>{wf.icon}</span>
          <div>
            <div className="kicker">{T("Spellcraft table · embedded editor", "โต๊ะปรุงเวท · ตัวแก้ไขฝังตัว")}</div>
            <h2 style={{ fontFamily: "var(--font-head)", fontSize: 19, margin: "2px 0 0", color: "var(--ink)" }}>{T(wf.nameEn, wf.name)}</h2>
          </div>
          <button className="drawer-close" onClick={onClose} style={{ marginLeft: "auto" }}>✕</button>
        </div>

        <div className="wf-canvas">
          <div className="wf-canvas-note mono">
            {T("This is where the Activepieces flow editor embeds (iframe). The step graph below mirrors the live flow.",
               "ตรงนี้คือที่ฝังตัวแก้ไข flow ของ Activepieces (iframe) · ผังขั้นตอนด้านล่างสะท้อน flow จริง")}
          </div>
          <div className="wf-flow">
            {wf.steps.map((s, i) => (
              <React.Fragment key={i}>
                <div className={`wf-node ${i === 0 ? "trigger" : ""}`}>
                  <span className="wf-node-ic">{s.ic}</span>
                  <div style={{ minWidth: 0 }}>
                    <div className="wf-node-t">{s.t}</div>
                    <div className="wf-node-d mono">{s.d}</div>
                  </div>
                </div>
                {i < wf.steps.length - 1 && <div className="wf-conn"><span /></div>}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="userform-foot">
          <span className="mono faint" style={{ fontSize: 11, marginRight: "auto" }}>flow_id · {wf.ap_flow_id}</span>
          <Btn kind="ghost" onClick={onClose}>{T("Close", "ปิด")}</Btn>
          {can("workflow.manage") && <Btn kind="gold" icon="↗" onClick={onClose}>{T("Open in Activepieces", "เปิดใน Activepieces")}</Btn>}
        </div>
      </div>
    </div>
  );
}

/* ---------------- TOOL RUN ROW (expandable) ---------------- */
function ToolRunRow({ Sys, r }) {
  const { T, workflows } = Sys;
  const [open, setOpen] = useState(false);
  const wf = wfById(workflows, r.wf) || { name: r.wf, nameEn: r.wf, icon: "⚙️" };
  return (
    <div className={`toolrun ${open ? "open" : ""}`}>
      <button className="toolrun-head" onClick={() => setOpen(o => !o)}>
        <span className="tr-ic">{wf.icon}</span>
        <div className="tr-main">
          <div className="tr-top">
            <span className="tr-name">{T(wf.nameEn, wf.name)}</span>
            <WfStatusBadge status={r.status} T={T} />
          </div>
          <div className="tr-meta mono">
            {r.agent && <span>{agentIcon(r.agent)} {agentName(r.agent)}</span>}
            {r.quest && <><span>·</span><span>📜 {questTitle(r.quest) || r.quest}</span></>}
            <span>·</span><span>{r.dur}</span>
            <span>·</span><span>{typeof r.started === "object" ? T(r.started.en, r.started.th) : r.started}</span>
          </div>
        </div>
        <span className="tr-caret">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="toolrun-body">
          <div className="tr-col">
            <div className="kicker" style={{ marginBottom: 5 }}>{T("Input", "ข้อมูลเข้า")}</div>
            <pre className="wf-json">{JSON.stringify(r.input, null, 2)}</pre>
          </div>
          <div className="tr-col">
            <div className="kicker" style={{ marginBottom: 5 }}>{r.status === "failed" ? T("Error", "ข้อผิดพลาด") : T("Output", "ผลลัพธ์")}</div>
            {r.status === "failed"
              ? <pre className="wf-json err">{r.error}</pre>
              : <pre className="wf-json ok">{JSON.stringify(r.output, null, 2)}</pre>}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- MAIN SCREEN ---------------- */
function Workflows({ Sys }) {
  const { workflows, toolRuns, can, T } = Sys;
  const [runWf, setRunWf] = useState(null);
  const [buildWf, setBuildWf] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [agentFilter, setAgentFilter] = useState("all");

  const manage = can("workflow.manage");
  const mayRun = can("quest.run") || can("workflow.manage");
  const enabledCount = workflows.filter(w => w.enabled).length;
  const okRate = toolRuns.length ? Math.round(toolRuns.filter(r => r.status === "ok").length / toolRuns.length * 100) : 0;
  const agentsInRuns = [...new Set(toolRuns.map(r => r.agent).filter(Boolean))];

  const runs = toolRuns
    .filter(r => statusFilter === "all" || r.status === statusFilter)
    .filter(r => agentFilter === "all" || r.agent === agentFilter);

  return (
    <div className="content-pad fade-in">
      <PageHead kicker={T("Automation · Workflows", "ระบบอัตโนมัติ · เวิร์กโฟลว์")} title={T("Workflows", "โต๊ะปรุงเวท")} tag="local"
        desc={T("Reusable automations agents can cast — built in Activepieces, triggered by webhook, schedule or an agent. Every run is logged below.",
                "ชุดงานอัตโนมัติที่ agent เรียกใช้ได้ — สร้างด้วย Activepieces ทริกเกอร์ผ่าน webhook ตามเวลา หรือให้ agent เรียก · ทุกการรันถูกบันทึกด้านล่าง")}
        actions={manage ? <Btn kind="gold" sm icon="➕" onClick={() => setBuildWf(workflows[0])}>{T("New workflow", "สร้างเวิร์กโฟลว์")}</Btn> : <span className="perm-hint mono">{T("run only", "รันได้อย่างเดียว")}</span>} />

      <HelpNote tag="local">{T("Toggle a workflow on/off, run it with inputs (a tool_run is recorded), or open the spellcraft table to view its step graph. Runs and toggles are saved on your device.",
        "เปิด/ปิดเวิร์กโฟลว์ รันพร้อมป้อนข้อมูล (จะบันทึกเป็น tool_run) หรือเปิดโต๊ะปรุงเวทเพื่อดูผังขั้นตอน · การรันและสถานะถูกบันทึกในเครื่อง")}</HelpNote>

      <div className="grid cols-4 stagger" style={{ margin: "16px 0 18px" }}>
        <StatTile label={T("Workflows", "เวิร์กโฟลว์")} value={workflows.length} unit={T("flows", "ชุด")} icon="⚗️" />
        <StatTile label={T("Enabled", "เปิดใช้")} value={`${enabledCount}/${workflows.length}`} delta={T("active flows", "ที่เปิดอยู่")} deltaTone="up" icon="🟢" />
        <StatTile label={T("Total runs", "การรันทั้งหมด")} value={toolRuns.length} unit="runs" icon="▶" />
        <StatTile label={T("Success rate", "อัตราสำเร็จ")} value={okRate + "%"} delta={T("recent runs", "การรันล่าสุด")} deltaTone={okRate >= 80 ? "up" : "down"} icon="✓" />
      </div>

      <div className="grid" style={{ gridTemplateColumns: "1fr 380px", gap: 16, alignItems: "start" }}>
        {/* ---- workflow list ---- */}
        <Panel title={T("Workflow library", "คลังเวิร์กโฟลว์")} en="LIBRARY" icon="⚗️" bodyPad={false}>
          <div className="col" style={{ gap: 0 }}>
            {workflows.map(w => (
              <div key={w.id} className={`wf-card ${w.enabled ? "" : "off"}`}>
                <span className="wf-ic">{w.icon}</span>
                <div className="wf-body" onClick={() => setBuildWf(w)}>
                  <div className="wf-top">
                    <span className="wf-name">{T(w.nameEn, w.name)}</span>
                    <span className="wf-trigger mono">{WF_TRIGGER[w.trigger].ic} {T(WF_TRIGGER[w.trigger].en, WF_TRIGGER[w.trigger].th)}</span>
                  </div>
                  <div className="wf-desc">{T(w.descEn, w.desc)}</div>
                  <div className="wf-foot mono">
                    <span>{w.runs} {T("runs", "ครั้ง")}</span>
                    <span>·</span>
                    <span className="row" style={{ gap: 5 }}>{T("last", "ล่าสุด")} <WfStatusBadge status={w.lastStatus} T={T} /></span>
                    <span>·</span>
                    <span>{w.steps.length} {T("steps", "ขั้น")}</span>
                  </div>
                </div>
                <div className="wf-actions">
                  <button className={`wf-switch ${w.enabled ? "on" : ""}`} title={w.enabled ? T("Enabled", "เปิด") : T("Disabled", "ปิด")}
                    onClick={() => manage ? Sys.toggleWorkflow(w) : null} disabled={!manage} style={{ opacity: manage ? 1 : .5 }}>
                    <span className="wf-knob" />
                  </button>
                  <Btn kind="ghost" sm icon="🛠" onClick={() => setBuildWf(w)}>{T("Builder", "โต๊ะปรุง")}</Btn>
                  {mayRun && <Btn kind="gold" sm icon="✦" onClick={() => setRunWf(w)} style={{ opacity: w.enabled ? 1 : .5, pointerEvents: w.enabled ? "auto" : "none" }}>{T("Run", "รัน")}</Btn>}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* ---- tool_runs history ---- */}
        <Panel title={T("Run history", "ประวัติการรัน")} en="TOOL RUNS" icon="🧾" bodyPad={false}
          right={<span className="mono faint" style={{ fontSize: 11 }}>{runs.length}</span>}>
          <div style={{ padding: 12 }}>
            <div className="row" style={{ gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
              {["all", "ok", "failed", "running"].map(s => (
                <button key={s} className={`tab-pill ${statusFilter === s ? "on" : ""}`} onClick={() => setStatusFilter(s)}>
                  {s === "all" ? T("all", "ทั้งหมด") : T(WF_STATUS[s].en, WF_STATUS[s].th)}
                </button>
              ))}
            </div>
            {agentsInRuns.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Select block value={agentFilter} onChange={setAgentFilter}
                  options={[{ value: "all", label: T("All agents", "ทุก Agent") }, ...agentsInRuns.map(id => ({ value: id, label: agentName(id) }))]} />
              </div>
            )}
            {runs.length === 0
              ? <Empty icon="🧾" title={T("No runs match", "ไม่มีการรันที่ตรง")} sub={T("Run a workflow or change the filter", "ลองรันเวิร์กโฟลว์ หรือเปลี่ยนตัวกรอง")} />
              : <div className="col" style={{ gap: 8 }}>{runs.map(r => <ToolRunRow key={r.id} Sys={Sys} r={r} />)}</div>}
          </div>
        </Panel>
      </div>

      {runWf && <RunModal Sys={Sys} wf={runWf} onClose={() => setRunWf(null)} />}
      {buildWf && <BuilderCanvas Sys={Sys} wf={buildWf} onClose={() => setBuildWf(null)} />}
    </div>
  );
}

Object.assign(window, { Workflows, RunModal, BuilderCanvas, ToolRunRow, WfStatusBadge });

export {
  BuilderCanvas,
  RunModal,
  ToolRunRow,
  WfStatusBadge,
  Workflows,
  agentIcon,
  agentName,
  questTitle
};
