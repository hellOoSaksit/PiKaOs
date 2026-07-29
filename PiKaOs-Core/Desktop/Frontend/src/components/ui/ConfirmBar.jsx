import BottomPopout from './BottomPopout.jsx';

/**
 * ConfirmBar — BottomPopout's second tenant (SaveBar was the first): a one-shot "are you sure"
 * for an action that takes effect the instant it is confirmed and has no undo.
 *
 * It lives in the shared bottom slot rather than being placed by hand, for the reason that slot
 * exists at all: a fixed bar positioned independently collided with the floating utility bar and
 * rendered *behind* it, which no unit test could see. Anchoring on --ub-clearance means this bar
 * cannot drift from the bar it has to clear.
 *
 * role="alert" and not "alertdialog" on purpose — an alertdialog promises focus management this
 * bar does not implement, and claiming it would mislead a screen-reader user rather than help them.
 */
export default function ConfirmBar({ open, message, confirmLabel, cancelLabel, onConfirm, onCancel }) {
  return (
    <BottomPopout open={open} className="pk-savebar" role="alert">
      <div className="pk-popout-row">
        <span className="pk-savebar-dot" />
        <span className="pk-savebar-text">{message}</span>
        <span className="pk-savebar-actions">
          <button type="button" className="pk-savebar-cancel" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className="pk-savebar-save" onClick={onConfirm}>{confirmLabel}</button>
        </span>
      </div>
    </BottomPopout>
  );
}
