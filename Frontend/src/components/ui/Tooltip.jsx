/** Tooltip — dark bubble above the element, springs in on hover/focus. */
export default function Tooltip({ label, children, className = '' }) {
  return (
    <span className={'tip' + (className ? ' ' + className : '')} tabIndex={0}>
      {children}
      <span className="tip-bubble" role="tooltip">{label}</span>
    </span>
  );
}
