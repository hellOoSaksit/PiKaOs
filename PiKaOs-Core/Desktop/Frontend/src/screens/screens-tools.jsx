/* PiKaOs — Manage Tools (admin). System-level arrangement lives here (CLAUDE.md rule 2).

   Once a catalog of tool/LLM/storage/position/skill panels; those served the agent-builder screens
   that Phase 2.1 deleted, so they were configuring nothing and were removed with the state they
   owned (`lib/characters.jsx`, the `options`/`skill_docs`/`tool_cfgs` global blobs). What remains is
   the sidebar arrangement — the one thing on this screen a kernel-only Core still has to manage.

   The section card stays because plugins will hang their own settings panels here. */
import React from 'react';
const { useState } = React;
import { NavManagerPanel } from './screens-nav.jsx';
import { PageHead } from '../components/components.jsx';
import { Icon } from '../components/ui/icons.jsx';

/* A collapsible settings card. `count` and `onAdd` are optional: `onAdd` renders a ＋ in the header
   (top-right) that opens the section and fires — so every section's "create" lives in the same spot. */
function ToolSection({ icon, title, kicker, count, onAdd, addTitle, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const toggle = () => setOpen(o => !o);
  return (
    <section className={`tsec ${open ? "open" : ""}`}>
      <div className="tsec-head" role="button" tabIndex={0} aria-expanded={open}
        onClick={toggle} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); } }}>
        <span className="tsec-ic">{icon}</span>
        <span className="tsec-title">{title}</span>
        <span className="tsec-kicker mono">{kicker}</span>
        <span className="tsec-right" data-no-lex>
          {count != null && <span className="tsec-count mono">{count}</span>}
          {onAdd && <button type="button" className="tsec-add" title={addTitle} aria-label={addTitle}
            onClick={e => { e.stopPropagation(); setOpen(true); onAdd(); }}>＋</button>}
          <span className="tsec-chev">▾</span>
        </span>
      </div>
      <div className="tsec-wrap">
        <div className="tsec-inner"><div className="tsec-body">{children}</div></div>
      </div>
    </section>
  );
}

export function ToolsManager({ can, t, Sys }) {
  const mayEdit = !can || can("options.manage");
  const tx = t || ((k) => k);

  return (
    <div className="content-pad fade-in">
      <PageHead kicker={tx("tools.kicker")} title={tx("tools.title")} desc={tx("tools.desc")} />

      {/* The only section, so it opens on arrival rather than making the page look empty. */}
      {mayEdit && Sys && (
        <ToolSection icon={<Icon name="menu" />} title={tx("nav.navmgr")} kicker="MENU ORDER" defaultOpen>
          <NavManagerPanel Sys={Sys} t={t} />
        </ToolSection>
      )}
    </div>
  );
}

Object.assign(window, { ToolsManager });
