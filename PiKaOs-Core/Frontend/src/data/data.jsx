/* PiKaOs — ES module (migrated from PiKaOs-Core/data.jsx). Pure data — no imports. */

/* ============================================================
   ORG DATA — AI multi-agent system framed as an adventurer guild
   Powered by Orchestrator (the orchestrator / guild master)
   ============================================================ */

const ORG = {
  name: "PiKaOs",
  thaiName: "ระบบเอเจนต์อัจฉริยะ",
  master: "ผู้ควบคุมกลาง",
  rank: "A",
  hall: "ศูนย์ควบคุมกลาง · Central Spire",
};

// NOTE: the roster is now DYNAMIC (see store.jsx). `AGENTS` is a live
// getter over window.__chars, kept so existing screens keep working.

// quest rank → reward weighting. status: active · queued · review · done · failed
const TASKS = [
  {
    id: "q1042", rank: "A", title: "สร้างระบบยืนยันตัวตนแบบ OAuth2",
    desc: "ออกแบบและพัฒนา service สำหรับ login/refresh token พร้อมเอกสาร",
    party: ["a4", "a3", "a2"], lead: "a4", status: "active", progress: 62,
    reward: 1800, manaCost: 240, steps: 7, stepDone: 4, deadline: "เหลือ 3 ชม.",
    tags: ["backend", "security"],
  },
  {
    id: "q1043", rank: "S", title: "วิจัยกลยุทธ์ retrieval สำหรับฐานความรู้",
    desc: "เปรียบเทียบ hybrid search vs. reranking บนคลังความรู้องค์กร",
    party: ["a6", "a1"], lead: "a6", status: "active", progress: 38,
    reward: 2600, manaCost: 410, steps: 9, stepDone: 3, deadline: "เหลือ 6 ชม.",
    tags: ["research", "rag"],
  },
  {
    id: "q1040", rank: "B", title: "เขียนเอกสาร onboarding สำหรับเอเจนต์ใหม่",
    desc: "รวบรวมขั้นตอนเริ่มต้นใช้งานองค์กรให้เอเจนต์ใหม่",
    party: ["a2"], lead: "a2", status: "review", progress: 90,
    reward: 720, manaCost: 90, steps: 4, stepDone: 4, deadline: "รอตรวจ",
    tags: ["docs"],
  },
  {
    id: "q1038", rank: "B", title: "ตรวจสอบ regression ก่อนปล่อยเวอร์ชัน",
    desc: "รัน test suite ทั้งหมดและรายงานจุดที่ล้มเหลว",
    party: ["a5", "a3"], lead: "a5", status: "queued", progress: 0,
    reward: 640, manaCost: 110, steps: 5, stepDone: 0, deadline: "ในคิว",
    tags: ["qa"],
  },
  {
    id: "q1035", rank: "C", title: "ปรับ schema ฐานข้อมูลผู้ใช้",
    desc: "migration เพิ่มฟิลด์ profile และ index",
    party: ["a4"], lead: "a4", status: "done", progress: 100,
    reward: 480, manaCost: 70, steps: 3, stepDone: 3, deadline: "สำเร็จ",
    tags: ["db"],
  },
  {
    id: "q1031", rank: "D", title: "สำรวจ dependency ที่ล้าสมัย",
    desc: "ตรวจหา package ที่ต้องอัปเดตและความเสี่ยง",
    party: ["a1"], lead: "a1", status: "done", progress: 100,
    reward: 260, manaCost: 40, steps: 2, stepDone: 2, deadline: "สำเร็จ",
    tags: ["maintenance"],
  },
];

// guild chat — multi-agent conversation in the meeting hall
const CHAT = [
  { id: "c1", who: "ผู้ควบคุมกลาง", role: "master", text: "เปิดห้องประชุมกลางสำหรับงาน #1042 — ระบบยืนยันตัวตน เริ่มมอบหมายงานได้", time: "09:02", kind: "system" },
  { id: "c2", who: "a4", text: "รับงานออกแบบสคีมา token แล้ว จะใช้ rotating refresh token อายุ 7 วัน", time: "09:03" },
  { id: "c3", who: "a3", text: "เข้าใจแล้ว ผมจะเริ่มพัฒนาโมดูล auth-service ตามสคีมาที่กำหนด", time: "09:05" },
  { id: "c4", who: "a1", text: "ข้อกำหนดเดิมระบุให้รองรับ social login ด้วย — เพิ่มเป็นงานย่อยไหม?", time: "09:06" },
  { id: "c5", who: "ผู้ควบคุมกลาง", role: "master", text: "อนุมัติ แตกเป็นงานย่อย #1042-b มอบให้ช่าง ตีโค้ด เพิ่ม provider", time: "09:07", kind: "system" },
  { id: "c6", who: "a2", text: "ผมจะร่างเอกสาร flow ควบคู่ไปด้วย เผื่อไว้ให้เอเจนต์ใหม่อ่าน", time: "09:09" },
  { id: "c7", who: "a3", text: "พัฒนาเสร็จ 4 จาก 7 ขั้น — endpoint /token ใช้งานได้แล้ว กำลังเขียน test", time: "09:14", attach: "auth-service · +312 บรรทัด" },
];

// live activity ticker — what's happening across the guild right now
const ACTIVITY = [
  { who: "a3", icon: "⚒️", text: "พัฒนา endpoint /token/refresh สำเร็จ", time: "เมื่อสักครู่", tone: "ok" },
  { who: "a6", icon: "🔮", text: "ดึงผลค้นคว้า 12 แหล่งเข้าคลังความรู้", time: "1 นาที", tone: "info" },
  { who: "a4", icon: "🏛️", text: "อัปเดตสคีมา token diagram v3", time: "3 นาที", tone: "" },
  { who: "a1", icon: "🧭", text: "แตกงาน #1042 เป็น 7 ขั้นตอนย่อย", time: "8 นาที", tone: "" },
  { who: "a2", icon: "📜", text: "ส่งเอกสาร onboarding เข้ารอบตรวจ", time: "12 นาที", tone: "warn" },
  { who: "a5", icon: "🛡️", text: "รอ build ใหม่จากช่าง ตีโค้ด", time: "15 นาที", tone: "" },
];

// mana (token) usage ledger
const TOKENS = {
  balance: 48200,
  cap: 80000,
  spentToday: 12640,
  spentWeek: 71300,
  burnRate: 1840, // per hour
  byAgent: [
    { id: "a6", pct: 31 }, { id: "a3", pct: 24 }, { id: "a4", pct: 19 },
    { id: "a1", pct: 12 }, { id: "a2", pct: 9 }, { id: "a5", pct: 5 },
  ],
};

// knowledge codex entries
const KNOWLEDGE = [
  { id: "k1", title: "สถาปัตยกรรม auth-service", type: "diagram", by: "a4", tags: ["security","backend"], updated: "วันนี้", refs: 9 },
  { id: "k2", title: "สรุปงานวิจัย retrieval (hybrid + rerank)", type: "research", by: "a6", tags: ["rag","research"], updated: "วันนี้", refs: 23 },
  { id: "k3", title: "คู่มือ onboarding เอเจนต์ใหม่", type: "doc", by: "a2", tags: ["docs"], updated: "เมื่อวาน", refs: 4 },
  { id: "k4", title: "มาตรฐานการเขียน test ขององค์กร", type: "doc", by: "a5", tags: ["qa"], updated: "2 วัน", refs: 15 },
  { id: "k5", title: "บันทึกการตัดสินใจ: rotating refresh token", type: "decision", by: "a4", tags: ["security"], updated: "3 วัน", refs: 7 },
  { id: "k6", title: "รายการ dependency เสี่ยงสูง", type: "note", by: "a1", tags: ["maintenance"], updated: "5 วัน", refs: 2 },
];

// treasury — completed reward log
const TREASURY = {
  gold: 24860,
  artifacts: 14,
  thisWeek: 6420,
  log: [
    { quest: "q1035", title: "ปรับ schema ฐานข้อมูล", reward: 480, when: "วันนี้" },
    { quest: "q1031", title: "สำรวจ dependency ล้าสมัย", reward: 260, when: "วันนี้" },
    { quest: "q1029", title: "แก้บั๊ก rate-limit", reward: 540, when: "เมื่อวาน" },
    { quest: "q1024", title: "เพิ่ม caching layer", reward: 900, when: "2 วัน" },
  ],
};

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

/* ---- Formal (Professional) vocabulary layer — used by the “ทางการ” theme ---- */
const NAV_GROUP_FORMAL = {
  "ศูนย์บัญชาการ": "การทำงานหลัก",
  "ความรู้และความทรงจำ": "ความรู้และข้อมูล",
  "ทรัพยากร": "ทรัพยากรระบบ",
  "ผู้ดูแลระบบ": "ผู้ดูแลระบบ",
};
const NAV_LABEL_FORMAL = {
  hall: "ภาพรวมระบบ", agents: "จัดการเอเจนต์", quests: "", world: "แผนผังการทำงาน",
  meeting: "ห้องสนทนา", codex: "ฐานความรู้", search: "ค้นหาข้อมูล", mana: "การใช้โทเคน",
  treasury: "งบประมาณ", stats: "สถิติการทำงาน", admin: "จัดการผู้ใช้", settings: "ตั้งค่าระบบ",
  history: "ประวัติการทำงาน", watch: "การเฝ้าระวังระบบ", workflows: "เวิร์กโฟลว์", sitemap: "ตรวจไซต์แมพ",
};
const ROUTE_TITLE_FORMAL = {
  hall: "ภาพรวมระบบ", agents: "จัดการเอเจนต์", quests: "รายการงาน", world: "แผนผังการทำงาน",
  meeting: "ห้องสนทนา", codex: "ฐานความรู้", search: "ค้นหาข้อมูล", mana: "การใช้โทเคน",
  treasury: "งบประมาณ", stats: "สถิติการทำงาน", admin: "จัดการผู้ใช้", settings: "ตั้งค่าระบบ",
  history: "ประวัติการทำงาน", watch: "การเฝ้าระวังระบบ",
  workflows: "เวิร์กโฟลว์", sitemap: "ตรวจไซต์แมพ",
};

const byId = (id) => (window.__charById || {})[id];
const priorityLabel = { S: "สูงสุด", A: "สูง", B: "ปานกลาง", C: "ปกติ", D: "ต่ำ" };
const statusLabel = { on: "ปฏิบัติงาน", busy: "กำลังคิด", idle: "ว่าง", away: "ไม่อยู่" };

// live getter — reads whatever roster App currently holds
Object.defineProperty(window, "AGENTS", { configurable: true, get: () => window.__chars || [] });

Object.assign(window, {
  ORG, TASKS, CHAT, ACTIVITY, TOKENS, KNOWLEDGE, TREASURY, NAV,
  NAV_GROUP_FORMAL, NAV_LABEL_FORMAL, ROUTE_TITLE_FORMAL,
  byId, priorityLabel, statusLabel,
});

export {
  ACTIVITY,
  CHAT,
  ORG,
  KNOWLEDGE,
  TOKENS,
  NAV,
  NAV_GROUP_FORMAL,
  NAV_LABEL_FORMAL,
  TASKS,
  ROUTE_TITLE_FORMAL,
  TREASURY,
  byId,
  priorityLabel,
  statusLabel
};
