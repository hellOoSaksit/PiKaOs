import { useRef } from 'react';

/** Tooltip — dark bubble above the element, springs in on hover/focus. Clamps horizontally so a
 *  bubble on a control near the screen edge (e.g. the leftmost title-bar button) never renders
 *  off-screen: on show we measure the bubble and shift it back inside the viewport via --tip-dx,
 *  counter-shifting the arrow so it still points at the control. */
export default function Tooltip({ label, children, className = '' }) {
  const bubble = useRef(null);
  const clamp = () => {
    const el = bubble.current;
    if (!el) return;
    el.style.setProperty('--tip-dx', '0px');            // reset before measuring
    const r = el.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    if (r.left < pad) dx = pad - r.left;                 // overflowing the left edge → push right
    else if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;  // right edge → push left
    if (dx) el.style.setProperty('--tip-dx', `${Math.round(dx)}px`);
  };
  return (
    <span className={'tip' + (className ? ' ' + className : '')} tabIndex={0} onMouseEnter={clamp} onFocus={clamp}>
      {children}
      <span className="tip-bubble" role="tooltip" ref={bubble}>{label}</span>
    </span>
  );
}
