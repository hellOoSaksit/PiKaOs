/* PiKaOs — EXTRA SCREENS barrel.
   Split into focused modules under ./extra/ for easier navigation. This file
   re-exports the same public surface and keeps the window globals below so
   every existing import keeps working.

   Modules:
     extra/codex.jsx       Codex knowledge base (types, drawer, add-note, screen)
     extra/recall.jsx      hybrid retrieval + cited Q&A
     extra/dashboards.jsx  Mana · Treasury · Chronicle · QuestLog · Watchtower
     extra/settings.jsx    Settings (theme/language) + ApiConnections panel
*/
import { KTYPE, KTYPE_TH, KTYPE_EN, KTYPE_OPTS, KBODY, KCODEX_KEY, loadCodex, saveCodex, CodexDrawer, AddNoteModal, Codex } from './extra/codex.jsx';
import { RECALL_CONCEPTS, recallDocText, recallScore, recallSnippet, recallHighlight, recallSearch, askHermes, AnswerBody, RecallResult, Recall } from './extra/recall.jsx';
import { Mana, Treasury, Chronicle, QuestLog, Watchtower } from './extra/dashboards.jsx';
import { THEME_CARDS, ApiConnections, Settings } from './extra/settings.jsx';

Object.assign(window, { Codex, Recall, Mana, Treasury, Chronicle, Settings, QuestLog, Watchtower });

export {
  AddNoteModal,
  AnswerBody,
  ApiConnections,
  Chronicle,
  Codex,
  CodexDrawer,
  KBODY,
  KCODEX_KEY,
  KTYPE,
  KTYPE_EN,
  KTYPE_OPTS,
  KTYPE_TH,
  Mana,
  QuestLog,
  RECALL_CONCEPTS,
  Recall,
  RecallResult,
  Settings,
  THEME_CARDS,
  Treasury,
  Watchtower,
  askHermes,
  loadCodex,
  recallDocText,
  recallHighlight,
  recallScore,
  recallSearch,
  recallSnippet,
  saveCodex
};
