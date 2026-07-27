import React from 'react';
import BottomPopout from './BottomPopout.jsx';

/**
 * SaveBar — "unsaved changes" action bar. Renders in the shared bottom slot (BottomPopout),
 * sliding into the gap above the floating utility bar when `count > 0`; Cancel discards, Save commits.
 * Theme-safe (panel surface). Use for any batched-edit screen (permissions matrix, settings…).
 *
 * Props: count, onSave, onCancel, saveLabel, cancelLabel, label (overrides the default text).
 */
export default function SaveBar({ count = 0, onSave, onCancel, saveLabel = 'Save changes', cancelLabel = 'Cancel', label }) {
  const show = count > 0;
  return (
    <BottomPopout open={show} className="pk-savebar">
      <span className="pk-savebar-dot" />
      <span className="pk-savebar-text">{label || (count + ' unsaved change' + (count === 1 ? '' : 's'))}</span>
      <span className="pk-savebar-actions">
        <button type="button" className="pk-savebar-cancel" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="pk-savebar-save" onClick={onSave}>{saveLabel}</button>
      </span>
    </BottomPopout>
  );
}
