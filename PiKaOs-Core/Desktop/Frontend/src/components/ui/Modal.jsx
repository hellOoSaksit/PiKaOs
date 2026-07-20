import { useEffect, useRef } from 'react';
import { focusables, nextTrapTarget } from './focus-trap.js';

/**
 * Modal — overlay (blur) + spring-pop dialog. Controlled via `open`.
 * Esc / overlay-click → onClose; pass `showClose` for a built-in ✕ in the header.
 * footer is right-aligned (pass via `footer`). While open it traps Tab focus inside
 * the dialog and restores focus to the previously-focused element on close (a11y).
 * Reduced-motion is handled in CSS.
 * Modal has no `Sys`/`t` in scope (Core primitive), so the ✕ button's accessible name
 * must come from the caller via `closeLabel` — no hardcoded literal here (i18n hard rule).
 */
export default function Modal({ open, onClose, title, children, footer, showClose = false, closeLabel, className = '' }) {
  const ref = useRef(null);

  // Escape closes; Tab/Shift+Tab is trapped inside the dialog.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') { onClose && onClose(); return; }
      if (e.key === 'Tab') {
        const target = nextTrapTarget(focusables(ref.current), document.activeElement, e.shiftKey);
        if (target) { e.preventDefault(); target.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // On open, remember what had focus and move focus into the dialog; restore on close/unmount.
  useEffect(() => {
    if (!open) return;
    const restore = document.activeElement;
    focusables(ref.current)[0]?.focus();
    return () => { restore && restore.focus && restore.focus(); };
  }, [open]);

  return (
    <div className={'pk-overlay' + (open ? ' open' : '')} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose && onClose(); }}>
      <div ref={ref} className={'pk-modal' + (className ? ' ' + className : '')} role="dialog" aria-modal="true">
        {showClose && onClose
          ? <div className="pk-modal-head">
              {title && <h3>{title}</h3>}
              <button type="button" className="pk-modal-close" onClick={onClose} aria-label={closeLabel || undefined}>✕</button>
            </div>
          : title && <h3>{title}</h3>}
        {typeof children === 'string' ? <p>{children}</p> : children}
        {footer && <div className="foot">{footer}</div>}
      </div>
    </div>
  );
}
