/* PiKaOs — Menu Manager panel: admin arranges the global sidebar navigation.

   Lives inside the "จัดการเครื่องมือ" (Tools) screen — system settings belong there (CLAUDE.md
   rule 2). Edits one shared config (data-nav.jsx) so the arrangement is the same for every user.
   Reorder by drag (within the same parent) or the ↑↓ buttons; nest with indent/outdent up to
   MAX_DEPTH levels (Main → Sub → Sub); hide/show; rename; reset to the code default.

   Edits are STAGED, not live: this config is shared by every user, so a stray drag must not
   rearrange everyone's sidebar mid-gesture. The panel keeps a local draft and only calls
   `Sys.setNav` (which persists) when Save is pressed; Discard drops the draft. */
import React from 'react';
const { useEffect, useMemo, useState } = React;
import { Button } from '../components/ui';
import { renderIcon } from '../components/ui/icons.jsx';
import {
  MAX_DEPTH, moveUp, moveDown, indent, outdent, canIndent, canOutdent,
  toggleHidden, rename, reorderBefore, resetNav,
} from '../data/data-nav.jsx';

const LEVEL_NAME = ["Main", "Sub", "Sub"];   // by depth (0,1,2)

function NavManagerPanel({ Sys, t }) {
  const { nav, setNav, T } = Sys;
  const tx = (typeof t === "function") ? t : ((k) => k);
  const labelOf = (node) => node.customLabel || tx("nav." + node.id);   // custom rename wins over i18n
  const [drag, setDrag] = useState(null);     // id of the row being dragged
  const [draft, setDraft] = useState(nav);    // staged arrangement — the saved one until Save

  // Adopt the saved config whenever it changes underneath us (our own save, or another admin's).
  useEffect(() => { setDraft(nav); }, [nav]);

  // The config is a small plain-JSON tree, so a serialize-compare is both correct and cheap.
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(nav), [draft, nav]);

  const apply = (fn, id) => setDraft(d => fn(d, id));

  const doRename = async (node) => {
    const cur = labelOf(node);
    const name = window.uiPrompt
      ? await window.uiPrompt({ title: T("Rename menu item", "เปลี่ยนชื่อเมนู"), placeholder: cur, value: cur })
      : window.prompt(T("Rename (blank = default)", "เปลี่ยนชื่อ (เว้นว่าง = ค่าเริ่มต้น)"), cur);
    if (name === false || name == null) return;               // cancelled (uiPrompt resolves false on cancel)
    setDraft(d => rename(d, node.id, String(name).trim()));   // "" -> revert to the i18n default
  };

  // Reset stages the default like any other edit — it lands for everyone only once Save is pressed.
  const doReset = () => setDraft(resetNav());
  const doDiscard = () => setDraft(nav);
  const doSave = () => setNav(draft);

  const renderRow = (node, depth) => {
    const hidden = !!node.hidden;
    return (
      <React.Fragment key={node.id}>
        <div className={`navmgr-row ${hidden ? "is-hidden" : ""} ${drag === node.id ? "dragging" : ""}`}
          style={{ marginLeft: depth * 22 }}
          draggable onDragStart={(e) => { setDrag(node.id); e.dataTransfer.effectAllowed = "move"; }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (drag && drag !== node.id) setDraft(d => reorderBefore(d, drag, node.id)); setDrag(null); }}
          onDragEnd={() => setDrag(null)}>
          <span className="navmgr-grip" title={T("Drag to reorder", "ลากเพื่อจัดลำดับ")}>⠿</span>
          <span className="navmgr-ic">{renderIcon(node.icon)}</span>
          <div className="navmgr-bd">
            <div className="navmgr-name">{labelOf(node)}{node.customLabel && <span className="navmgr-tag">{T("custom", "ตั้งเอง")}</span>}{hidden && <span className="navmgr-tag">{T("hidden", "ซ่อน")}</span>}</div>
            <div className="navmgr-meta mono faint">{node.id} · {LEVEL_NAME[depth] || ("L" + (depth + 1))}{node.perm ? " · " + node.perm : ""}</div>
          </div>
          <div className="navmgr-acts">
            <button type="button" className="chip-act" title={T("Move up", "เลื่อนขึ้น")} onClick={() => apply(moveUp, node.id)}>↑</button>
            <button type="button" className="chip-act" title={T("Move down", "เลื่อนลง")} onClick={() => apply(moveDown, node.id)}>↓</button>
            <button type="button" className="chip-act" title={T("Outdent", "เลื่อนออก")} disabled={!canOutdent(draft, node.id)} onClick={() => apply(outdent, node.id)}>⇤</button>
            <button type="button" className="chip-act" title={T("Indent", "เลื่อนเข้า")} disabled={!canIndent(draft, node.id)} onClick={() => apply(indent, node.id)}>⇥</button>
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
        <Button kind="ghost" size="sm" onClick={doReset}>{tx("navmgr.reset")}</Button>
      </div>

      {draft.map(g => (
        <div key={g.group} style={{ marginBottom: 12 }}>
          <div className="navmgr-grouphead">{g.group}</div>
          {g.items.length === 0
            ? <div className="muted" style={{ fontSize: 13, padding: "8px 4px" }}>{T("No items", "ไม่มีรายการ")}</div>
            : g.items.map(it => renderRow(it, 0))}
        </div>
      ))}

      {/* Nothing above this line has touched the shared config — Save is the only writer. */}
      <div className="navmgr-bar navmgr-save">
        <span className={`navmgr-dirty ${dirty ? "on" : ""}`}>{dirty ? tx("navmgr.unsaved") : tx("navmgr.saved")}</span>
        <Button kind="ghost" size="sm" disabled={!dirty} onClick={doDiscard}>{tx("navmgr.discard")}</Button>
        <Button kind="gold" size="sm" disabled={!dirty} onClick={doSave}>{tx("navmgr.save")}</Button>
      </div>
    </div>
  );
}

Object.assign(window, { NavManagerPanel });
export { NavManagerPanel };
