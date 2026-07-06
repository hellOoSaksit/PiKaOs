/* PiKaOs — EXTRA SCREENS barrel (Base).
   Split into focused modules under ./extra/ for easier navigation. This file
   re-exports the same public surface and keeps the window globals below so
   every existing import keeps working.

   Codex + Recall were lifted OUT of here into the `knowledge` plugin
   (src/plugins/knowledge/codex.jsx · recall.jsx, Phase 6b) — the Base no longer
   ships those screens. What remains are the Base dashboards + settings.

   Modules:
     extra/dashboards.jsx  Mana · Treasury · Chronicle · QuestLog · Watchtower
     extra/settings.jsx    Settings (theme/language)
*/
import { Mana, Treasury, Chronicle, QuestLog, Watchtower } from './extra/dashboards.jsx';
import { THEME_CARDS, Settings } from './extra/settings.jsx';

Object.assign(window, { Mana, Treasury, Chronicle, Settings, QuestLog, Watchtower });

export {
  Chronicle,
  Mana,
  QuestLog,
  Settings,
  THEME_CARDS,
  Treasury,
  Watchtower
};
