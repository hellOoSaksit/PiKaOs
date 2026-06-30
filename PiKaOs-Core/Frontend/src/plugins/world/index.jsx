/* World / Room — the frontend half of the `world` plugin (plugin-architecture.md §12, Phase 6).

   Bundles the whole 3D room experience as ONE plugin: the World State map, rooms, the build/
   placeable system, room chat, sessions/exports, and the per-task "TaskRoom" flow. Two routes
   enter the same World screen:
     • `world` — the sidebar "World State" map
     • `hall`  — the system-overview landing + the target QuestBoard navigates to when you enter a
                 task's room (`window.__pendingRoom` + the `guildos-enter-room` event — an event seam,
                 so the Base task board never imports world code).

   `render(ctx)` is handed the Core seams the screen needs: `S` (the agent/character system from the
   engine), `onAgent` (open the agent drawer), `can`, and `t`. The shared CharacterSprite + doc-editor
   it draws with already live in src/components/ (lifted out of the world barrel in Phase 0), so this
   plugin only consumes Core — never the reverse.

   The screens now physically live in this folder (World.jsx + build/chat/lobby/room-aside/sessions/
   exports/wt), relocated out of screens/world/ in Phase 6b; the old screens-world barrel was deleted
   (its only consumer was this descriptor; its window globals had no readers). A per-plugin i18n pack +
   lazy code-split remain as later refinements. */
import React from 'react';

import { World } from './World.jsx';

const renderWorld = (ctx) => <World onAgent={ctx.onAgent} S={ctx.S} can={ctx.can} t={ctx.t} />;

export default {
  id: 'world',
  routes: [
    { id: 'world', meta: { icon: '🌍', title: 'สถานะโลก', en: 'World State' }, render: renderWorld },
    { id: 'hall',  meta: { icon: '🏰', title: 'ภาพรวมระบบ', en: 'Guild Hall' }, render: renderWorld },
  ],
  // sidebar entry (i18n label resolves from `nav.world`, same as Base items — §11 config-driven).
  // `hall` has no nav item: it's a landing/overview reached from the dashboard + the task-room flow.
  nav: [
    {
      group: 'ศูนย์บัญชาการ',
      items: [
        { id: 'world', icon: '🌍' },
      ],
    },
  ],
};
