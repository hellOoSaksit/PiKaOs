import React from 'react';

/**
 * SaveBar — floating "unsaved changes" action bar.
 * Slides up from the bottom-center when `count > 0`; Cancel discards, Save commits.
 * Theme-safe (panel surface). Use for any batched-edit screen (permissions matrix, settings…).
 *
 * Props: count, onSave, onCancel, saveLabel, cancelLabel, label (overrides the default text).
 */
export default function SaveBar({ count = 0, onSave, onCancel, saveLabel = 'Save changes', cancelLabel = 'Cancel', label }) {
  const show = count > 0;
  return (
    <div className={'pk-savebar' + (show ? ' show' : '')} role="status" aria-hidden={!show}>
      <span className="pk-savebar-dot" />
      <span className="pk-savebar-text">{label || (count + ' unsaved change' + (count === 1 ? '' : 's'))}</span>
      <span className="pk-savebar-actions">
        <button type="button" className="pk-savebar-cancel" onClick={onCancel}>{cancelLabel}</button>
        <button type="button" className="pk-savebar-save" onClick={onSave}>{saveLabel}</button>
      </span>
    </div>
  );
}
