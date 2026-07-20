import { renderIcon } from './icons.jsx';

export default function Panel({ title, en, icon, right, children, className = "", ornate = false, bodyPad = true }) {
  return (
    <section className={`panel ${ornate ? "ornate" : ""} ${className}`}>
      {title && (
        <div className="panel-head">
          {icon && <span className="ph-icon">{renderIcon(icon)}</span>}
          <h3>{title}</h3>
          {en && <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-4)" }}>{en}</span>}
          <span className="ph-spacer" />
          {right}
        </div>
      )}
      <div className={bodyPad ? "panel-body" : "panel-body no-pad"}>{children}</div>
    </section>
  );
}
