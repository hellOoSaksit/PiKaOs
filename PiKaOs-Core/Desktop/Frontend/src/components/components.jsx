/* PiKaOs — ES module (migrated from PiKaOs-Core/components.jsx). */
import React from 'react';

/* ============================================================
   SHARED UI PRIMITIVES
   ============================================================ */

/* `disabled` is forwarded — it used to be accepted and silently dropped, so every caller that wrote
   `disabled={busy}` still fired its onClick. `.btn:disabled` styling has existed all along, which is
   how the omission stayed invisible. `type="button"` because a bare <button> inside a <form> submits. */
function Btn({ kind = "gold", sm, icon, children, onClick, style, title, disabled }) {
  return (
    <button type="button" className={`btn btn-${kind} ${sm ? "btn-sm" : ""}`}
      onClick={onClick} style={style} title={title} disabled={disabled}>
      {icon && <span>{icon}</span>}{children}
    </button>
  );
}

Object.assign(window, { Btn });

export { Btn };
