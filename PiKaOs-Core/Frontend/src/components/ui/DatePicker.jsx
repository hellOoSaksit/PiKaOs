import { useEffect, useRef, useState } from 'react';

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const DOW = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const fmt = (d) => `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

function relLabel(d) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(d); t.setHours(0, 0, 0, 0);
  const days = Math.round((t - today) / 86400000);
  if (days === 0) return '· today';
  if (days === 1) return '· tomorrow';
  if (days === -1) return '· yesterday';
  if (days > 0) return `· in ${days} days`;
  return `· ${-days} days ago`;
}

/**
 * DatePicker — trigger shows mono DD MMM YYYY; calendar pops in a .dd-menu.
 * today = gold ring, selected = solid gold pill. value/onChange are Date objects.
 */
export default function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => (value ? new Date(value) : new Date()));
  const ref = useRef(null);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey); };
  }, []);

  const y = view.getFullYear(), m = view.getMonth();
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push({ dim: true, n: new Date(y, m, i - startDow + 1).getDate() });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ n: d, date: new Date(y, m, d) });

  const sameDay = (a, b) => a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  return (
    <div className={'dd' + (open ? ' open' : '')} ref={ref}>
      <button type="button" className="dd-btn date-btn" style={{ minWidth: 190 }} onClick={() => setOpen((o) => !o)}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
          <span className="d-ic">📅</span>
          <span className="dd-value">{value ? fmt(new Date(value)) : 'PICK A DATE'}</span>
        </span>
        <span className="dd-caret">▼</span>
      </button>
      <div className="dd-menu">
        <div className="cal">
          <div className="cal-head">
            <span className="cal-title">{MONTHS[m]} {y}</span>
            <div className="cal-nav">
              <button type="button" onClick={() => setView(new Date(y, m - 1, 1))}>◀</button>
              <button type="button" onClick={() => setView(new Date(y, m + 1, 1))}>▶</button>
            </div>
          </div>
          <div className="cal-grid">
            {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
            {cells.map((c, i) => (
              <button
                key={i}
                type="button"
                className={'cal-day' + (c.dim ? ' dim' : '') + (!c.dim && sameDay(c.date, today) ? ' today' : '') + (!c.dim && sameDay(c.date, value && new Date(value)) ? ' sel' : '')}
                onClick={() => { if (!c.dim) { onChange && onChange(c.date); setOpen(false); } }}
                disabled={c.dim}
              >
                {c.n}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export { fmt as formatDate, relLabel };
