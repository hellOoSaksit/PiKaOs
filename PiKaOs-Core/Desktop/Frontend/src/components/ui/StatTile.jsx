export default function StatTile({ label, value, unit, delta, deltaTone, icon }) {
  return (
    <div className="stat-tile">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div className="st-label">{label}</div>
        {icon && <span style={{ fontSize: 16, opacity: .8 }}>{icon}</span>}
      </div>
      <div className="st-value">{value}{unit && <span className="unit">{unit}</span>}</div>
      {delta && <div className={`st-delta ${deltaTone || ""}`}>{delta}</div>}
    </div>
  );
}
