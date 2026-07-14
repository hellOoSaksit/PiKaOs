/**
 * Progress — 8px track, gold→bright gradient fill, turns solid emerald at 100%.
 * value 0..100. Shows mono % label unless hideLabel.
 */
export default function Progress({ value = 0, hideLabel = false, className = '' }) {
  const v = Math.max(0, Math.min(100, value));
  const done = v >= 100;
  return (
    <div className={'task-prog' + (done ? ' complete' : '') + (className ? ' ' + className : '')}>
      <div className="task-prog-track">
        <div className="task-prog-fill" style={{ width: v + '%' }} />
      </div>
      {!hideLabel && <span className="task-prog-label">{Math.round(v)}%</span>}
    </div>
  );
}
