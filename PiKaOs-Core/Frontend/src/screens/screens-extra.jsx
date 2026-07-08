/* PiKaOs — EXTRA SCREENS barrel (Base).
   Kernel-only Core: the game dashboards (Mana/Treasury/Chronicle/QuestLog/
   Watchtower) were dropped in Phase 2.1 — this barrel now re-exports only
   Settings from ./extra/settings.jsx.

   Codex + Recall were lifted OUT of here into the `knowledge` plugin
   (src/plugins/knowledge/codex.jsx · recall.jsx, Phase 6b) — the Base no longer
   ships those screens either.
*/
import { THEME_CARDS, Settings } from './extra/settings.jsx';

export {
  Settings,
  THEME_CARDS
};
