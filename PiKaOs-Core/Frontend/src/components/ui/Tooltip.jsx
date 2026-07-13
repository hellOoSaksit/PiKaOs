import { useRef, useState } from 'react';

/** Tooltip — dark bubble that springs in on hover/focus. Stays on-screen near any viewport edge:
 *  it flips BELOW the control when there's no room above (title-bar buttons sit at the very top, so
 *  an above-bubble would render off the top edge), and shifts horizontally via --tip-dx so an edge
 *  control's bubble never overflows left/right (the arrow counter-shifts to keep pointing at it). */
export default function Tooltip({ label, children, className = '' }) {
  const bubble = useRef(null);
  const [below, setBelow] = useState(false);
  const place = () => {
    const el = bubble.current;
    if (!el) return;
    const trigger = el.parentElement;
    const tr = trigger.getBoundingClientRect();
    setBelow(tr.top - el.offsetHeight - 10 < 0);         // no room above → render below the control
    el.style.setProperty('--tip-dx', '0px');             // reset before measuring the horizontal fit
    const r = el.getBoundingClientRect();
    const pad = 8;
    let dx = 0;
    if (r.left < pad) dx = pad - r.left;                 // overflowing the left edge → push right
    else if (r.right > window.innerWidth - pad) dx = window.innerWidth - pad - r.right;  // right edge → push left
    el.style.setProperty('--tip-dx', dx ? `${Math.round(dx)}px` : '0px');
  };
  return (
    <span className={'tip' + (below ? ' tip-below' : '') + (className ? ' ' + className : '')} tabIndex={0} onMouseEnter={place} onFocus={place}>
      {children}
      <span className="tip-bubble" role="tooltip" ref={bubble}>{label}</span>
    </span>
  );
}
