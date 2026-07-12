/* PiKaOs icon set — 60 line icons on a 24x24 grid, 1.8 stroke, round caps/joins.
   Source of truth: PiKaOs-Docs/design-system/"Icon System.dc.html" (50 icons) plus 10 drawn
   for shell surfaces the sheet didn't cover (key, tools, puzzle, components, package, monitor,
   clipboard-list, book, globe, sidebar).

   Monochrome by construction: paths never carry their own colour, they inherit `currentColor`,
   so one icon serves both themes. Semantic colour is the caller's choice via `tone` — never
   baked into a path. See design-system README §5. */
import React from 'react';

const PATHS = {
  /* account */
  "add-account": <><circle cx="9.5" cy="8" r="3.5"/><path d="M3.5 19.5c0-3.4 2.7-5.8 6-5.8 1 0 1.9.2 2.7.5"/><path d="M17.5 14.5v6M14.5 17.5h6"/></>,
  "user": <><circle cx="12" cy="8" r="3.6"/><path d="M5.5 19.5c0-3.7 2.9-6.2 6.5-6.2s6.5 2.5 6.5 6.2"/></>,
  "members": <><circle cx="9" cy="8.5" r="3"/><path d="M3.5 19.5c0-3.1 2.5-5.2 5.5-5.2s5.5 2.1 5.5 5.2"/><path d="M15.5 6.3a3 3 0 0 1 0 5.7"/><path d="M16.8 14.4c2.3.5 4 2.4 4 4.9"/></>,
  "logout": <><path d="M14 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2H14"/><path d="M10.5 12h9.5M17 8.5l3.5 3.5L17 15.5"/></>,
  /* navigation */
  "home": <><path d="M4 11.5 12 4.5l8 7"/><path d="M6 9.8V19.5h12V9.8"/><path d="M10 19.5V14h4v5.5"/></>,
  "dashboard": <><rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/></>,
  "search": <><circle cx="11" cy="11" r="6.2"/><path d="m20 20-3.8-3.8"/></>,
  "calendar": <><rect x="4" y="5.5" width="16" height="14.5" rx="2.5"/><path d="M4 9.5h16M8.5 3.5v4M15.5 3.5v4"/></>,
  "folder": <path d="M4 7.5a2 2 0 0 1 2-2h3.3l2 2H18a2 2 0 0 1 2 2v7.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-9.5z"/>,
  "globe": <><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17"/><path d="M12 3.5c2.3 2.4 3.5 5.4 3.5 8.5s-1.2 6.1-3.5 8.5c-2.3-2.4-3.5-5.4-3.5-8.5S9.7 5.9 12 3.5z"/></>,
  /* settings — an 8-tooth gear laid out from a computed pitch (45° apart, tips on the axes). The DS
     sheet still carries a hand-nudged Feather path that mixes 1 and 1.1 lug offsets and opens at y=13
     where its mirror needs 15, so it renders visibly lopsided. This one is symmetric by construction. */
  "settings": <><circle cx="12" cy="12" r="3.1"/><path d="M9.92 5.95 10.38 3.66 13.62 3.66 14.08 5.95A6.4 6.4 0 0 1 14.81 6.25L16.75 4.95 19.05 7.25 17.75 9.19A6.4 6.4 0 0 1 18.05 9.92L20.34 10.38 20.34 13.62 18.05 14.08A6.4 6.4 0 0 1 17.75 14.81L19.05 16.75 16.75 19.05 14.81 17.75A6.4 6.4 0 0 1 14.08 18.05L13.62 20.34 10.38 20.34 9.92 18.05A6.4 6.4 0 0 1 9.19 17.75L7.25 19.05 4.95 16.75 6.25 14.81A6.4 6.4 0 0 1 5.95 14.08L3.66 13.62 3.66 10.38 5.95 9.92A6.4 6.4 0 0 1 6.25 9.19L4.95 7.25 7.25 4.95 9.19 6.25A6.4 6.4 0 0 1 9.92 5.95Z"/></>,
  "preferences": <><path d="M4 8h9"/><path d="M17 8h3"/><path d="M4 16h3"/><path d="M11 16h9"/><circle cx="15" cy="8" r="2.2"/><circle cx="8" cy="16" r="2.2"/></>,
  "lock": <><rect x="5" y="10.5" width="14" height="9.5" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><path d="M12 14.5v2.5"/></>,
  "security": <><path d="M12 3.5 5.5 6v5.2c0 4.2 2.8 7.3 6.5 8.8 3.7-1.5 6.5-4.6 6.5-8.8V6L12 3.5z"/><path d="m9.2 12 2 2 3.6-3.8"/></>,
  "key": <><circle cx="7.5" cy="15.5" r="4"/><path d="m10.4 12.6 8.6-8.6"/><path d="m16.3 6.7 2.6 2.6"/></>,
  "notifications": <><path d="M18 9.5a6 6 0 1 0-12 0c0 4.8-2 6.3-2 6.3h16s-2-1.5-2-6.3z"/><path d="M10.2 19.2a2 2 0 0 0 3.6 0"/></>,
  /* actions */
  "add": <path d="M12 5v14M5 12h14"/>,
  "edit": <><path d="M15.8 4.3 19.7 8.2 9.4 18.5l-4.4 1.1 1.1-4.4L15.8 4.3z"/><path d="m14 6.1 3.9 3.9"/></>,
  "delete": <><path d="M5 7h14"/><path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7"/><path d="M6.5 7 7.4 19a2 2 0 0 0 2 1.9h5.2a2 2 0 0 0 2-1.9L17.5 7"/><path d="M10 11v6M14 11v6"/></>,
  "download": <><path d="M12 4v11"/><path d="m8 11 4 4 4-4"/><path d="M5 19.5h14"/></>,
  "upload": <><path d="M12 20V9"/><path d="m8 13 4-4 4 4"/><path d="M5 4.5h14"/></>,
  "filter": <path d="M4 5.5h16l-6.2 7.2v5.3l-3.6 1.8v-7.1L4 5.5z"/>,
  /* comms */
  "mail": <><rect x="4" y="6" width="16" height="12" rx="2.5"/><path d="m5 8.5 7 5 7-5"/></>,
  "chat": <path d="M20 6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5V20l4-3.5H18a2 2 0 0 0 2-2v-8z"/>,
  "share": <><circle cx="6.5" cy="12" r="2.5"/><circle cx="17" cy="6" r="2.5"/><circle cx="17" cy="18" r="2.5"/><path d="m8.7 10.8 6.1-3.4M8.7 13.2l6.1 3.4"/></>,
  "help": <><circle cx="12" cy="12" r="8.5"/><path d="M9.4 9.3a2.6 2.6 0 0 1 4.6 1.7c0 1.7-2 2.1-2 3.5"/><path d="M12 17.2h.01"/></>,
  /* content */
  "favorite": <path d="m12 4 2.5 5 5.5.8-4 3.9.9 5.5L12 16.6 7.1 19.2l.9-5.5-4-3.9 5.5-.8L12 4z"/>,
  "like": <path d="M12 20.3 4.8 13a4.5 4.5 0 0 1 6.4-6.3l.8.8.8-.8A4.5 4.5 0 0 1 19.2 13L12 20.3z"/>,
  "bookmark": <path d="M7 4.5h10a1 1 0 0 1 1 1v14.5l-6-4-6 4V5.5a1 1 0 0 1 1-1z"/>,
  "tag": <><path d="M4 12.8V5.5a1 1 0 0 1 1-1h7.3l7.2 7.2a1.4 1.4 0 0 1 0 2l-5.5 5.5a1.4 1.4 0 0 1-2 0L4 12.8z"/><circle cx="8.5" cy="8.5" r="1.3"/></>,
  "analytics": <><path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="8" rx="1"/><rect x="10.5" y="7.5" width="3" height="12.5" rx="1"/><rect x="15.5" y="14.5" width="3" height="5.5" rx="1"/></>,
  // the sheet draws `more` with no stroke at all; opt its dots out of the shared 1.8 so they stay dots
  "more": <><circle cx="6" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.9" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.9" fill="currentColor" stroke="none"/></>,
  "book": <><path d="M12 6.5C10.5 5 8.5 4.5 4.5 4.5v13c4 0 6 .5 7.5 2 1.5-1.5 3.5-2 7.5-2v-13c-4 0-6 .5-7.5 2z"/><path d="M12 6.5v13"/></>,
  "clipboard-list": <><rect x="5" y="5" width="14" height="15" rx="2.5"/><rect x="9" y="3" width="6" height="4" rx="1.5"/><path d="M9.5 12h5M9.5 16h5"/></>,
  /* media */
  "image": <><rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m4.5 17.5 4-3.8 2.7 2.4 3.8-4.3 4.5 4.7"/></>,
  "video": <><rect x="3.5" y="6" width="12.5" height="12" rx="2.5"/><path d="M16 10.5 20.5 7.5v9L16 13.5z"/></>,
  "music": <><path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/></>,
  "attach": <path d="M19 11.5 12 18.5a4 4 0 0 1-5.6-5.6l7.5-7.5a2.6 2.6 0 0 1 3.7 3.7l-7.4 7.4a1.2 1.2 0 0 1-1.8-1.7l6.8-6.8"/>,
  "copy": <><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  "link": <><path d="M9.5 14.5 14.5 9.5"/><path d="M11 6.5l1.2-1.2a4 4 0 0 1 5.7 5.7L16.5 12"/><path d="M13 17.5l-1.2 1.2a4 4 0 0 1-5.7-5.7L7.5 12"/></>,
  /* commerce */
  "cart": <><circle cx="9" cy="20" r="1.4" fill="currentColor"/><circle cx="17" cy="20" r="1.4" fill="currentColor"/><path d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.2h8.1a1.5 1.5 0 0 0 1.5-1.2L20 7.5H6"/></>,
  "credit-card": <><rect x="3.5" y="6" width="17" height="12" rx="2.5"/><path d="M3.5 10h17"/><path d="M7 14.5h3"/></>,
  "wallet": <><path d="M4 7.5a2 2 0 0 1 2-2h11a1.5 1.5 0 0 1 1.5 1.5V8"/><rect x="3.5" y="7.5" width="17" height="11" rx="2.5"/><circle cx="16.5" cy="13" r="1.4" fill="currentColor"/></>,
  "gift": <><rect x="4" y="8.5" width="16" height="4.5" rx="1"/><path d="M5 13v6a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6"/><path d="M12 8.5v11.5"/><path d="M12 8.5C10.8 6 9.6 4.6 8.2 5.2 6.9 5.7 8.5 8.5 12 8.5zm0 0c1.2-2.5 2.4-3.9 3.8-3.3C17.1 5.7 15.5 8.5 12 8.5z"/></>,
  "package": <><path d="M12 3.5 20 7.7v8.6L12 20.5 4 16.3V7.7l8-4.2z"/><path d="m4 7.7 8 4.2 8-4.2"/><path d="M12 11.9v8.6"/><path d="m8 5.6 8 4.2"/></>,
  /* interface */
  "menu": <path d="M4 7h16M4 12h16M4 17h16"/>,
  "close": <path d="M6 6l12 12M18 6 6 18"/>,
  "refresh": <><path d="M4.5 11a7.5 7.5 0 0 1 12.8-4.3L20 9"/><path d="M20 4.5V9h-4.5"/><path d="M19.5 13a7.5 7.5 0 0 1-12.8 4.3L4 15"/><path d="M4 19.5V15h4.5"/></>,
  "view": <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/></>,
  "clock": <><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></>,
  "location": <><path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></>,
  "sidebar": <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M9.5 4.5v15"/></>,
  "monitor": <><rect x="3.5" y="4.5" width="17" height="11.5" rx="2.5"/><path d="M12 16v4"/><path d="M8.5 20h7"/></>,
  /* system */
  "tools": <path d="m14.6 6.4 3.1-3.1a5.3 5.3 0 0 0-7 7L4.6 16.4a2 2 0 1 0 2.9 2.9l6.1-6.1a5.3 5.3 0 0 0 7-7l-3.1 3.1-2.4-.5-.5-2.4z"/>,
  "puzzle": <path d="M7.5 5H9a3 3 0 1 1 6 0h1.5a2.5 2.5 0 0 1 2.5 2.5V9a3 3 0 1 0 0 6v1.5a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 5 16.5v-9A2.5 2.5 0 0 1 7.5 5z"/>,
  "components": <><path d="m12 3.5 8 4.2-8 4.2-8-4.2 8-4.2z"/><path d="m4 12 8 4.2 8-4.2"/><path d="m4 16.2 8 4.2 8-4.2"/></>,
  /* toolbar */
  "chevron-left": <path d="M15 5l-7 7 7 7"/>,
  "chevron-right": <path d="M9 5l7 7-7 7"/>,
  /* window chrome — control-strip glyphs (2026-07-12 window-chrome spec) */
  "win-minimize": <path d="M5 12h14"/>,
  "win-maximize": <rect x="5.5" y="5.5" width="13" height="13" rx="1.5"/>,
  "win-restore": <><rect x="8" y="8" width="10.5" height="10.5" rx="1.5"/><path d="M5.5 15.5V6.5A1 1 0 0 1 6.5 5.5H15.5"/></>,
  "win-close": <path d="M6 6 18 18M18 6 6 18"/>,
};

export const ICON_NAMES = Object.keys(PATHS);

/** A design-system icon. Size comes from CSS where the slot owns it (nav, topbar);
    `size` is for the callers that don't have a slot. `tone` maps to a semantic colour token. */
export function Icon({ name, size, tone, className = '', ...rest }) {
  const paths = PATHS[name];
  if (!paths) return null;
  return (
    <svg className={`ico ${className}`.trim()} data-tone={tone || undefined}
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" {...rest}>{paths}</svg>
  );
}

/** Resolve a nav/route descriptor's `icon` field. Descriptors stay pure data (an icon *name*),
    so a plugin never has to import Core to declare one. Anything we don't recognise — an emoji
    from an un-migrated plugin, or a caller-supplied element — renders through untouched. */
export function renderIcon(icon, props) {
  return typeof icon === 'string' && icon in PATHS ? <Icon name={icon} {...props} /> : icon;
}
