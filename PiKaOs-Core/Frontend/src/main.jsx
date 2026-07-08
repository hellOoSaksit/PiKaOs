import { createRoot } from 'react-dom/client';
import './styles/index.css';

// ---- app modules, imported in dependency order for side effects + window bus ----
import './data/data.jsx';
import './lib/i18n.jsx';
import './lib/characters.jsx';
import './components/components.jsx';
import './screens/screens-extra.jsx';
import './lib/ui-modal.jsx';
import './lib/notify.jsx';
import App from './App.jsx';
import { AppBoot } from './AppBoot.jsx';
import './lib/fx.js';

// restore saved theme (pro | pro-dark) before first paint
try {
  const t = localStorage.getItem('guild-theme');
  if (t === 'pro' || t === 'pro-dark') document.documentElement.setAttribute('data-theme', t);
} catch (e) {}

createRoot(document.getElementById('root')).render(<AppBoot><App /></AppBoot>);
