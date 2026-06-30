/* PiKaOs — WORLD barrel.
   The world screen was split into focused modules under ./world/ for easier
   navigation and customization. This file re-exports the world-only public
   surface (+ the window globals below) so every existing import keeps working.

   Shared, non-world components used across Base screens were lifted OUT of this
   barrel into src/components/ (CharacterSprite, doc-editor: DocEditor/RichBody/
   DOC_SEED/TipTap) so the Base no longer reaches into the world feature — the
   prerequisite for extracting world into its own plugin.

   Modules:
     world/chat.jsx             CEO/room chat helpers + RoomChat + HermesChat
     world/exports.jsx          exported-files panel + generators
     world/sessions.jsx         work-sessions panel
     world/room-aside.jsx       room side panel (RoomInfo/RoomAside + .md lists)
     world/lobby.jsx            RoomThumb, TemplatesTab, RoomPicker, OverviewTab
     world/build.jsx            living agents, RoomCanvas, BuildPalette, RoomView
     world/World.jsx            top-level WORLD screen
*/
import { _agentLine, ceoContext, ceoReply, roomReply, RoomChat, HermesChat } from './world/chat.jsx';
import { EXPORT_TYPES, exportSeed, loadExports, saveExports, exportTimeLabel, genExportContent, downloadExport, RoomExports } from './world/exports.jsx';
import { loadSessions, saveSessions, sessionTime, RoomSessions } from './world/sessions.jsx';
import { SHARED_FILES, PERAGENT_FILES, RoomInfo, RoomAside } from './world/room-aside.jsx';
import { RoomThumb, TemplatesTab, RoomPicker, OverviewTab } from './world/lobby.jsx';
import { useLivingAgents, RoomCanvas, ItemPreview, BuildPalette, RoomView } from './world/build.jsx';
import { World } from './world/World.jsx';

Object.assign(window, { World, HermesChat, OverviewTab, RoomPicker, RoomView, RoomCanvas, BuildPalette });

export {
  BuildPalette,
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
  ceoContext,
  ceoReply,
  downloadExport,
  exportSeed,
  exportTimeLabel,
  genExportContent,
  loadExports,
  loadSessions,
  roomReply,
  saveExports,
  saveSessions,
  sessionTime,
  useLivingAgents
};
