/* PiKaOs — Menu Manager panel: admin arranges the global sidebar navigation.

   Lives inside the "จัดการเครื่องมือ" (Tools) screen — system settings belong there (CLAUDE.md
   rule 2). Edits one shared config (data-nav.jsx) so the arrangement is the same for every user.
   Reorder by drag (within the same parent) or the ↑↓ buttons; nest with indent/outdent up to
   MAX_DEPTH levels (Main → Sub → Sub); hide/show; rename; reset to the code default. */
import React from 'react';
const { useState } = React;
import { Btn } from '../components/components.jsx';
import {
  MAX_DEPTH, moveUp, moveDown, indent, outdent, canIndent, canOutdent,
  toggleHidden, rename, reorderBefore, resetNav,
} from '../data/data-nav.jsx';

const LEVEL_NAME = ["Main", "Sub", "Sub"];   // by depth (0,1,2)

function NavManagerPanel({ Sys }) {
  const { nav, setNav, T } = Sys;
  const [drag, setDrag] = useState(null);     // id of the row being dragged

  const apply = (fn, id) => setNav(fn(nav, id));

  const doRename = async (node) => {
    const cur = T(node.en || "", node.label || "");
    const name = window.uiPrompt
      ? await window.uiPrompt({ title: T("Rename menu item", "เปลี่ยนชื่อเมนู"), placeholder: cur, value: cur })
      : window.prompt(T("Rename", "เปลี่ยนชื่อ"), cur);
    if (name == null || !String(name).trim()) return;
    setNav(rename(nav, node.id, String(name).trim(), String(name).trim()));   // one shared label (both langs)
  };

  const doReset = async () => {
    const ok = window.uiConfirm
      ? await window.uiConfirm({ title: T("Reset menu", "รีเซตเมนู"), danger: true, confirmText: T("Reset", "รีเซต"),
          message: T("Restore the default menu arrangement for everyone?", "คืนค่าการจัดเรียงเมนูเริ่มต้นให้ทุกคน?") })
      : window.confirm(T("Reset menu to default?", "รีเซตเมนูเป็นค่าเริ่มต้น?"));
    if (ok) setNav(resetNav());
  };

  const renderRow = (node, depth) => {
    const hidden = !!node.hidden;
    return (
      <React.Fragment key={node.id}>
        <div className={`navmgr-row ${hidden ? "is-hidden" : ""} ${drag === node.id ? "dragging" : ""}`}
          style={{ marginLeft: depth * 22 }}
          draggable onDragStart={(e) => { setDrag(node.id); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (drag && drag !== node.id) setNav(reorderBefore(nav, drag, node.id)); setDrag(null); }}
          onDragEnd={() => setDrag(null)}>
          <span className="navmgr-grip" title={T("Drag to reorder", "ลากเพื่อจัดลำดับ")}>⠿</span>
          <span className="navmgr-ic">{node.icon}</span>
          <div className="navmgr-bd">
            <div className="navmgr-name">{T(node.en, node.label)}{hidden && <span className="navmgr-tag">{T("hidden", "ซ่อน")}</span>}</div>
            <div className="navmgr-meta mono faint">{node.id} · {LEVEL_NAME[depth] || ("L" + (depth + 1))}{node.perm ? " · " + node.perm : ""}</div>
          </div>
          <div className="navmgr-acts">
            <button type="button" className="chip-act" title={T("Move up", "เลื่อนขึ้น")} onClick={() => apply(moveUp, node.id)}>↑</button>
            <button type="button" className="chip-act" title={T("Move down", "เลื่อนลง")} onClick={() => apply(moveDown, node.id)}>↓</button>
            <button type="button" className="chip-act" title={T("Outdent", "เลื่อนออก")} disabled={!canOutdent(nav, node.id)} onClick={() => apply(outdent, node.id)}>⇤</button>
            <button type="button" className="chip-act" title={T("Indent", "เลื่อนเข้า")} disabled={!canIndent(nav, node.id)} onClick={() => apply(indent, node.id)}>⇥</button>
            <button type="button" className="chip-act" title={hidden ? T("Show", "แสดง") : T("Hide", "ซ่อน")} onClick={() => apply(toggleHidden, node.id)}>{hidden ? "🙈" : "👁"}</button>
            <button type="button" className="chip-act" title={T("Rename", "เปลี่ยนชื่อ")} onClick={() => doRename(node)}>✎</button>
          </div>
        </div>
        {(node.children || []).map(c => renderRow(c, depth + 1))}
      </React.Fragment>
    );
  };

  return (
    <div data-no-lex>
      <div className="navmgr-bar">
        <div className="sm-set-note mono">{T(`Shared for everyone — drag or ↑↓ to reorder, indent/outdent to nest up to ${MAX_DEPTH} levels, hide, rename. Hidden items leave the sidebar; their pages still open by link.`,
          `ใช้ร่วมกันทุกคน — ลาก หรือ ↑↓ จัดลำดับ · เลื่อนเข้า/ออกเพื่อซ้อนได้ถึง ${MAX_DEPTH} ระดับ · ซ่อน · เปลี่ยนชื่อ · รายการที่ซ่อนจะหายจาก sidebar แต่หน้ายังเข้าได้ผ่านลิงก์`)}</div>
        <Btn kind="ghost" sm onClick={doReset}>{T("Reset to default", "รีเซตค่าเริ่มต้น")}</Btn>
      </div>

      {nav.map(g => (
        <div key={g.group} style={{ marginBottom: 12 }}>
          <div className="navmgr-grouphead">{g.group}</div>
          {g.items.length === 0
            ? <div className="muted" style={{ fontSize: 13, padding: "8px 4px" }}>{T("No items", "ไม่มีรายการ")}</div>
            : g.items.map(it => renderRow(it, 0))}
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { NavManagerPanel });
export { NavManagerPanel };
