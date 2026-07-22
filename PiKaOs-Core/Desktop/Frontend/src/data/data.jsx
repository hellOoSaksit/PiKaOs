/* PiKaOs — ES module (migrated from PiKaOs-Core/data.jsx). Pure data — no imports.
   `icon` is a design-system icon *name* (see components/ui/icons.jsx), never a glyph:
   keeping it a plain string is what lets this file — and every plugin descriptor — stay
   import-free while the shell resolves the name to an <Icon> at render time. */

const NAV = [
  { group: "หน้าหลัก", items: [
    { id: "home", icon: "home", label: "หน้าหลัก", en: "Home" },
  ]},
  { group: "ผู้ดูแลระบบ", items: [
    { id: "toolsmgr", icon: "tools", label: "จัดการเครื่องมือ", en: "Tools", perm: "options.manage" },
    // "Install" groups everything that adds/manages plugins. Clicking it lands on the Modules list
    // (its route renders view="modules"); the children jump to each view.
    { id: "install", icon: "download", label: "ติดตั้ง", en: "Install", perm: "plugins.manage", children: [
      { id: "modules", icon: "puzzle", label: "โมดูล / ปลั๊กอิน", en: "Modules / Plugins", perm: "plugins.manage" },
      { id: "marketplace", icon: "cart", label: "มาร์เก็ตเพลส", en: "Marketplace", perm: "plugins.manage" },
      { id: "mypackages", icon: "package", label: "แพ็กเกจของฉัน", en: "My Packages & Share", perm: "plugins.manage" },
    ]},
    // A sibling of Install, not a child: an MCP server is not a PiKaOs plugin — it's an external
    // process with its own consent gate, so it gets its own authority (mcp.manage) and its own item.
    // Icon reuses the existing "link" glyph rather than adding one (a new icon also needs a tile in
    // the design-system sheet, a second repo); nav stores the NAME, so swapping it later is free.
    { id: "mcpskill", icon: "link", label: "MCP และทักษะ", en: "MCP & Skills", perm: "mcp.manage" },
    { id: "settings", icon: "settings", label: "ตั้งค่าระบบ", en: "Settings" },
  ]},
];

export { NAV };
