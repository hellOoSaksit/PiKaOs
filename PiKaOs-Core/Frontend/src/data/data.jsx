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
    // (its route renders view="modules"); the children jump to each view. Local MCP is NOT a sidebar
    // entry — it's a tab inside the Marketplace hub (desktop-only), see screens-plugins.jsx.
    { id: "install", icon: "download", label: "ติดตั้ง", en: "Install", perm: "plugins.manage", children: [
      { id: "modules", icon: "puzzle", label: "โมดูล / ปลั๊กอิน", en: "Modules / Plugins", perm: "plugins.manage" },
      { id: "marketplace", icon: "cart", label: "มาร์เก็ตเพลส", en: "Marketplace", perm: "plugins.manage" },
      { id: "mypackages", icon: "package", label: "แพ็กเกจของฉัน", en: "My Packages & Share", perm: "plugins.manage" },
    ]},
    { id: "settings", icon: "settings", label: "ตั้งค่าระบบ", en: "Settings" },
  ]},
];

export { NAV };
