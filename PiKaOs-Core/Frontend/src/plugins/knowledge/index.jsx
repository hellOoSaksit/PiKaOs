/* Knowledge / RAG — the frontend half of the `knowledge` plugin (plugin-architecture.md §12, Phase 6).

   The descriptor is the frontend mirror of the backend manifest: it tells the Core shell which routes
   this feature owns, how to render them, their topbar metadata, and its sidebar entries — so Core never
   hardcodes Codex/Recall into App.jsx or data.jsx. Each `render(ctx)` is handed only the Core seams the
   screen needs (t · can · language); the plugin owns the prop wiring.

   Screens still physically live under ../../screens/extra/ and are imported statically — relocating them
   into this folder (with the plugin's own i18n keys) plus lazy code-splitting is the mechanical Phase 6b
   follow-up, exactly as the backend split the Loader seam (Phase 1) from the physical core/ move (1b).
   (Lazy-loading buys a separate chunk only once the Base screens that still embed these components —
   MyDashboard's Recall, the RBAC screen's Codex/Recall — consume them through the seam too, in 6b.) */
import React from 'react';

import { Codex } from '../../screens/extra/codex.jsx';
import { Recall } from '../../screens/extra/recall.jsx';

export default {
  id: 'knowledge',
  routes: [
    {
      id: 'codex',
      meta: { icon: '📚', title: 'บันทึกความรู้', en: 'Codex' },
      render: (ctx) => <Codex t={ctx.t} can={ctx.can} />,
    },
    {
      id: 'search',
      meta: { icon: '🔍', title: 'ค้นหาความรู้', en: 'Recall' },
      render: (ctx) => <Recall lang={ctx.language} />,
    },
  ],
  // sidebar entries (i18n label resolves from `nav.<id>`, same as Base items — §11 config-driven).
  nav: [
    {
      group: 'ความรู้และความทรงจำ',
      items: [
        { id: 'codex', icon: '📚' },
        { id: 'search', icon: '🔍' },
      ],
    },
  ],
};
