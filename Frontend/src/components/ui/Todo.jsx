import { useMemo, useState } from 'react';
import Progress from './Progress.jsx';
import Checkbox from './Checkbox.jsx';
import Button from './Button.jsx';

let _id = 0;
const uid = () => 'td' + (++_id);

/**
 * Todo — head (title + done/total + mini progress), add row, list.
 * Checked tints emerald + strike; ✕ slides out. Self-contained state.
 */
export default function Todo({ title = 'Tasks', initial = [] }) {
  const [items, setItems] = useState(() => initial.map((t) => (typeof t === 'string' ? { id: uid(), text: t, done: false } : { id: uid(), ...t })));
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(null);
  const [removing, setRemoving] = useState(null);

  const done = items.filter((i) => i.done).length;
  const pct = items.length ? (done / items.length) * 100 : 0;

  const add = () => {
    const v = draft.trim();
    if (!v) return;
    const id = uid();
    setItems((l) => [...l, { id, text: v, done: false }]);
    setAdding(id); setDraft('');
    setTimeout(() => setAdding(null), 400);
  };
  const toggle = (id) => setItems((l) => l.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  const remove = (id) => {
    setRemoving(id);
    setTimeout(() => { setItems((l) => l.filter((i) => i.id !== id)); setRemoving(null); }, 300);
  };

  return (
    <div className="todo">
      <div className="todo-head">
        <div className="l"><b>{title}</b><span className="todo-count">{done}/{items.length}</span></div>
        <Progress className="todo-prog" value={pct} hideLabel />
      </div>
      <div className="todo-add">
        <input className="bf-input" value={draft} placeholder="Add a task…" onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <Button kind="gold" onClick={add}>Add</Button>
      </div>
      {items.length === 0 ? (
        <div className="todo-empty">Nothing here yet — add your first task.</div>
      ) : (
        <ul className="todo-list">
          {items.map((it) => (
            <li key={it.id} className={'todo-item' + (it.done ? ' done' : '') + (adding === it.id ? ' adding' : '') + (removing === it.id ? ' removing' : '')}>
              <Checkbox checked={it.done} onChange={() => toggle(it.id)} />
              <span className="todo-text">{it.text}</span>
              {it.priority && <span className={'qbadge ' + it.priority}>{it.priorityLabel || it.priority}</span>}
              <button type="button" className="sd-del" onClick={() => remove(it.id)} aria-label="delete">✕</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
