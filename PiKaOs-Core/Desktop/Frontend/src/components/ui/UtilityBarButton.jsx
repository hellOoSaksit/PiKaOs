/**
 * One icon slot in the BottomUtilityBar: icon, optional label chip, optional
 * badge count, gold pill background when active. Mirrors the DC markup's
 * per-button structure (Bottom Utility Bar.dc.html) without repeating its
 * inline styles per call site.
 */
export function UtilityBarButton({ icon, label, showLabel = false, active = false, badge, onClick }) {
  const badgeText = badge > 9 ? '9+' : (badge > 0 ? String(badge) : null);
  return (
    <button
      type="button"
      className={'ub-btn' + (active ? ' active' : '')}
      // no `title`: every call site already wraps this in <Tooltip label>, and the native bubble
      // rendered a SECOND, unstyled tooltip next to it. `label` names the icon-only button instead
      // (redundant once the label chip is visible, so it is dropped then).
      aria-label={showLabel ? undefined : label}
      onClick={onClick}
    >
      {active && <span className="ub-btn-pill" />}
      <span className="ub-btn-icon">{icon}</span>
      {badgeText && <span className="ub-badge">{badgeText}</span>}
      {showLabel && <span className="ub-btn-label">{label}</span>}
    </button>
  );
}
