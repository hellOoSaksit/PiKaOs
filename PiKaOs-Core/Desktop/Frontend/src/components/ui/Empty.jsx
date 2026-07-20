import { renderIcon } from './icons.jsx';

// Empty state. `icon` is an icons.jsx name; an emoji or element still passes straight through
// (renderIcon's contract) so un-migrated callers keep rendering.
export default function Empty({ icon = "folder", title, sub }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{renderIcon(icon)}</div>
      <div className="empty-title">{title}</div>
      {sub && <div className="empty-sub muted">{sub}</div>}
    </div>
  );
}
