/* PiKaOs — ES module (migrated from PiKaOs-Main/characters.jsx). */
import React from 'react';

/* ============================================================
   CHARACTERS — animated sprite "cards" for room agents.
   A character = an idle strip + a walk strip (40-frame, packed
   horizontally) the room plays back. The built-in "CEO" uses the
   pre-packed ceo-idle/ceo-walk PNGs; admins can ADD new cards by
   dropping a 5×8 (40-frame) sprite sheet per pose — we crop &
   re-pack it to a tidy strip in the browser, persist as data URLs.
   Also: master option lists (positions/tools/skills) + the
   room↔agent assignment helper + a global frame ticker.
   ============================================================ */

const SHEET_COLS = 5, SHEET_ROWS = 8, SHEET_N = 40;

/* built-in CEO (uses the packed PNG strips already in the project) */
const BUILTIN_CHARACTERS = [
  { id: "ceo", name: "CEO", th: "ผู้บริหาร", idleUrl: "/assets/ceo-idle.png", walkUrl: "/assets/ceo-walk.png", fw: 158, fh: 356, n: 40, builtin: true },
];

const CHARS_LS = "guildos.characters.v1";
function loadCharacters() {
  let custom = [];
  try { const r = localStorage.getItem(CHARS_LS); if (r) custom = JSON.parse(r) || []; } catch (e) { }
  return [...BUILTIN_CHARACTERS, ...custom];
}
function saveCharacters(list) {
  const custom = (list || []).filter(c => !c.builtin);
  try { localStorage.setItem(CHARS_LS, JSON.stringify(custom)); } catch (e) { }
  window.__characters = [...BUILTIN_CHARACTERS, ...custom];
}
function charSetById(id) {
  const all = window.__characters || BUILTIN_CHARACTERS;
  return all.find(c => c.id === id) || all[0] || BUILTIN_CHARACTERS[0];
}
window.__characters = loadCharacters();

/* ---- in-browser sprite-sheet processing (mirrors the offline packer) ---- */
function _sheetBBox(img) {
  const cw = Math.floor(img.width / SHEET_COLS), ch = Math.floor(img.height / SHEET_ROWS);
  const cv = document.createElement("canvas"); cv.width = img.width; cv.height = img.height;
  const ctx = cv.getContext("2d"); ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data; const W = img.width;
  let x0 = cw, y0 = ch, x1 = 0, y1 = 0;
  for (let r = 0; r < SHEET_ROWS; r++) for (let c = 0; c < SHEET_COLS; c++) {
    const ox = c * cw, oy = r * ch;
    for (let y = 0; y < ch; y++) { const rowBase = (oy + y) * W; for (let x = 0; x < cw; x++) {
      if (d[(rowBase + ox + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    } }
  }
  if (x1 < x0) { x0 = 0; y0 = 0; x1 = cw - 1; y1 = ch - 1; }
  return { cw, ch, x0, y0, w: x1 + 1 - x0, h: y1 + 1 - y0 };
}
function _packStrip(img, b, fw, fh, pad) {
  const cv = document.createElement("canvas"); cv.width = fw * SHEET_N; cv.height = fh;
  const ctx = cv.getContext("2d"); ctx.imageSmoothingEnabled = false;
  const offX = Math.round((fw - b.w) / 2), offY = fh - pad - b.h;
  for (let i = 0; i < SHEET_N; i++) {
    const c = i % SHEET_COLS, r = (i / SHEET_COLS) | 0;
    ctx.drawImage(img, c * b.cw + b.x0, r * b.ch + b.y0, b.w, b.h, i * fw + offX, offY, b.w, b.h);
  }
  return cv.toDataURL("image/png");
}
function _loadImg(file) {
  return new Promise((res, rej) => {
    const img = new Image(); img.onload = () => res(img); img.onerror = rej;
    img.src = URL.createObjectURL(file);
  });
}
/* process idle + walk files → packed character entry (no id/name) */
async function processCharacterSheets(idleFile, walkFile) {
  const idleImg = await _loadImg(idleFile);
  const walkImg = walkFile ? await _loadImg(walkFile) : idleImg;
  const bi = _sheetBBox(idleImg), bw = _sheetBBox(walkImg);
  const pad = 6;
  const fw = Math.max(bi.w, bw.w) + pad * 2, fh = Math.max(bi.h, bw.h) + pad * 2;
  const idleUrl = _packStrip(idleImg, bi, fw, fh, pad);
  const walkUrl = _packStrip(walkImg, bw, fw, fh, pad);
  return { idleUrl, walkUrl, fw, fh, n: SHEET_N };
}
function addCharacter(entry) {
  const list = loadCharacters();
  const id = "ch" + Date.now().toString(36);
  const next = [...list.filter(c => !c.builtin), { ...entry, id }];
  saveCharacters([...BUILTIN_CHARACTERS, ...next]);
  return id;
}
function removeCharacter(id) {
  if (id === "ceo") return;
  saveCharacters(loadCharacters().filter(c => c.id !== id));
}

/* ---- master option lists (positions / tools / skills) ---- */
const OPTS_LS = "guildos.options.v1";
const OPTS_DEFAULT = {
  positions: ["ผู้สำรวจเควส", "อาลักษณ์", "ช่างตีเหล็ก", "จอมเวทผังเมือง", "อัศวินพิทักษ์", "จอมเวทค้นคว้า"],
  skills: (window.SKILL_SUGGEST || ["วิเคราะห์", "เขียนโค้ด", "ออกแบบระบบ", "ทดสอบ", "ค้นคว้า", "สรุปเอกสาร"]).slice(),
  tools: (window.TOOL_SUGGEST || ["ค้นเว็บ", "อ่านไฟล์", "เขียนไฟล์", "รันคำสั่ง", "เรียก API", "ฐานข้อมูล"]).slice(),
};
function loadOptions() {
  try { const r = localStorage.getItem(OPTS_LS); if (r) { const o = JSON.parse(r); return { ...OPTS_DEFAULT, ...o }; } } catch (e) { }
  return JSON.parse(JSON.stringify(OPTS_DEFAULT));
}
function saveOptions(o) { try { localStorage.setItem(OPTS_LS, JSON.stringify(o)); } catch (e) { } window.__options = o; if (window.__syncGlobal) window.__syncGlobal("options", o); }
function addOption(kind, value) {
  const o = loadOptions(); const v = (value || "").trim(); if (!v) return o;
  if (!o[kind]) o[kind] = [];
  if (!o[kind].includes(v)) o[kind] = [...o[kind], v];
  saveOptions(o); return o;
}
function removeOption(kind, value) {
  const o = loadOptions(); if (!o[kind]) return o;
  o[kind] = o[kind].filter(x => x !== value);
  saveOptions(o); return o;
}

/* ---- global SKILL.md store (skill name -> markdown) ----
   Skill *definitions* live here (managed centrally in the Tools Manager);
   the Agent builder only SELECTS skills, it no longer adds/edits/deletes them. */
const SKILLDOCS_LS = "guildos.skilldocs.v1";
function loadSkillDocs() { try { return JSON.parse(localStorage.getItem(SKILLDOCS_LS)) || {}; } catch (e) { return {}; } }
function saveSkillDocs(map) { try { localStorage.setItem(SKILLDOCS_LS, JSON.stringify(map)); } catch (e) { } window.__skillDocs = map; if (window.__syncGlobal) window.__syncGlobal("skill_docs", map); return map; }

/* ---- tool configs: typed tools (MCP / LINE OA / Telegram / CMD ...) ---- */
const TOOLCFG_LS = "guildos.toolsConfig";
/* field spec: { k, label, ph, kind: text|secret|select|textarea|number|toggle, opts, full, mono }
   kind ละไว้ = text · full = กินเต็มความกว้างฟอร์ม · opts = [{value,label}] สำหรับ select */
const TOOL_TYPES = [
  {
    key: "mcp", label: "MCP Server", icon: "🔌", desc: "เชื่อมต่อเครื่องมือมาตรฐาน MCP — ระบุ endpoint และ transport ที่เซิร์ฟเวอร์รองรับ",
    fields: [
      { k: "endpoint", label: "Endpoint URL", ph: "https://host/mcp", full: true, mono: true },
      { k: "transport", label: "Transport", kind: "select", opts: [{ value: "sse", label: "SSE" }, { value: "http", label: "HTTP (streamable)" }, { value: "stdio", label: "STDIO" }] },
      { k: "apiKey", label: "API Key (ถ้ามี)", kind: "secret", ph: "sk-…" },
      { k: "timeout", label: "Timeout (วินาที)", kind: "number", ph: "30" },
    ],
  },
  {
    key: "lineoa", label: "LINE OA Bot", icon: "💚", desc: "บอทตอบแชตผ่าน LINE Official Account — ใช้ Token/Secret จาก LINE Developers Console",
    fields: [
      { k: "channelToken", label: "Channel Access Token", kind: "secret", full: true },
      { k: "channelSecret", label: "Channel Secret", kind: "secret" },
      { k: "replyMode", label: "โหมดส่งข้อความ", kind: "select", opts: [{ value: "reply", label: "ตอบกลับ (Reply)" }, { value: "push", label: "พุชหาผู้ใช้ (Push)" }] },
      { k: "greeting", label: "ข้อความต้อนรับ", kind: "textarea", ph: "สวัสดีครับ มีอะไรให้ช่วยไหม…", full: true },
    ],
  },
  {
    key: "telegram", label: "Telegram Bot", icon: "✈️", desc: "ส่งแจ้งเตือน/รับคำสั่งผ่าน Telegram — สร้าง Token จาก @BotFather",
    fields: [
      { k: "botToken", label: "Bot Token", kind: "secret", full: true },
      { k: "chatId", label: "Chat ID เริ่มต้น", ph: "-100xxxxxxxxxx", mono: true },
      { k: "parseMode", label: "รูปแบบข้อความ", kind: "select", opts: [{ value: "markdown", label: "Markdown" }, { value: "html", label: "HTML" }, { value: "plain", label: "ไม่จัดรูปแบบ" }] },
      { k: "silent", label: "ส่งแบบเงียบ (ไม่มีเสียงแจ้งเตือน)", kind: "toggle" },
    ],
  },
  {
    key: "cmd", label: "CMD / PowerShell", icon: "🖥️", desc: "รันคำสั่งบนเครื่อง — ระวัง: ควรเปิด \u2018ต้องยืนยันก่อนรัน\u2019 สำหรับคำสั่งที่แก้ไขระบบ",
    fields: [
      { k: "shell", label: "Shell", kind: "select", opts: [{ value: "powershell", label: "PowerShell" }, { value: "cmd", label: "CMD" }, { value: "bash", label: "Bash" }] },
      { k: "workdir", label: "Working Directory", ph: "C:\\work\\project", mono: true },
      { k: "command", label: "Command Template", kind: "textarea", ph: "git pull && npm test", full: true, mono: true },
      { k: "timeout", label: "Timeout (วินาที)", kind: "number", ph: "60" },
      { k: "confirm", label: "ต้องยืนยันก่อนรันทุกครั้ง", kind: "toggle" },
    ],
  },
  {
    key: "http", label: "HTTP API", icon: "🌐", desc: "เรียก REST API ภายนอก — ตั้งค่า auth, headers และตัวอย่าง body ให้เอเจนต์ใช้เป็นแม่แบบ",
    fields: [
      { k: "baseUrl", label: "Base URL", ph: "https://api.example.com/v1", full: true, mono: true },
      { k: "method", label: "Method เริ่มต้น", kind: "select", opts: ["GET", "POST", "PUT", "PATCH", "DELETE"].map(m => ({ value: m, label: m })) },
      { k: "contentType", label: "Content-Type", kind: "select", opts: [{ value: "json", label: "application/json" }, { value: "form", label: "multipart/form-data" }, { value: "urlencoded", label: "x-www-form-urlencoded" }] },
      { k: "authType", label: "การยืนยันตัวตน", kind: "select", opts: [{ value: "none", label: "ไม่มี" }, { value: "bearer", label: "Bearer Token" }, { value: "apikey", label: "API Key Header" }, { value: "basic", label: "Basic Auth" }] },
      { k: "authValue", label: "Token / API Key", kind: "secret" },
      { k: "headers", label: "Headers เพิ่มเติม (บรรทัดละ 1 — Name: Value)", kind: "textarea", ph: "X-Org-Id: 1234", full: true, mono: true },
      { k: "body", label: "ตัวอย่าง Request Body (JSON)", kind: "textarea", ph: '{ "query": "…" }', full: true, mono: true },
    ],
  },
  {
    key: "webhook", label: "Webhook", icon: "📨", desc: "ยิงเหตุการณ์ออกไปยังระบบอื่นเมื่อมีงานสำคัญ — รองรับลายเซ็น HMAC",
    fields: [
      { k: "url", label: "Webhook URL", ph: "https://hooks.example.com/…", full: true, mono: true },
      { k: "method", label: "Method", kind: "select", opts: [{ value: "POST", label: "POST" }, { value: "PUT", label: "PUT" }] },
      { k: "secret", label: "Signing Secret (HMAC)", kind: "secret" },
      { k: "payload", label: "เทมเพลต Payload (JSON)", kind: "textarea", ph: '{ "event": "task.done", "task": "{{title}}" }', full: true, mono: true },
    ],
  },
  {
    key: "db", label: "ฐานข้อมูล (Database)", icon: "🗄️", desc: "ให้เอเจนต์ query ฐานข้อมูลโดยตรง — แนะนำเปิด \u2018อ่านอย่างเดียว\u2019 ถ้าไม่จำเป็นต้องแก้ข้อมูล",
    fields: [
      { k: "driver", label: "ชนิดฐานข้อมูล", kind: "select", opts: [{ value: "postgres", label: "PostgreSQL" }, { value: "mysql", label: "MySQL / MariaDB" }, { value: "mssql", label: "SQL Server" }, { value: "sqlite", label: "SQLite" }] },
      { k: "host", label: "Host", ph: "localhost", mono: true },
      { k: "port", label: "Port", kind: "number", ph: "5432" },
      { k: "database", label: "ชื่อฐานข้อมูล", mono: true },
      { k: "user", label: "ผู้ใช้", mono: true },
      { k: "password", label: "รหัสผ่าน", kind: "secret" },
      { k: "readonly", label: "อ่านอย่างเดียว (ห้าม INSERT/UPDATE/DELETE)", kind: "toggle" },
    ],
  },
  {
    key: "email", label: "อีเมล (SMTP)", icon: "📧", desc: "ส่งอีเมลสรุปงาน/แจ้งเตือนผ่าน SMTP — ใช้ App Password สำหรับ Gmail/Outlook",
    fields: [
      { k: "host", label: "SMTP Host", ph: "smtp.gmail.com", mono: true },
      { k: "port", label: "Port", kind: "number", ph: "587" },
      { k: "user", label: "บัญชีผู้ใช้", ph: "bot@company.com", mono: true },
      { k: "password", label: "รหัสผ่าน / App Password", kind: "secret" },
      { k: "from", label: "ชื่อผู้ส่ง (From)", ph: "PiKaOs <bot@company.com>", full: true },
      { k: "tls", label: "ใช้ TLS/SSL", kind: "toggle" },
    ],
  },
  {
    key: "custom", label: "อื่นๆ (Custom)", icon: "🧩", desc: "เครื่องมือที่ยังไม่มีชนิดรองรับ — บันทึกรายละเอียดไว้ให้ทีมตั้งค่าต่อ",
    fields: [
      { k: "note", label: "รายละเอียด", kind: "textarea", ph: "เครื่องมือนี้ทำอะไร เชื่อมต่ออย่างไร…", full: true },
      { k: "docsUrl", label: "ลิงก์เอกสาร (ถ้ามี)", ph: "https://…", full: true, mono: true },
    ],
  },
];
function loadToolCfgs() {
  try { const r = localStorage.getItem(TOOLCFG_LS); if (r) return JSON.parse(r); } catch (e) { }
  /* seed from the plain tool-name options so existing agents keep working */
  return (loadOptions().tools || []).map((n, i) => ({ id: "t" + Date.now() + "_" + i, name: n, type: "custom", enabled: true, config: {} }));
}
function saveToolCfgs(list) {
  try { localStorage.setItem(TOOLCFG_LS, JSON.stringify(list)); } catch (e) { }
  const o = loadOptions(); o.tools = list.filter(t => t.enabled !== false).map(t => t.name); saveOptions(o);
  if (window.__syncGlobal) window.__syncGlobal("tool_cfgs", list);
  return list;
}

/* Apply a global config blob pulled from the server into the local cache, WITHOUT re-syncing
   (used on sign-in so Tools/roster config is shared across devices). Tools config = global tier. */
function applyGlobalConfig(key, value) {
  if (value == null) return;
  try {
    if (key === "options") { localStorage.setItem(OPTS_LS, JSON.stringify(value)); window.__options = value; }
    else if (key === "skill_docs") { localStorage.setItem(SKILLDOCS_LS, JSON.stringify(value)); window.__skillDocs = value; }
    else if (key === "tool_cfgs") { localStorage.setItem(TOOLCFG_LS, JSON.stringify(value)); }
  } catch (e) { }
}

window.__options = loadOptions();

/* ---- CORE (mandatory) rules — shared across every agent, edited only by privileged users ---- */
const CORE_RULES_LS = "guildos.corerules.v1";
const CORE_RULES_DEFAULT = [
  "ปฏิบัติตามนโยบายความปลอดภัยและความเป็นส่วนตัวของกิลด์เสมอ",
  "ไม่กระทำการที่ผิดกฎหมายหรือสร้างความเสียหายต่อผู้ใช้/ระบบ",
  "หากกฎอื่นขัดแย้งกับกฎหลัก ให้ยึดกฎหลักเป็นสำคัญเสมอ",
];
function loadCoreRules() { try { const r = localStorage.getItem(CORE_RULES_LS); return r ? JSON.parse(r) : CORE_RULES_DEFAULT.slice(); } catch (e) { return CORE_RULES_DEFAULT.slice(); } }
function saveCoreRules(list) { try { localStorage.setItem(CORE_RULES_LS, JSON.stringify(list)); } catch (e) { } window.__coreRules = list; }
window.__coreRules = loadCoreRules();

/* ---- Profiles (templates authored by privileged users): full settings + .md docs ---- */
const PROFILES_SEED = [
  { id: "pf_backend", seed: true, name: "นักพัฒนา Backend",
    settings: { characterId: "ceo", position: "ช่างตีเหล็ก", role: "Backend Engineer", model: "Hermes-3 · 70B", apiKeyId: null, skills: ["เขียนโค้ด", "ดีบั๊ก"], tools: ["รันคำสั่ง", "อ่านไฟล์", "เขียนไฟล์"], workflows: [], rules: ["เขียนเทสต์ก่อนส่งงาน"], status: "on", goal: "ส่งโค้ดที่ผ่านการทดสอบ", desc: "วิศวกรฝั่ง backend" },
    docs: { "SKILL.md": "<h1>SKILL</h1><p>พัฒนา API / แก้บั๊ก / เขียนเทสต์</p>", "TOOLS.md": "<h1>TOOLS</h1><ul><li>shell · file · db</li></ul>" } },
  { id: "pf_research", seed: true, name: "นักวิจัย/ค้นคว้า",
    settings: { characterId: "ceo", position: "จอมเวทค้นคว้า", role: "Research Agent", model: "Hermes-3 · 405B", apiKeyId: null, skills: ["ค้นคว้า", "สังเคราะห์"], tools: ["ค้นเว็บ", "อ่านไฟล์"], workflows: [], rules: ["อ้างอิงแหล่งที่มาเสมอ"], status: "busy", goal: "หาคำตอบที่ดีที่สุดจากหลักฐาน", desc: "สืบค้นและสังเคราะห์ข้อมูล" },
    docs: { "REFERENCE.md": "<h1>REFERENCE</h1><p>รายการแหล่งข้อมูลที่เชื่อถือ…</p>" } },
];
const CEO_DEFAULTS = { name: "CEO", characterId: "ceo", classKey: "mage", color: "#c8a24a", rank: "S", position: "CEO", role: "Chief Executive · แจกจ่ายงาน", model: "Hermes-3 · 405B", apiKeyId: null, skills: ["มอบหมายงาน", "กำกับทีม", "จัดลำดับความสำคัญ"], tools: ["มอบหมายงาน", "ติดตามสถานะ"], workflows: [], rules: ["แจกจ่ายงานให้ตรงความสามารถของสมาชิก", "ติดตามความคืบหน้าทุกห้อง"], status: "on", goal: "กำกับและกระจายงานให้ทุกห้องเดินหน้า", desc: "ผู้บริหารสูงสุด แจกจ่ายและกำกับงานทุกห้อง" };
window.CEO_DEFAULTS = CEO_DEFAULTS;
const PROFILES_LS = "guildos.profiles.v1";
const PROFILES_RM_LS = "guildos.profiles.removed.v1";
function _removedSeeds() { try { return JSON.parse(localStorage.getItem(PROFILES_RM_LS) || "[]"); } catch (e) { return []; } }
function _rawCustomProfiles() { try { return JSON.parse(localStorage.getItem(PROFILES_LS) || "[]") || []; } catch (e) { return []; } }
function loadProfiles() { const rm = _removedSeeds(); return [...PROFILES_SEED.filter(s => !rm.includes(s.id)), ..._rawCustomProfiles()]; }
function saveProfiles(list) { const custom = (list || []).filter(p => !p.seed); try { localStorage.setItem(PROFILES_LS, JSON.stringify(custom)); } catch (e) { } window.__profiles = loadProfiles(); }
function addProfile(p) { const id = "pf" + Date.now().toString(36); try { localStorage.setItem(PROFILES_LS, JSON.stringify([..._rawCustomProfiles(), { ...p, id }])); } catch (e) { } window.__profiles = loadProfiles(); return id; }
function removeProfile(id) {
  if (PROFILES_SEED.some(s => s.id === id)) { const rm = _removedSeeds(); if (!rm.includes(id)) { rm.push(id); try { localStorage.setItem(PROFILES_RM_LS, JSON.stringify(rm)); } catch (e) { } } }
  else { try { localStorage.setItem(PROFILES_LS, JSON.stringify(_rawCustomProfiles().filter(p => p.id !== id))); } catch (e) { } }
  window.__profiles = loadProfiles();
}
function profileNameExists(name) { return loadProfiles().some(p => p.name.trim() === String(name).trim()); }
window.__profiles = loadProfiles();

/* ---- room ↔ agent assignment (agents reuse the same roster across rooms) ---- */
function _hashStr(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
/* an agent belongs to its homeRoom if set, else it's distributed by a stable hash */
function roomAgents(room, roomIndex, rooms, chars) {
  const n = Math.max(1, (rooms || []).length);
  // the locked Agent CEO is the work-distributor → present in EVERY room, always.
  return (chars || []).filter(c => c.locked || (c.homeRoom ? c.homeRoom === room.id : (_hashStr(c.id) % n) === roomIndex));
}

/* ---- single global frame ticker (drives every sprite via --f on <html>) ---- */
(function () {
  if (window.__charTicker) return;
  let f = 0;
  window.__charTicker = setInterval(() => {
    f = (f + 1) % SHEET_N;
    try { document.documentElement.style.setProperty("--f", f); } catch (e) { }
  }, 95);
})();

Object.assign(window, {
  SHEET_COLS, SHEET_ROWS, SHEET_N, BUILTIN_CHARACTERS,
  loadCharacters, saveCharacters, charSetById, processCharacterSheets, addCharacter, removeCharacter,
  loadOptions, saveOptions, addOption, removeOption, loadSkillDocs, saveSkillDocs, roomAgents,
  TOOL_TYPES, loadToolCfgs, saveToolCfgs,
  loadCoreRules, saveCoreRules,
  loadProfiles, saveProfiles, addProfile, removeProfile, profileNameExists,
});

export {
  BUILTIN_CHARACTERS,
  CEO_DEFAULTS,
  CHARS_LS,
  CORE_RULES_DEFAULT,
  CORE_RULES_LS,
  OPTS_DEFAULT,
  OPTS_LS,
  PROFILES_LS,
  PROFILES_RM_LS,
  PROFILES_SEED,
  SHEET_COLS,
  _hashStr,
  _loadImg,
  _packStrip,
  _rawCustomProfiles,
  _removedSeeds,
  _sheetBBox,
  addCharacter,
  addOption,
  removeOption,
  loadSkillDocs,
  saveSkillDocs,
  TOOL_TYPES,
  loadToolCfgs,
  saveToolCfgs,
  applyGlobalConfig,
  addProfile,
  charSetById,
  loadCharacters,
  loadCoreRules,
  loadOptions,
  loadProfiles,
  processCharacterSheets,
  profileNameExists,
  removeCharacter,
  removeProfile,
  roomAgents,
  saveCharacters,
  saveCoreRules,
  saveOptions,
  saveProfiles
};
