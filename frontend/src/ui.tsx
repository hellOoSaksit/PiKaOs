/* Minimal ports of the prototype primitives used by SitemapAudit
   (PageHead / Empty / Btn / Panel). Visual classes come from styles.css. */
import type { ReactNode } from "react";

export function PageHead({ kicker, title, tag, desc }: { kicker: string; title: string; tag?: string; desc: string }) {
  return (
    <div className="page-head">
      <div className="ph-kicker mono">{kicker}</div>
      <h1 className="ph-title">
        {title}
        {tag && <span className="ph-tag">{tag}</span>}
      </h1>
      <p className="ph-desc">{desc}</p>
    </div>
  );
}

export function Empty({ icon, title, sub }: { icon: string; title: string; sub?: string }) {
  return (
    <div className="empty">
      <div className="empty-ic">{icon}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub">{sub}</div>}
    </div>
  );
}

export function Panel({ children }: { children: ReactNode }) {
  return <div className="panel">{children}</div>;
}

export function Btn({
  kind = "ghost",
  sm,
  icon,
  children,
  onClick,
  style,
}: {
  kind?: "gold" | "ghost";
  sm?: boolean;
  icon?: string;
  children: ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}) {
  return (
    <button className={`btn ${kind} ${sm ? "sm" : ""}`} onClick={onClick} style={style}>
      {icon && <span className="btn-ic">{icon}</span>}
      {children}
    </button>
  );
}
