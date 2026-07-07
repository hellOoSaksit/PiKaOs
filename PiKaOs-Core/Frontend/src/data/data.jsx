/* PiKaOs — ES module (migrated from PiKaOs-Core/data.jsx). Pure data — no imports. */

const NAV = [
  { group: "หน้าหลัก", items: [
    { id: "home", icon: "🏠", label: "หน้าหลัก", en: "Home" },
  ]},
  { group: "ผู้ดูแลระบบ", items: [
    { id: "admin", icon: "👥", label: "จัดการผู้ใช้", en: "User Management", perm: "user.view.any" },
    { id: "toolsmgr", icon: "🧰", label: "จัดการเครื่องมือ", en: "Tools", perm: "options.manage" },
    // "Install" groups everything that adds/manages plugins. Clicking it lands on the Modules list
    // (its route renders view="modules"); the children jump to each view. Local MCP is NOT a sidebar
    // entry — it's a tab inside the Marketplace hub (desktop-only), see screens-plugins.jsx.
    { id: "install", icon: "📥", label: "ติดตั้ง", en: "Install", perm: "plugins.manage", children: [
      { id: "modules", icon: "🧩", label: "โมดูล / ปลั๊กอิน", en: "Modules / Plugins", perm: "plugins.manage" },
      { id: "marketplace", icon: "🛍️", label: "มาร์เก็ตเพลส", en: "Marketplace", perm: "plugins.manage" },
      { id: "mypackages", icon: "📦", label: "แพ็กเกจของฉัน", en: "My Packages & Share", perm: "plugins.manage" },
    ]},
    { id: "permissions", icon: "🗝️", label: "แคตตาล็อกสิทธิ์", en: "Permissions", perm: "user.view.any", children: [
      { id: "roles", icon: "🔑", label: "บทบาทและสิทธิ์", en: "Roles & Access", perm: "role.manage" },
    ]},
    { id: "audit", icon: "📋", label: "บันทึกการตรวจสอบ", en: "Audit Log", perm: "audit.view" },
    { id: "settings", icon: "⚙️", label: "ตั้งค่าระบบ", en: "Settings" },
  ]},
];

const byId = (id) => (window.__charById || {})[id];
const statusLabel = { on: "ปฏิบัติงาน", busy: "กำลังคิด", idle: "ว่าง", away: "ไม่อยู่" };

export { NAV, byId, statusLabel };
