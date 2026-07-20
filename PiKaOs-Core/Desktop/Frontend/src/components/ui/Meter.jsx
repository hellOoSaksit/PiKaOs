/** Meter — a proportional fill bar. kind selects the accent (quota | xp | hp). */
export default function Meter({ kind = 'quota', val }) {
  return <div className={`meter ${kind}`}><i style={{ width: `${val}%` }} /></div>;
}
