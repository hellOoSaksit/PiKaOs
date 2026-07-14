import { useMemo, useState } from 'react';
import { MultiSelect } from './Dropdown.jsx';

/**
 * Filter — search box + multi-select facets combine live over `rows`.
 * rows: [{ icon, title, meta, status, priority }].
 * facets: [{ key, label, options:[{value,label}] }] — each maps to a row field.
 * Active facet chips + clear-all + matched/total count; re-renders the row list.
 */
export default function Filter({ rows = [], facets = [] }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState({}); // { facetKey: [values] }

  const setFacet = (key, values) => setSel((s) => ({ ...s, [key]: values }));
  const clearAll = () => { setSel({}); setQ(''); };

  const active = facets.flatMap((f) => (sel[f.key] || []).map((v) => ({ key: f.key, value: v, label: (f.options.find((o) => o.value === v) || {}).label || v })));

  const matched = useMemo(() => rows.filter((r) => {
    if (q && !(r.title + ' ' + (r.meta || '')).toLowerCase().includes(q.toLowerCase())) return false;
    for (const f of facets) {
      const vals = sel[f.key] || [];
      if (vals.length && !vals.includes(r[f.key])) return false;
    }
    return true;
  }), [rows, q, sel, facets]);

  return (
    <div>
      <div className="filter-bar">
        <div className="search has-text" style={{ maxWidth: 240 }}>
          <div className="search-field">
            <span className="search-ic">🔍</span>
            <input className="search-input" value={q} placeholder="Search items…" onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        {facets.map((f) => (
          <MultiSelect key={f.key} label={f.label} options={f.options} values={sel[f.key] || []} onChange={(v) => setFacet(f.key, v)} />
        ))}
      </div>

      <div className="filter-active">
        <span className="filter-active-lbl">Filters</span>
        {active.map((a) => (
          <span key={a.key + a.value} className="pk-tag t-gold">
            {a.label}
            <button type="button" className="x" onClick={() => setFacet(a.key, (sel[a.key] || []).filter((x) => x !== a.value))}>✕</button>
          </span>
        ))}
        {(active.length > 0 || q) && <button type="button" className="filter-clear" onClick={clearAll}>Clear all</button>}
        <span className="filter-count">{matched.length} of {rows.length}</span>
      </div>

      {matched.length === 0 ? (
        <div className="filter-empty">No items match those filters.</div>
      ) : (
        <div className="filter-list">
          {matched.map((r, i) => (
            <div key={i} className="filter-row">
              {r.icon && <span className="filter-row-ic">{r.icon}</span>}
              <div className="filter-row-main">
                <span className="filter-row-title">{r.title}</span>
                {r.meta && <span className="filter-row-meta">{r.meta}</span>}
              </div>
              <div className="filter-row-badges">
                {r.status && <span className={'qbadge st-' + r.status}>{r.status}</span>}
                {r.priority && <span className={'qbadge pr-' + r.priority}>{r.priority}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
