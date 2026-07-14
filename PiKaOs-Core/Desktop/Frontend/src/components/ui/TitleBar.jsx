import Tooltip from './Tooltip.jsx';
import TitleMenu from './TitleMenu.jsx';
import { renderIcon } from './icons.jsx';

const desk = () => (typeof window !== 'undefined' ? window.pikaosDesktop : undefined);

/** Functional title-bar toolbar (Window Controls Overlay draws min/max/close on the right).
 *  No CSS webkit drag region anywhere — it breaks click hit-testing on scaled Windows displays
 *  (Electron #7347). The window is dragged in JS via the empty handle instead. Desktop-only. */
export default function TitleBar({ t, onSidebar, onSearch, onBack, onForward, canBack, canForward, onMenuSettings, version }) {
  const api = desk();
  if (!api?.isDesktop) return null;

  const onDragDown = (e) => {
    if (e.button !== 0) return;
    const sx = e.screenX, sy = e.screenY;
    api.window.getBounds().then((b) => {
      const cleanup = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', cleanup);
        window.removeEventListener('blur', cleanup);
      };
      const move = (ev) => {
        // getBounds can resolve after a fast click's mouseup — without this the window sticks to
        // the cursor with no button held. ev.buttons is the live state, unlike the stale closure.
        if ((ev.buttons & 1) === 0) return cleanup();
        api.window.move(b.x + (ev.screenX - sx), b.y + (ev.screenY - sy));
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', cleanup);
      window.addEventListener('blur', cleanup);
    });
  };

  const Btn = ({ icon, label, onClick, disabled }) => (
    <Tooltip label={label}>
      <button type="button" className="tb-btn" aria-label={label} onClick={onClick} disabled={disabled}>
        {renderIcon(icon)}
      </button>
    </Tooltip>
  );

  return (
    <header className="titlebar" data-no-lex>
      <div className="titlebar-tools">
        <TitleMenu t={t} onSettings={onMenuSettings} onToggleSidebar={onSidebar} version={version} />
        <Btn icon="sidebar" label={t('titlebar.sidebar')} onClick={onSidebar} />
        <Btn icon="search" label={t('titlebar.search')} onClick={onSearch} />
        <Btn icon="chevron-left" label={t('titlebar.back')} onClick={onBack} disabled={!canBack} />
        <Btn icon="chevron-right" label={t('titlebar.forward')} onClick={onForward} disabled={!canForward} />
      </div>
      <div className="titlebar-draghandle" onMouseDown={onDragDown} onDoubleClick={() => api.window.toggleMaximize()} />
    </header>
  );
}
