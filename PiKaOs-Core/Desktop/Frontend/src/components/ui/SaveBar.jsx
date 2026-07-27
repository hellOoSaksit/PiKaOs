import { useEffect, useId, useState } from 'react';
import BottomPopout from './BottomPopout.jsx';
import { renderIcon } from './icons.jsx';

/**
 * SaveBar — "unsaved changes" action bar. Renders in the shared bottom slot (BottomPopout),
 * sliding into the gap above the floating utility bar when `count > 0`; Cancel discards, Save commits.
 * Theme-safe (panel surface). Use for any batched-edit screen (permissions matrix, settings…).
 *
 * Props: count, onSave, onCancel, saveLabel, cancelLabel, label (overrides the default text),
 * details (optional node for the expandable disclosure), detailsLabel/detailsHideLabel (the
 * toggle's accessible name in each state). `details` is purely presentational and optional —
 * omit it and the bar behaves exactly as before, with no toggle rendered at all.
 */
export default function SaveBar({
  count = 0, onSave, onCancel, saveLabel = 'Save changes', cancelLabel = 'Cancel', label,
  details, detailsLabel, detailsHideLabel,
}) {
  const show = count > 0;
  const detailsId = useId();
  const [expanded, setExpanded] = useState(false);

  // A new batch of changes must never reopen pre-expanded — reset to collapsed every time
  // the bar transitions from hidden to shown.
  useEffect(() => { if (show) setExpanded(false); }, [show]);

  const hasDetails = details != null;

  return (
    <BottomPopout open={show} className="pk-savebar">
      <div className="pk-popout-row">
        <span className="pk-savebar-dot" />
        <span className="pk-savebar-text">{label || (count + ' unsaved change' + (count === 1 ? '' : 's'))}</span>
        {hasDetails && (
          <button type="button" className="pk-savebar-toggle" aria-expanded={expanded} aria-controls={detailsId}
            aria-label={expanded ? detailsHideLabel : detailsLabel} onClick={() => setExpanded(v => !v)}>
            {renderIcon('chevron-right')}
          </button>
        )}
        <span className="pk-savebar-actions">
          <button type="button" className="pk-savebar-cancel" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="pk-savebar-save" onClick={onSave}>{saveLabel}</button>
        </span>
      </div>
      {hasDetails && expanded && (
        <div id={detailsId} className="pk-savebar-details">{details}</div>
      )}
    </BottomPopout>
  );
}
