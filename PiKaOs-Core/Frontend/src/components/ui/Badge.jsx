/**
 * Badge — pill status/priority/feature tag (tint recipe).
 * variant: st-queued | st-active | st-done | pr-high | pr-urgent | ft-local
 * dot: show a leading status dot. mono: monospace chip.
 */
export default function Badge({ variant = 'st-queued', dot = false, mono = false, className = '', children }) {
  const cls = ['qbadge', variant, mono && 'mono-chip', className].filter(Boolean).join(' ');
  return (
    <span className={cls}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}
