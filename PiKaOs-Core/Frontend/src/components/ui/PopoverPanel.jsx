import React, { useEffect } from 'react';

/**
 * Generic popout shell used by the utility bar's search/notifications/chat/
 * profile buttons — the DC markup (Bottom Utility Bar.dc.html) repeats this
 * shell 4× nearly verbatim; this component + a children slot replaces that
 * duplication. Positioned relative to its parent (caller wraps the trigger
 * button + this panel in a `position:relative` container).
 *
 * Outside-click-to-close is handled by the caller's full-screen
 * `.utility-bar-overlay` (see BottomUtilityBar), not here — a document-level
 * `mousedown` listener in this component would fire before the trigger
 * button's own `click` handler runs, racing with `togglePop` and immediately
 * reopening the popover it just closed.
 */
export function PopoverPanel({ open, onClose, anchor = 'right', width = 320, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className={'popover-panel anchor-' + anchor} style={{ width }}>
      {children}
    </div>
  );
}
