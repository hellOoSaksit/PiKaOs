import Tooltip from './Tooltip.jsx';
import { renderIcon } from './icons.jsx';

const desk = () => (typeof window !== 'undefined' ? window.pikaosDesktop : undefined);

/** Functional title-bar toolbar (Window Controls Overlay draws min/max/close on the right).
 *  No CSS webkit drag region anywhere — it breaks click hit-testing on scaled Windows displays
 *  (Electron #7347). The window is dragged in JS via the empty handle instead. Desktop-only. */
export default function TitleBar({ t, onMenu, onSidebar, onSearch, onBack, onForward, canBack, canForward }) {
  const api = desk();
  if (!api?.isDesktop) return null;

  const onDragDown = (e) => {
    if (e.button !== 0) return;
    const sx = e.screenX, sy = e.screenY;
    api.window.getBounds().then((b) => {
      const move = (ev) => api.window.move(b.x + (ev.screenX - sx), b.y + (ev.screenY - sy));
      const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
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
        <Btn icon="menu" label={t('titlebar.menu')} onClick={onMenu} />
        <Btn icon="sidebar" label={t('titlebar.sidebar')} onClick={onSidebar} />
        <Btn icon="search" label={t('titlebar.search')} onClick={onSearch} />
        <Btn icon="chevron-left" label={t('titlebar.back')} onClick={onBack} disabled={!canBack} />
        <Btn icon="chevron-right" label={t('titlebar.forward')} onClick={onForward} disabled={!canForward} />
      </div>
      <div className="titlebar-draghandle" onMouseDown={onDragDown} onDoubleClick={() => api.window.toggleMaximize()} />
    </header>
  );
}
