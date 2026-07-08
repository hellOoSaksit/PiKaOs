/* PiKaOs — sidebar shell state.

   The sidebar is two different things depending on width, so one control has to mean two things:
   above the breakpoint it's a persistent column that narrows to an icon rail; below it, it's an
   off-canvas drawer. `toggle()` therefore narrows/widens on desktop and opens/closes on mobile.
   Only the desktop preference is worth remembering — a drawer left open across reloads is a bug,
   not a preference.

   `rail` is deliberately not the same thing as `collapsed`: a drawer always shows its full self,
   so the stored preference is suppressed below the breakpoint. Deriving it here rather than
   unwinding it in CSS keeps one source of truth — the toggle button and the labels agree.

   NAV_DRAWER_BP mirrors the `@media (max-width: 980px)` block in styles/fx.css. Keep them in step. */
import { useCallback, useEffect, useState } from 'react';
import { loadNavCollapsed, saveNavCollapsed } from '../data/data-nav.jsx';

export const NAV_DRAWER_BP = 980;

const DRAWER_QUERY = `(max-width: ${NAV_DRAWER_BP}px)`;
const drawerWidth = () => typeof window !== 'undefined' && window.matchMedia(DRAWER_QUERY).matches;

export function useShellNav() {
  const [collapsed, setCollapsed] = useState(loadNavCollapsed);
  const [isDrawer, setIsDrawer] = useState(drawerWidth);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);
  const toggle = useCallback(() => {
    if (drawerWidth()) setDrawerOpen(o => !o);
    else setCollapsed(c => saveNavCollapsed(!c));
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(DRAWER_QUERY);
    const onChange = (e) => {
      setIsDrawer(e.matches);
      if (!e.matches) setDrawerOpen(false);   // growing past the breakpoint must not strand the scrim
    };
    const onKey = (e) => { if (e.key === 'Escape') setDrawerOpen(false); };
    mq.addEventListener('change', onChange);
    document.addEventListener('keydown', onKey);
    return () => {
      mq.removeEventListener('change', onChange);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return { rail: collapsed && !isDrawer, drawerOpen, toggle, closeDrawer };
}
