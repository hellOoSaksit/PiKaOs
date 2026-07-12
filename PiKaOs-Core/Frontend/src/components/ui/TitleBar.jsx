import { useEffect, useState } from 'react';
import { renderIcon } from './icons.jsx';
import Tooltip from './Tooltip.jsx';

// Pure so it can be unit-tested without a DOM; the full render is verified in Electron.
export function maximizeIconName(isMaximized) {
  return isMaximized ? 'win-restore' : 'win-maximize';
}

const desk = () => (typeof window !== 'undefined' ? window.pikaosDesktop : undefined);

/** Custom title bar (frame:false). Desktop-only: the web build renders nothing. */
export default function TitleBar({ t }) {
  const api = desk();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api?.window) return;
    let alive = true;
    api.window.isMaximized().then((v) => { if (alive) setMaximized(v); }).catch(() => {});
    const off = api.window.onMaximizedChanged(setMaximized);
    return () => { alive = false; if (typeof off === 'function') off(); };
  }, [api]);

  if (!api?.isDesktop) return null;

  const w = api.window;
  return (
    <header className="titlebar" data-no-lex>
      <div className="titlebar-brand">
        <span className="titlebar-mark">P</span>
        <span className="titlebar-word">PiKaOs</span>
      </div>
      <div className="titlebar-drag" onDoubleClick={() => w.toggleMaximize()} />
      <div className="titlebar-controls">
        <Tooltip label={t('window.minimize')}>
          <button type="button" className="win-btn" aria-label={t('window.minimize')} onClick={() => w.minimize()}>
            {renderIcon('win-minimize')}
          </button>
        </Tooltip>
        <Tooltip label={t(maximized ? 'window.restore' : 'window.maximize')}>
          <button type="button" className="win-btn" aria-label={t(maximized ? 'window.restore' : 'window.maximize')} onClick={() => w.toggleMaximize()}>
            {renderIcon(maximizeIconName(maximized))}
          </button>
        </Tooltip>
        <Tooltip label={t('window.close')}>
          <button type="button" className="win-btn win-btn-close" aria-label={t('window.close')} onClick={() => w.close()}>
            {renderIcon('win-close')}
          </button>
        </Tooltip>
      </div>
    </header>
  );
}
