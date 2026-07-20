/** Ordered focusable elements within a container (for a modal focus trap). */
export function focusables(container) {
  if (!container) return [];
  return [...container.querySelectorAll(
    'a[href],button:not([disabled]),textarea,input:not([disabled]),select,[tabindex]:not([tabindex="-1"])'
  )];
}
/** Given the focusables, the current active el, and shift-key, returns the element to focus next (wrap). */
export function nextTrapTarget(list, active, shift) {
  if (!list.length) return null;
  const i = list.indexOf(active);
  if (shift) return i <= 0 ? list[list.length - 1] : list[i - 1];
  return i === list.length - 1 || i === -1 ? list[0] : list[i + 1];
}
