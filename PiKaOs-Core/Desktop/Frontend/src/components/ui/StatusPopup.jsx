import Modal from './Modal.jsx';
import Button from './Button.jsx';

const PRESETS = {
  success: { ic: '✓', cls: 'ok', title: 'Success' },
  error: { ic: '✕', cls: 'err', title: 'Something went wrong' },
  warning: { ic: '!', cls: 'warn', title: 'Heads up' },
  info: { ic: 'i', cls: 'info', title: 'For your info' },
  confirm: { ic: '?', cls: 'ask', title: 'Are you sure?' },
};

/**
 * StatusPopup — centered confirmation/alert dialog. 62px icon pops scale(.3→1.08→1).
 * type: success | error | warning | info | confirm.
 * confirm/error get a primary/danger action; confirm also a cancel.
 */
export default function StatusPopup({
  open, type = 'info', title, message, onClose,
  confirmLabel, onConfirm, cancelLabel = 'Cancel',
}) {
  const p = PRESETS[type] || PRESETS.info;
  const danger = type === 'error';
  const showCancel = type === 'confirm';
  const footer = (
    <>
      {showCancel && <Button kind="ghost" onClick={onClose}>{cancelLabel}</Button>}
      <Button
        kind={danger ? 'danger' : 'gold'}
        onClick={onConfirm || onClose}
      >
        {confirmLabel || 'OK'}
      </Button>
    </>
  );
  return (
    <Modal open={open} onClose={onClose} className="status" footer={footer}>
      <div className={'status-ic ' + p.cls}>{p.ic}</div>
      <h3>{title || p.title}</h3>
      {message && <p>{message}</p>}
    </Modal>
  );
}
