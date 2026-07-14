import { useEffect, useMemo, useRef, useState } from 'react';

function mark(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (<>{text.slice(0, i)}<mark className="hl">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>);
}

/**
 * Search — field (🔍 + ⌘K hint + clear ✕) with a results popover.
 * items: [{ icon, title, meta, type }]. Live-filters by title/meta, highlights matches,
 * ↑/↓ move active row, Enter selects, Esc/outside close. onSelect(item).
 */
export default function Search({ items = [], placeholder = 'Search tickets, people, files…', onSelect }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const ref = useRef(null);

  const results = useMemo(() => {
    if (!q) return items.slice(0, 6);
    const s = q.toLowerCase();
    return items.filter((it) => (it.title + ' ' + (it.meta || '')).toLowerCase().includes(s));
  }, [q, items]);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (it) => { onSelect && onSelect(it); setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter' && results[active]) choose(results[active]);
  };

  return (
    <div className={'search' + (open ? ' open' : '') + (q ? ' has-text' : '')} ref={ref}>
      <div className="search-field">
        <span className="search-ic">🔍</span>
        <input
          className="search-input" value={q} placeholder={placeholder}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)} onKeyDown={onKey}
        />
        <span className="search-kbd">⌘K</span>
        <button type="button" className="search-clear" onClick={() => { setQ(''); setActive(0); }} aria-label="clear">✕</button>
      </div>
      <div className="search-results" role="listbox">
        <div className="search-group-lbl">{q ? results.length + ' results' : 'Recent'}</div>
        {results.length === 0 ? (
          <div className="search-empty">No matches for <span className="q">{q}</span></div>
        ) : results.map((it, i) => (
          <button
            key={i}
            type="button"
            className={'search-res' + (i === active ? ' active' : '')}
            onMouseEnter={() => setActive(i)}
            onClick={() => choose(it)}
          >
            {it.icon && <span className="search-res-ic">{it.icon}</span>}
            <span className="search-res-main">
              <span className="search-res-title">{mark(it.title, q)}</span>
              {it.meta && <span className="search-res-meta">{it.meta}</span>}
            </span>
            {it.type && <span className="qbadge st-queued">{it.type}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
