import Button from './Button.jsx';
import TitleMenu from './TitleMenu.jsx';

const desk = () => (typeof window !== 'undefined' ? window.pikaosDesktop : undefined);

/** Functional title-bar toolbar (Window Controls Overlay draws min/max/close on the right).
 *  No CSS webkit drag region anywhere — it breaks click hit-testing on scaled Windows displays
 *  (Electron #7347). The window is dragged in JS via the empty handle instead. Desktop-only. */
export default function TitleBar({ t, onSidebar, onSearch, onBack, onForward, canBack, canForward, onMenuSettings, version }) {
  const api = desk();
  if (!api?.isDesktop) return null;

  const onDragDown = (e) => {
    if (e.button !== 0) return;
    let sx = e.screenX, sy = e.screenY;
    Promise.all([api.window.getBounds(), api.window.isMaximized()]).then(([bounds, wasMax]) => {
      let b = bounds;
      let restoring = false;   // one restore per drag, and never twice concurrently
      const cleanup = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', cleanup);
        window.removeEventListener('blur', cleanup);
      };
      const move = (ev) => {
        // getBounds can resolve after a fast click's mouseup — without this the window sticks to
        // the cursor with no button held. ev.buttons is the live state, unlike the stale closure.
        if ((ev.buttons & 1) === 0) return cleanup();
        if (wasMax) {
          // Deliberate travel only: a double-click jitters a pixel or two, and restoring on that
          // would undo the maximize the second click is about to ask for.
          if (restoring || Math.abs(ev.screenX - sx) + Math.abs(ev.screenY - sy) < 5) return;
          restoring = true;
          return api.window.restoreForDrag().then((nb) => {
            wasMax = false;
            // Re-anchor: the captured bounds described the maximized window and the cursor now sits
            // somewhere else entirely on a smaller one.
            if (nb) { b = nb; sx = ev.screenX; sy = ev.screenY; }
          });
        }
        api.window.move(b.x + (ev.screenX - sx), b.y + (ev.screenY - sy));
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', cleanup);
      window.addEventListener('blur', cleanup);
    });
  };

  // Icon-only Buttons carrying the flat title-bar chrome via `.tb-btn` (see styles.css — scoped to
  // `.btn.tb-btn` so it overrides the physical-button base). Button handles the tooltip + aria-label.
  return (
    <header className="titlebar" data-no-lex>
      <div className="titlebar-tools">
        <TitleMenu t={t} onSettings={onMenuSettings} onToggleSidebar={onSidebar} version={version} />
        <Button className="tb-btn" icon="sidebar" label={t('titlebar.sidebar')} onClick={onSidebar} />
        <Button className="tb-btn" icon="search" label={t('titlebar.search')} onClick={onSearch} />
        <Button className="tb-btn" icon="chevron-left" label={t('titlebar.back')} onClick={onBack} disabled={!canBack} />
        <Button className="tb-btn" icon="chevron-right" label={t('titlebar.forward')} onClick={onForward} disabled={!canForward} />
      </div>
      <div className="titlebar-draghandle" onMouseDown={onDragDown} onDoubleClick={() => api.window.toggleMaximize()} />
    </header>
  );
}
