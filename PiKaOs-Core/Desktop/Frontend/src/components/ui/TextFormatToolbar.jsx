import { useState } from 'react';

/**
 * TextFormatToolbar — B/I/U independent toggles + alignment radio group.
 * Reports state via onChange({ b, i, u, align }). Includes a live sample if `sample`.
 */
export default function TextFormatToolbar({ sample = 'The quick brown fox jumps over the lazy dog.', onChange }) {
  const [fmt, setFmt] = useState({ b: false, i: false, u: false, align: 'l' });
  const set = (patch) => { const next = { ...fmt, ...patch }; setFmt(next); onChange && onChange(next); };
  const toggle = (k) => set({ [k]: !fmt[k] });

  const sampleCls = [
    'fmt-sample',
    fmt.b && 'f-b', fmt.i && 'f-i', fmt.u && 'f-u',
    fmt.align === 'c' && 'al-c', fmt.align === 'r' && 'al-r',
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div className="fmt-toolbar" role="toolbar">
        <button type="button" className={fmt.b ? 'on' : ''} onClick={() => toggle('b')} style={{ fontWeight: 800 }}>B</button>
        <button type="button" className={fmt.i ? 'on' : ''} onClick={() => toggle('i')} style={{ fontStyle: 'italic' }}>I</button>
        <button type="button" className={fmt.u ? 'on' : ''} onClick={() => toggle('u')} style={{ textDecoration: 'underline' }}>U</button>
        <span className="sep" />
        <button type="button" className={fmt.align === 'l' ? 'on' : ''} onClick={() => set({ align: 'l' })}>↤</button>
        <button type="button" className={fmt.align === 'c' ? 'on' : ''} onClick={() => set({ align: 'c' })}>↔</button>
        <button type="button" className={fmt.align === 'r' ? 'on' : ''} onClick={() => set({ align: 'r' })}>↦</button>
      </div>
      {sample && <p className={sampleCls} style={{ marginTop: 14 }}>{sample}</p>}
    </div>
  );
}
