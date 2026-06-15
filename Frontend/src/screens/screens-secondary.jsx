/* PiKaOs — SECONDARY SCREENS + DRAWERS barrel.
   Split into focused modules under ./secondary/ for easier navigation. This
   file re-exports the same public surface and keeps the window globals below so
   every existing import keeps working.

   Modules:
     secondary/st.js            shared i18n binding for these screens
     secondary/task-utils.js    Quest Board task helpers (storage, .md docs, rooms)
     secondary/AgentDrawer.jsx  agent detail drawer
     secondary/QuestDrawer.jsx  quest detail drawer
     secondary/QuestBoard.jsx   quest board + TaskDetail
     secondary/Agents.jsx       agent roster
     secondary/Meeting.jsx      council / meeting
*/
import { AgentDrawer } from './secondary/AgentDrawer.jsx';
import { QuestDrawer } from './secondary/QuestDrawer.jsx';
import { TaskDetail, QuestBoard } from './secondary/QuestBoard.jsx';
import { Agents } from './secondary/Agents.jsx';
import { Meeting } from './secondary/Meeting.jsx';
import {
  WORKS_LS, loadWorks, saveWorks, taskHash, taskTotal, taskStep,
  genUUID, genTaskCode, taskMetaBlock, buildBriefMd, buildWorklogMd,
  enhanceWorklog, taskMdToHtml, worklogSeedFor, createRoomForTask,
} from './secondary/task-utils.js';

Object.assign(window, { AgentDrawer, QuestDrawer, QuestBoard, Agents, Meeting });

export {
  AgentDrawer,
  Agents,
  Meeting,
  QuestBoard,
  QuestDrawer,
  TaskDetail,
  WORKS_LS,
  buildBriefMd,
  buildWorklogMd,
  createRoomForTask,
  enhanceWorklog,
  genTaskCode,
  genUUID,
  loadWorks,
  saveWorks,
  taskHash,
  taskMdToHtml,
  taskMetaBlock,
  taskStep,
  taskTotal,
  worklogSeedFor
};
