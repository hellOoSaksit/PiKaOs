import { useRef, useState, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

/** Tooltip — dark bubble on hover/focus. The bubble is PORTALED to <body> with position:fixed so it
 *  can never be clipped by an ancestor's overflow (e.g. the sidebar) or the window edge. JS anchors it
 *  to the control's rect: it flips BELOW when there's no room above (title-bar buttons at the top),
 *  and --tip-dx nudges it back on-screen if it would overflow left/right.
 *  The wrapper takes NO tab stop by default: onFocus/onBlur see focusin/focusout bubbling up from a
 *  focusable child (button/link), so keyboard focus still shows the tip without a second stop. Pass
 *  `focusable` only when the wrapped content is itself non-focusable (e.g. a plain rail icon span). */
export default function Tooltip({ label, children, className = '', focusable = false }) {
  const ref = useRef(null);
  const bubbleRef = useRef(null);
  const [tip, setTip] = useState(null);   // { cx, y, below } while shown, else null

  const show = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 8, BUBBLE_H = 30;                       // approx bubble height for the above/below choice
    const below = r.top - BUBBLE_H - GAP < 0;           // no room above → hang it below the control
    setTip({ cx: r.left + r.width / 2, y: below ? r.bottom + GAP : r.top - GAP, below });
  }, []);
  const hide = useCallback(() => setTip(null), []);

  // After the bubble lands (centred on the control), clamp it horizontally so it stays on-screen.
  useLayoutEffect(() => {
    const b = bubbleRef.current;
    if (!b) return;
    b.style.setProperty('--tip-dx', '0px');
    const r = b.getBoundingClientRect();
    const PAD = 8;
    let dx = 0;
    if (r.left < PAD) dx = PAD - r.left;
    else if (r.right > window.innerWidth - PAD) dx = window.innerWidth - PAD - r.right;
    if (dx) b.style.setProperty('--tip-dx', `${Math.round(dx)}px`);
  }, [tip]);

  return (
    <span className={'tip' + (className ? ' ' + className : '')} ref={ref} tabIndex={focusable ? 0 : undefined}
      onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {tip && createPortal(
        <span ref={bubbleRef} role="tooltip" className={'tip-portal' + (tip.below ? ' tip-below' : '')}
          style={{ left: tip.cx, top: tip.y }}>{label}</span>,
        document.body)}
    </span>
  );
}
