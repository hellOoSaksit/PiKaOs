/**
 * Field — labelled control. With `children`, wraps them (any control); without, renders its own input.
 * hint: small text beside the label. error: crimson ring + message below.
 */
export default function Field({ label, hint, error, id, className = '', children, ...rest }) {
  return (
    <div className={'bf' + (error ? ' has-error' : '') + (className ? ' ' + className : '')}>
      {label && <label className="bf-label" htmlFor={id}>{label}{hint && <span className="bf-hint">{hint}</span>}</label>}
      {children != null ? children : <input className="bf-input" id={id} {...rest} />}
      {error && <span className="bf-error">{error}</span>}
    </div>
  );
}
