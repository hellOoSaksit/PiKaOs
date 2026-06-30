/* PiKaOs — room "exported files" panel + export generators. */
import React from 'react';
const { useState, useEffect } = React;
import { wt } from './wt.js';

const EXPORT_TYPES = {
  xlsx: { label: "Excel", icon: "📊", tone: "emerald", ext: "xls", mime: "application/vnd.ms-excel" },
  json: { label: "JSON", icon: "🧾", tone: "gold", ext: "json", mime: "application/json" },
  csv: { label: "CSV", icon: "📈", tone: "sapphire", ext: "csv", mime: "text/csv" },
  md: { label: "Markdown", icon: "📝", tone: "violet", ext: "md", mime: "text/markdown" },
};
function exportSeed(roomId) {
  const now = Date.now();
  return [
    { id: "ex_" + roomId + "_1", name: "agent-report", type: "xlsx", size: "24 KB", by: "นักวิเคราะห์", ts: now - 3600e3 },
    { id: "ex_" + roomId + "_2", name: "task-result", type: "json", size: "3 KB", by: "ผู้ควบคุมกลาง", ts: now - 7200e3 },
    { id: "ex_" + roomId + "_3", name: "data-summary", type: "csv", size: "8 KB", by: "เก็บข้อมูล", ts: now - 86400e3 },
  ];
}
function loadExports(roomId) {
  const k = "guildos.exports." + roomId;
  try { const s = localStorage.getItem(k); if (s) return JSON.parse(s); } catch (e) { }
  const seed = exportSeed(roomId); try { localStorage.setItem(k, JSON.stringify(seed)); } catch (e) { } return seed;
}
function saveExports(roomId, list) { try { localStorage.setItem("guildos.exports." + roomId, JSON.stringify(list)); } catch (e) { } }
function exportTimeLabel(ts) { try { return new Date(ts).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
function genExportContent(exp, room) {
  const rows = [["agent", "task", "status", "tokens"], ["นักวิเคราะห์", "สรุปข้อมูลตลาด", "done", "12400"], ["เก็บข้อมูล", "รวบรวมรายงาน", "active", "6200"], ["นักวิจัย", "ค้นคว้าแนวทาง", "review", "9100"]];
  if (exp.type === "json") return JSON.stringify({ room: room.name, file: exp.name, generatedBy: "PiKaOs · AI", rows: rows.slice(1).map(r => ({ agent: r[0], task: r[1], status: r[2], tokens: +r[3] })) }, null, 2);
  if (exp.type === "csv") return rows.map(r => r.join(",")).join("\n");
  if (exp.type === "md") return `# ${exp.name}\n\nส่งออกจากห้อง **${room.name}** โดย AI\n\n| Agent | Task | Status | Tokens |\n|---|---|---|---|\n` + rows.slice(1).map(r => `| ${r.join(" | ")} |`).join("\n") + "\n";
  // xlsx → HTML table (.xls opens in Excel)
  return `<html><head><meta charset="utf-8"></head><body><table border="1"><tr>${rows[0].map(h => `<th>${h}</th>`).join("")}</tr>${rows.slice(1).map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</table></body></html>`;
}
function downloadExport(exp, room) {
  const t = EXPORT_TYPES[exp.type] || EXPORT_TYPES.json;
  const blob = new Blob([genExportContent(exp, room)], { type: t.mime + ";charset=utf-8" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = exp.name + "." + t.ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1500);
}
function RoomExports({ room }) {
  const [exps, setExps] = useState(() => loadExports(room.id));
  useEffect(() => { setExps(loadExports(room.id)); }, [room.id]);
  const simulate = () => {
    const types = Object.keys(EXPORT_TYPES); const type = types[Math.floor(Math.random() * types.length)];
    const names = ["agent-report", "analysis", "dataset", "summary", "result", "metrics"];
    const e = { id: "ex" + Date.now(), name: names[Math.floor(Math.random() * names.length)] + "-" + (Math.floor(Math.random() * 900) + 100), type, size: (Math.floor(Math.random() * 40) + 2) + " KB", by: ["นักวิเคราะห์", "เก็บข้อมูล", "ผู้ควบคุมกลาง", "นักวิจัย"][Math.floor(Math.random() * 4)], ts: Date.now() };
    const nx = [e, ...exps]; setExps(nx); saveExports(room.id, nx);
  };
  const removeExp = (id) => { const nx = exps.filter(x => x.id !== id); setExps(nx); saveExports(room.id, nx); };
  return (
    <div className="ra-files ra-exports">
      <div className="ra-files-head mono ra-exp-headrow">
        <span>{wt("rx.head")}</span>
        <button type="button" className="ra-exp-gen" onClick={simulate}>{wt("rx.gen")}</button>
      </div>
      {exps.length === 0 ? <div className="muted" style={{ fontSize: 12 }}>{wt("rx.empty")}</div> : exps.map(e => {
        const t = EXPORT_TYPES[e.type] || EXPORT_TYPES.json;
        return (
          <div key={e.id} className={`ra-exp tone-${t.tone}`}>
            <div className="ra-exp-ic">{t.icon}</div>
            <div className="ra-exp-main">
              <div className="ra-exp-name mono">{e.name}.{t.ext}</div>
              <div className="ra-exp-meta">{t.label} · {e.size}</div>
              <div className="ra-exp-by mono">🤖 {e.by} · {exportTimeLabel(e.ts)}</div>
            </div>
            <div className="ra-exp-actions">
              <button type="button" onClick={() => downloadExport(e, room)} title={wt("rx.download")}>⬇</button>
              <button type="button" onClick={() => removeExp(e.id)} title={wt("rx.delete")}>✕</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { EXPORT_TYPES, exportSeed, loadExports, saveExports, exportTimeLabel, genExportContent, downloadExport, RoomExports };
