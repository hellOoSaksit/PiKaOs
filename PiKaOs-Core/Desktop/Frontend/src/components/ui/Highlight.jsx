/**
 * Highlight — semantic <mark> tint. tone: gold (default) | emerald | crimson | amethyst.
 * Text color is inherited (never colored), per the DS rule.
 */
export default function Highlight({ tone = 'gold', children }) {
  const cls = tone === 'gold' ? 'hl' : 'hl hl-' + tone;
  return <mark className={cls}>{children}</mark>;
}
