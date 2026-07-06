/**
 * One icon slot in the BottomUtilityBar: icon, optional label chip, optional
 * badge count, gold pill background when active. Mirrors the DC markup's
 * per-button structure (Bottom Utility Bar.dc.html) without repeating its
 * inline styles per call site.
 */
export function UtilityBarButton({ icon, label, showLabel = false, active = false, badge, onClick, title }) {
  const badgeText = badge > 9 ? '9+' : (badge > 0 ? String(badge) : null);
  return (
    <button
      type="button"
      className={'ub-btn' + (active ? ' active' : '')}
      title={title}
      onClick={onClick}
    >
      {active && <span className="ub-btn-pill" />}
      <span className="ub-btn-icon">{icon}</span>
      {badgeText && <span className="ub-badge">{badgeText}</span>}
      {showLabel && <span className="ub-btn-label">{label}</span>}
    </button>
  );
}
