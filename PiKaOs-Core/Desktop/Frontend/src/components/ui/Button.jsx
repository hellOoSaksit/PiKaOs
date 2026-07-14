import { useState } from 'react';

/**
 * Button — PiKaOs physical-button: 3D base shadow, sink on press, spring release.
 * kind: "gold" (primary) | "ghost" | "danger". size: "md" | "sm". icon: square.
 * loading swaps the label for a spinner + "Working…" and disables.
 */
export default function Button({
  kind = 'ghost',
  size = 'md',
  icon = false,
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'btn',
    `btn-${kind}`,
    size === 'sm' && 'btn-sm',
    icon && 'btn-icon',
    className,
  ].filter(Boolean).join(' ');
  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading ? (
        <>
          <span className={'spinner' + (kind === 'ghost' ? ' dark' : '')} />
          {!icon && 'Working…'}
        </>
      ) : children}
    </button>
  );
}
