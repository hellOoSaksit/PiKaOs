import { useRef, useState } from 'react';

/**
 * Tags — input that holds chips. Enter adds, Backspace on empty removes last.
 * Removal plays the shrink-fade before drop. accent: chips use the t-gold tint.
 */
export default function Tags({ value = [], onChange, placeholder = 'Add tag…', accent = false }) {
  const [draft, setDraft] = useState('');
  const [leaving, setLeaving] = useState(null);
  const inputRef = useRef(null);

  const add = (t) => {
    const v = t.trim();
    if (!v || value.includes(v)) { setDraft(''); return; }
    onChange && onChange([...value, v]);
    setDraft('');
  };
  const remove = (t) => {
    setLeaving(t);
    setTimeout(() => { onChange && onChange(value.filter((x) => x !== t)); setLeaving(null); }, 160);
  };
  const onKey = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); add(draft); }
    else if (e.key === 'Backspace' && !draft && value.length) remove(value[value.length - 1]);
  };

  return (
    <div className="tag-input" onClick={() => inputRef.current && inputRef.current.focus()}>
      {value.map((t) => (
        <span key={t} className={'pk-tag' + (accent ? ' t-gold' : '') + (leaving === t ? ' leaving' : '')}>
          {t}
          <button type="button" className="x" onClick={(e) => { e.stopPropagation(); remove(t); }} aria-label={'remove ' + t}>✕</button>
        </span>
      ))}
      <input
        ref={inputRef}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
      />
    </div>
  );
}
