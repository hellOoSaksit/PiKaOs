/**
 * Segmented — radio group. options: [{value,label}] or [string].
 * Active = bg-2 pill, gold text, raised; press scale .94.
 */
export default function Segmented({ options = [], value, onChange, className = '' }) {
  const norm = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return (
    <div className={'seg' + (className ? ' ' + className : '')} role="tablist">
      {norm.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          className={value === o.value ? 'on' : ''}
          onClick={() => onChange && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
