import React, { useEffect, useRef } from 'react';

/**
 * Generic popout shell used by the utility bar's search/notifications/chat/
 * profile buttons — the DC markup (Bottom Utility Bar.dc.html) repeats this
 * shell 4× nearly verbatim; this component + a children slot replaces that
 * duplication. Positioned relative to its parent (caller wraps the trigger
 * button + this panel in a `position:relative` container).
 */
export function PopoverPanel({ open, onClose, anchor = 'right', width = 320, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={'popover-panel anchor-' + anchor} style={{ width }}>
      {children}
    </div>
  );
}
