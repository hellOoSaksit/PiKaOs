import { renderIcon, ICON_NAMES } from './icons.jsx';
import Tooltip from './Tooltip.jsx';

/**
 * Button — the one button. kind: gold|ghost|danger. size: md|sm.
 * icon: a design-system icon NAME (not a node, not an emoji). icon + no children => icon-only
 * (square, aria-label from `label`, tooltip). loading => disabled + spinner + `loadingLabel`
 * (a string the caller resolves via t(); never a hardcoded literal).
 */
export default function Button({
  kind = 'ghost', size = 'md', icon, label, loading = false, loadingLabel,
  disabled = false, type = 'button', className = '', children, ...rest
}) {
  if (import.meta.env?.DEV && typeof icon === 'string' && !ICON_NAMES.includes(icon)) {
    console.warn(`Button: icon="${icon}" is not a design-system icon name (emoji/literal not allowed)`);
  }
  const iconOnly = icon && children == null;
  const cls = ['btn', `btn-${kind}`, size === 'sm' && 'btn-sm', iconOnly && 'btn-icon', className]
    .filter(Boolean).join(' ');
  const inner = loading
    ? <><span className={'spinner' + (kind === 'ghost' ? ' dark' : '')} />{!iconOnly && loadingLabel}</>
    : <>{icon && renderIcon(icon)}{children}</>;
  const btn = (
    <button type={type} className={cls} disabled={disabled || loading}
      aria-label={iconOnly ? label : undefined} {...rest}>
      {inner}
    </button>
  );
  return iconOnly && label ? <Tooltip label={label}>{btn}</Tooltip> : btn;
}
