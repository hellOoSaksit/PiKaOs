import { createRoot } from 'react-dom/client';
import './styles/index.css';

// ---- app modules, imported in dependency order for side effects + window bus ----
import './data/data.jsx';
import './data/data-users.jsx';
import './data/data-workflows.jsx';
import './data/office-data.jsx';
import './lib/i18n.jsx';
import './lib/sprites.jsx';
import './lib/store.jsx';
import './lib/characters.jsx';
import './lib/room-tiles.jsx';
import './lib/room-store.jsx';
import './lib/world-life.jsx';
import './components/components.jsx';
import './screens/screens-main.jsx';
import './screens/screens-secondary.jsx';
import './screens/screens-extra.jsx';
import './screens/screens-admin.jsx';
import './screens/screens-builder.jsx';
import './screens/screens-rbac.jsx';
import './screens/screens-workflows.jsx';
import './screens/screens-me.jsx';
import './screens/screens-sitemap.jsx';
import './lib/ui-modal.jsx';
import './lib/notify.jsx';
import App from './App.jsx';
import { AppBoot } from './AppBoot.jsx';
import './lib/tweaks-panel.jsx';
import './lib/tweaks-app.jsx';
import './lib/fx.js';

// restore saved theme (pro | pro-dark) before first paint
try {
  const t = localStorage.getItem('guild-theme');
  if (t === 'pro' || t === 'pro-dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

createRoot(document.getElementById('root')).render(<AppBoot><App /></AppBoot>);
