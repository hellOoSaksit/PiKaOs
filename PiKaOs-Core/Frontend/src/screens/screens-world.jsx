/* PiKaOs — WORLD barrel.
   The world screen was split into focused modules under ./world/ for easier
   navigation and customization. This file re-exports the same public surface
   so every existing import (and the window globals below) keeps working.

   Modules:
     world/CharacterSprite.jsx  animated sprite
     world/chat.jsx             CEO/room chat helpers + RoomChat + HermesChat
     world/exports.jsx          exported-files panel + generators
     world/sessions.jsx         work-sessions panel
     world/doc.jsx              DocEditor, RichBody, DOC_SEED, TipTap loader
     world/room-aside.jsx       room side panel (RoomInfo/RoomAside + .md lists)
     world/lobby.jsx            RoomThumb, TemplatesTab, RoomPicker, OverviewTab
     world/build.jsx            living agents, RoomCanvas, BuildPalette, RoomView
     world/World.jsx            top-level WORLD screen
*/
import { CharacterSprite } from './world/CharacterSprite.jsx';
import { _agentLine, ceoContext, ceoReply, roomReply, RoomChat, HermesChat } from './world/chat.jsx';
import { EXPORT_TYPES, exportSeed, loadExports, saveExports, exportTimeLabel, genExportContent, downloadExport, RoomExports } from './world/exports.jsx';
import { loadSessions, saveSessions, sessionTime, RoomSessions } from './world/sessions.jsx';
import { _tiptapP, loadTiptap, DOC_SEED, DocEditor, RichBody } from './world/doc.jsx';
import { SHARED_FILES, PERAGENT_FILES, RoomInfo, RoomAside } from './world/room-aside.jsx';
import { RoomThumb, TemplatesTab, RoomPicker, OverviewTab } from './world/lobby.jsx';
import { useLivingAgents, RoomCanvas, ItemPreview, BuildPalette, RoomView } from './world/build.jsx';
import { World } from './world/World.jsx';

Object.assign(window, { World, HermesChat, OverviewTab, RoomPicker, RoomView, RoomCanvas, BuildPalette });
// publish shared graphics components so window-guarded usages keep working across modules
window.CharacterSprite = CharacterSprite;
window.DocEditor = DocEditor;
window.RichBody = RichBody;

export {
  BuildPalette,
  CharacterSprite,
  DOC_SEED,
  DocEditor,
  RichBody,
  EXPORT_TYPES,
  HermesChat,
  ItemPreview,
  OverviewTab,
  PERAGENT_FILES,
  RoomAside,
  RoomCanvas,
  RoomChat,
  RoomExports,
  RoomInfo,
  RoomPicker,
  RoomSessions,
  RoomThumb,
  RoomView,
  SHARED_FILES,
  TemplatesTab,
  World,
  _agentLine,
  _tiptapP,
  ceoContext,
  ceoReply,
  downloadExport,
  exportSeed,
  exportTimeLabel,
  genExportContent,
  loadExports,
  loadSessions,
  loadTiptap,
  roomReply,
  saveExports,
  saveSessions,
  sessionTime,
  useLivingAgents
};
