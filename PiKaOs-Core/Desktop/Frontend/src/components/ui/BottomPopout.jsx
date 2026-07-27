import { createPortal } from 'react-dom';

/** The class list is exported separately so a node-environment test can pin the open/closed
 *  contract without a DOM (createPortal needs a real document). */
export function popoutClass(open, className = '') {
  return ['pk-popout', open ? 'show' : '', className].filter(Boolean).join(' ');
}

/**
 * BottomPopout — the app's ONE transient bottom slot: a centred bar that slides into the gap
 * above the floating utility bar. SaveBar is its first tenant; confirm/undo bars are next.
 * Portaled to <body> for the same reason Tooltip is — no screen's overflow or stacking context
 * can clip or cage it. The gap itself comes from --ub-clearance (owned by shell.css beside the
 * utility bar), so the offset cannot drift from the bar it must clear.
 */
export default function BottomPopout({ open, className = '', role = 'status', children }) {
  return createPortal(
    <div className={popoutClass(open, className)} role={role} aria-hidden={!open}>
      {children}
    </div>,
    document.body,
  );
}
