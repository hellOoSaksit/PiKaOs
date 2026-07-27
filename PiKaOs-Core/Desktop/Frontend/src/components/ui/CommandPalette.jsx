/* Menu command palette — Ctrl+K / the title-bar magnifier. Finds SCREENS (nav items), never
   documents: matching runs over every shipped language pack (CommandPalette.logic.js), so an
   English query finds a Thai-labelled menu. Renders inside the Modal primitive — Esc, the focus
   trap, and autofocus-on-open (the input is the first focusable) all come from there; this file
   adds only ArrowUp/ArrowDown/Enter. Per-file imports on purpose: the ui barrel reaches lib/i18n,
   which touches window at module scope (see LocalMcp.jsx's header note). */
import React from 'react';
const { useEffect, useMemo, useState } = React;
import Modal from './Modal.jsx';
import { renderIcon } from './icons.jsx';
import { I18N_PACKS } from '../../lib/i18n.jsx';
import { buildIndex, searchIndex } from './CommandPalette.logic.js';

export function CommandPalette({ open, onClose, nav, t, can, go }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  // fresh query every open — a palette that remembers last session's filter reads as broken
  useEffect(() => { if (open) { setQ(''); setActive(0); } }, [open]);

  const index = useMemo(() => buildIndex(nav, {
    packs: I18N_PACKS,
    label: (it) => it.customLabel || t('nav.' + it.id),
    can,
    isDesktop: !!window.pikaosDesktop?.isDesktop,
  }), [nav, t, can]);
  const results = useMemo(() => searchIndex(index, q), [index, q]);

  const choose = (entry) => { if (!entry) return; go(entry.id); onClose(); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') choose(results[active]);
  };

  return (
    <Modal open={open} onClose={onClose} className="palette-modal">
      <input className="palette-input" value={q} placeholder={t('palette.placeholder')}
        aria-label={t('palette.placeholder')}
        onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} />
      <div className="palette-list" role="listbox">
        {results.length === 0
          ? <div className="palette-empty faint">{t('palette.empty')}</div>
          : results.map((r, i) => (
            <button key={r.id} type="button" role="option" aria-selected={i === active}
              className={'palette-row' + (i === active ? ' active' : '')}
              onMouseEnter={() => setActive(i)} onClick={() => choose(r)}>
              <span className="palette-ic">{renderIcon(r.icon)}</span>
              <span className="palette-label">{r.label}</span>
              {r.crumb && <span className="palette-crumb faint">{r.crumb}</span>}
            </button>
          ))}
      </div>
    </Modal>
  );
}
