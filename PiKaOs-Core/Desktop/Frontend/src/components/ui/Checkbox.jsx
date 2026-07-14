const CheckSVG = () => (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 12.5L10 17.5L19 7" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Checkbox — 20px box, white ✓ pops in, squashes while pressed, gold focus ring. */
export default function Checkbox({ checked, onChange, label, disabled = false, ...rest }) {
  return (
    <label className="pk-check">
      <input
        type="checkbox"
        checked={!!checked}
        disabled={disabled}
        onChange={(e) => onChange && onChange(e.target.checked)}
        {...rest}
      />
      <span className="box"><CheckSVG /></span>
      {label}
    </label>
  );
}

export { CheckSVG };
