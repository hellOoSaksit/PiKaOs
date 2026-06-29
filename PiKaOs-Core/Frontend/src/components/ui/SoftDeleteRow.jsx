import { useEffect, useRef, useState } from 'react';

/**
 * SoftDeleteRow — canonical destructive flow: 🗑 → (parent shows countdown modal) →
 * soft delete → 5s undo bar → permanent. This component renders ONE row and manages
 * its own soft-delete + undo timer. onPurge() fires when the 5s elapses without undo.
 *
 * Pass `armed` to skip straight to soft-deleted (e.g. after a confirm modal),
 * or call the returned handlers. Simplest usage: handles its own delete on 🗑 click,
 * assuming the confirm happened elsewhere — set confirmFirst={false}.
 */
export default function SoftDeleteRow({ icon = '📄', title, meta, undoSeconds = 5, onDelete, onUndo, onPurge }) {
  const [state, setState] = useState('idle'); // idle | deleted | removing
  const [left, setLeft] = useState(undoSeconds);
  const timer = useRef(null);
  const ticker = useRef(null);

  const startDelete = () => {
    setState('deleted'); setLeft(undoSeconds);
    onDelete && onDelete();
    ticker.current = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    timer.current = setTimeout(() => {
      clearInterval(ticker.current);
      setState('removing');
      setTimeout(() => { setState('gone'); onPurge && onPurge(); }, 300);
    }, undoSeconds * 1000);
  };
  const undo = () => {
    clearTimeout(timer.current); clearInterval(ticker.current);
    setState('idle'); onUndo && onUndo();
  };
  useEffect(() => () => { clearTimeout(timer.current); clearInterval(ticker.current); }, []);

  if (state === 'gone') return null;

  return (
    <div className={'sd-row' + (state === 'deleted' ? ' deleted' : '') + (state === 'removing' ? ' removing' : '')}>
      <span className="sd-ic">{icon}</span>
      <div className="sd-main">
        <div className="sd-title">{title}</div>
        {meta && <div className="sd-meta">{meta}</div>}
      </div>
      {state === 'idle' ? (
        <button type="button" className="sd-del" onClick={startDelete} aria-label="delete">🗑</button>
      ) : (
        <div className="sd-undo">
          <span className="sd-count">{left}</span>
          <div className="sd-timer"><div className="sd-timer-fill" style={{ width: '100%', transition: `width ${undoSeconds}s linear`, animation: 'none' }} ref={(el) => { if (el) requestAnimationFrame(() => { el.style.width = '0%'; }); }} /></div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={undo}>Undo</button>
        </div>
      )}
    </div>
  );
}
