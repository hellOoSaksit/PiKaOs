import { createRoot } from 'react-dom/client';
import './styles/index.css';

// ---- app modules, imported in dependency order for side effects + window bus ----
import './lib/i18n.jsx';
import './components/components.jsx';
import './screens/screens-extra.jsx';
import './lib/ui-modal.jsx';
import './lib/notify.jsx';
import App from './App.jsx';
import { AppBoot } from './AppBoot.jsx';

// Restore the last user's theme (pro | pro-dark) before first paint — no saved theme → light default.
// This themes the pre-login screens too (the Connect-Server / IP entry screen lives in AppBoot, above
// App.jsx). On desktop, also match the OS window buttons + window fill to that theme here, because
// App.jsx's own overlay sync only runs once App mounts — without this the connect screen would show a
// light OS-button strip over a dark page. App re-syncs on every later theme change.
try {
  const t = localStorage.getItem('guild-theme');
  if (t === 'pro' || t === 'pro-dark') document.documentElement.setAttribute('data-theme', t);
  const w = window.pikaosDesktop?.window;
  if (w?.setTitleBarOverlay) {
    const css = getComputedStyle(document.documentElement);
    const color = css.getPropertyValue('--bg-1').trim();
    const symbolColor = css.getPropertyValue('--ink-3').trim();
    if (color && symbolColor) w.setTitleBarOverlay({ color, symbolColor, bg: color });
  }
} catch (e) {}

createRoot(document.getElementById('root')).render(<AppBoot><App /></AppBoot>);
