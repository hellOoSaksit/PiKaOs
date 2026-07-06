/* PiKaOs — ES module (migrated from PiKaOs-Core/store.jsx). */
import React from 'react';
import { CLASS_OPTS } from './sprites.jsx';

/* ============================================================
   CHARACTER STORE — dynamic roster, persistence, sample seed
   ============================================================ */

const STATUS_OPTS = [
  { key: "on", th: "ปฏิบัติงาน" },
  { key: "busy", th: "กำลังคิด" },
  { key: "idle", th: "ว่าง" },
  { key: "away", th: "ไม่อยู่" },
];

const MODEL_OPTS = ["Hermes-3 · 405B", "Hermes-3 · 70B", "Hermes-3 · 8B"];

const SKILL_SUGGEST = ["วิเคราะห์", "เขียนโค้ด", "ออกแบบระบบ", "ทดสอบ", "ค้นคว้า", "สรุปเอกสาร",
  "วางแผน", "ดีบั๊ก", "รีวิวโค้ด", "เจรจา", "จัดการข้อมูล", "สังเคราะห์"];

const TOOL_SUGGEST = ["web_search", "code_run", "file_read", "sql", "git", "terminal", "vector_db", "browser"];

// random map position helper
function randPos() {
  return { x: 18 + Math.random() * 64, y: 22 + Math.random() * 56 };
}

// factory — fills sensible defaults for builder output
let _idn = 100;
function makeCharacter(input) {
  const rankXp = { S: 91, A: 80, B: 62, C: 45, D: 30 };
  const opt = CLASS_OPTS.find(o => o.key === (input.roleKey || "analyst")) || {};
  const c = {
    id: input.id || ("c" + (++_idn) + Date.now().toString(36).slice(-3)),
    name: input.name || "เอเจนต์นิรนาม",
    desc: input.desc || "",
    role: input.role || "Generalist Agent",
    position: input.position || "เอเจนต์",
    skills: input.skills || [],
    rules: input.rules || [],
    goal: input.goal || "",
    tools: input.tools || [],
    workflows: input.workflows || [],
    roleKey: input.roleKey || "analyst",
    color: input.color || "#c7a14a",
    rank: input.rank || "C",
    model: input.model || "Hermes-3 · 8B",
    status: input.status || "idle",
    task: input.task || "พร้อมรับงานใหม่",
    level: input.level || (Math.floor((rankXp[input.rank || "C"] || 40) / 4) + 4),
    tokens: input.tokens ?? (50 + Math.floor(Math.random() * 45)),
    health: input.health ?? (84 + Math.floor(Math.random() * 15)),
    experience: input.experience ?? (rankXp[input.rank || "C"] || 40),
    tasksDone: input.tasksDone ?? Math.floor(Math.random() * 120),
    success: input.success ?? (88 + Math.floor(Math.random() * 11)),
    icon: (CLASS_OPTS.find(o => o.key === (input.roleKey || "analyst")) || {}).icon || "🎭",
    classEn: opt.en || "Agent",
    classTh: input.position || opt.th || "เอเจนต์",
    specialty: input.specialty || (input.skills && input.skills[0]) || "ทั่วไป",
    apiKeyId: input.apiKeyId || null,
    skillDocs: input.skillDocs || {},
    characterId: input.characterId || "ceo",
    homeRoom: input.homeRoom || null,
    locked: input.locked || false,
    pos: input.pos || randPos(),
  };
  return c;
}

// ---- Sample seed: the original six, now full character records (ids match quests/chat) ----
const SAMPLE_CHARS = [
  makeCharacter({
    id: "ceo", name: "CEO", roleKey: "mage", color: "#c8a24a", rank: "S",
    position: "CEO", role: "Chief Executive · แจกจ่ายงาน", model: "Hermes-3 · 405B", status: "on",
    task: "แจกจ่ายและกำกับงานทุกห้อง", level: 40, tokens: 99, health: 100, experience: 99, tasksDone: 999, success: 99,
    skills: ["มอบหมายงาน", "กำกับทีม", "จัดลำดับความสำคัญ"], locked: true,
  }),
  makeCharacter({
    id: "a1", name: "อ้อย นักวิเคราะห์", roleKey: "analyst", color: "#5b87b8", rank: "B",
    position: "ผู้สำรวจงาน", role: "Requirement Analyst", model: "Hermes-3 · 70B", status: "busy",
    task: "ถอดข้อกำหนดจากงาน #1042", level: 14, tokens: 72, health: 96, experience: 64, tasksDone: 128, success: 94,
    desc: "นักวิเคราะห์ผู้เชี่ยวชาญการอ่านงานและแตกออกเป็นงานย่อยที่ทีมลงมือได้จริง",
    skills: ["วิเคราะห์", "วางแผน", "แตกงาน"], goal: "เปลี่ยนคำขอที่คลุมเครือให้เป็นแผนงานชัดเจน",
    tools: ["web_search", "file_read"],
    rules: ["ถามให้ชัดก่อนเริ่มเสมอ", "ห้ามสันนิษฐานข้อกำหนดที่ไม่ได้ระบุ", "สรุปเป็นข้อ ๆ ที่ตรวจสอบได้"],
  }),
  makeCharacter({
    id: "a2", name: "เขียน ผู้จัดทำเอกสาร", roleKey: "scribe", color: "#9173c0", rank: "C",
    position: "เอเจนต์เอกสาร", role: "Documentation", model: "Hermes-3 · 8B", status: "on",
    task: "ร่างเอกสาร API ภาคผนวก", level: 9, tokens: 58, health: 88, experience: 41, tasksDone: 86, success: 91,
    desc: "ผู้จัดทำเอกสารขององค์กร เปลี่ยนงานเทคนิคให้เป็นเอกสารที่อ่านเข้าใจง่าย",
    skills: ["สรุปเอกสาร", "เขียน"], goal: "ทุกการตัดสินใจขององค์กรต้องมีบันทึกที่ค้นเจอได้",
    tools: ["file_read"], rules: ["เขียนให้คนนอกทีมเข้าใจ", "อ้างอิงแหล่งที่มาทุกครั้ง"],
  }),
  makeCharacter({
    id: "a3", name: "ช่าง นักพัฒนา", roleKey: "smith", color: "#c25563", rank: "A",
    position: "เอเจนต์พัฒนา", role: "Implementation", model: "Hermes-3 · 70B", status: "on",
    task: "พัฒนาโมดูล auth-service", level: 22, tokens: 81, health: 92, experience: 78, tasksDone: 240, success: 89,
    desc: "เอเจนต์พัฒนา แปลงแบบให้เป็นโค้ดที่ใช้งานได้จริง",
    skills: ["เขียนโค้ด", "ดีบั๊ก", "รีวิวโค้ด"], goal: "ส่งโค้ดที่ผ่านการทดสอบและบำรุงรักษาง่าย",
    tools: ["code_run", "git", "terminal"],
    workflows: ["wf_pr_review", "wf_deploy"],
    rules: ["เขียนเทสต์ควบคู่เสมอ", "ห้าม commit ความลับลงคลัง", "ทำตามสคีมาจากสถาปนิก"],
  }),
  makeCharacter({
    id: "a4", name: "แผน สถาปนิกระบบ", roleKey: "mage", color: "#5b87b8", rank: "A",
    position: "เอเจนต์สถาปนิกระบบ", role: "System Architect", model: "Hermes-3 · 70B", status: "busy",
    task: "ออกแบบสคีมาเหตุการณ์", level: 25, tokens: 88, health: 90, experience: 83, tasksDone: 176, success: 96,
    desc: "เอเจนต์ผู้วางผังโครงสร้างทั้งหมดของระบบ ก่อนเริ่มพัฒนา",
    skills: ["ออกแบบระบบ", "วางแผน"], goal: "ออกแบบระบบให้ขยายได้และเข้าใจง่าย",
    tools: ["file_read", "vector_db"],
    rules: ["คิดเรื่องการขยายตัวก่อนเสมอ", "บันทึกการตัดสินใจเชิงสถาปัตยกรรมทุกครั้ง"],
  }),
  makeCharacter({
    id: "a5", name: "ตรวจ ผู้ประกันคุณภาพ", roleKey: "knight", color: "#7fa45a", rank: "B",
    position: "เอเจนต์ตรวจสอบคุณภาพ", role: "Quality Assurance", model: "Hermes-3 · 8B", status: "idle",
    task: "รอผลการ build จากช่าง", level: 16, tokens: 64, health: 99, experience: 52, tasksDone: 154, success: 93,
    desc: "เอเจนต์ตรวจสอบคุณภาพ ไม่ปล่อยให้ข้อบกพร่องหลุดผ่านระบบ",
    skills: ["ทดสอบ", "รีวิวโค้ด"], goal: "จับบั๊กให้เจอก่อนผู้ใช้",
    tools: ["code_run", "terminal"],
    rules: ["ทดสอบ edge case เสมอ", "รายงานทุกความล้มเหลวพร้อมขั้นตอนทำซ้ำ"],
  }),
  makeCharacter({
    id: "a6", name: "ค้น นักวิจัย", roleKey: "researcher", color: "#9173c0", rank: "S",
    position: "เอเจนต์วิจัย", role: "Research Agent", model: "Hermes-3 · 405B", status: "busy",
    task: "สืบค้นคลังความรู้ · 12 แหล่ง", level: 31, tokens: 93, health: 86, experience: 91, tasksDone: 312, success: 97,
    desc: "เอเจนต์ความรู้ สืบค้นและสังเคราะห์ข้อมูลจากทุกสารบบเพื่อสนับสนุนองค์กร",
    skills: ["ค้นคว้า", "สังเคราะห์", "วิเคราะห์"], goal: "หาคำตอบที่ดีที่สุดจากหลักฐานที่มี",
    tools: ["web_search", "vector_db", "browser"],
    workflows: ["wf_ingest", "wf_daily_digest"],
    rules: ["อ้างอิงแหล่งทุกข้อสรุป", "ระบุระดับความเชื่อมั่นเสมอ", "แยกข้อเท็จจริงออกจากการคาดเดา"],
  }),
];

// persistence
const CHAR_KEY = "guildos-characters-v1";
function _ensureCeo(arr) {
  if (!arr.some(c => c.id === "ceo")) { const ceo = SAMPLE_CHARS.find(c => c.id === "ceo"); if (ceo) arr = [{ ...ceo, pos: randPos() }, ...arr]; }
  return arr.map(c => c.id === "ceo" ? { ...c, locked: true, position: c.position || "CEO" } : c);
}
// keep persisted rosters working across the formal-rename: map old field names on load
// (classKey→roleKey · mana→tokens · hp→health · xp→experience · quests→tasksDone).
const _FIELD_ALIASES = { classKey: "roleKey", mana: "tokens", hp: "health", xp: "experience", quests: "tasksDone" };
function _migrateChar(c) {
  if (c) for (const [oldK, newK] of Object.entries(_FIELD_ALIASES)) {
    if (c[oldK] !== undefined && c[newK] === undefined) { c[newK] = c[oldK]; delete c[oldK]; }
  }
  return { ...c, pos: c.pos || randPos() };
}
function loadChars() {
  try {
    const raw = localStorage.getItem(CHAR_KEY);
    if (raw === null) return SAMPLE_CHARS.map(c => ({ ...c, pos: c.pos || randPos() }));  // first run → seed demo roster
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? _ensureCeo(arr.map(_migrateChar)) : SAMPLE_CHARS.map(c => ({ ...c, pos: c.pos || randPos() }));
  } catch { return SAMPLE_CHARS.map(c => ({ ...c, pos: c.pos || randPos() })); }
}
function saveChars(arr) {
  try { localStorage.setItem(CHAR_KEY, JSON.stringify(arr)); } catch {}
}
const ARCH_KEY = "guildos-archived-agents-v1";
function loadArchived() {
  try { const raw = localStorage.getItem(ARCH_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveArchived(arr) { try { localStorage.setItem(ARCH_KEY, JSON.stringify(arr)); } catch {} }

const GuildCtx = React.createContext(null);

/* ============================================================
   WORLD — MMO map data: zones, placeable items, seed, persistence
   ============================================================ */
const ZONES = [
  { id: "spire",  th: "ศูนย์ควบคุมกลาง", en: "Guild Spire",   x: 38, y: 39, w: 24, h: 23, color: "#c8a24a", terrain: "safe",   desc: "ศูนย์บัญชาการ · จุดเริ่มต้น" },
  { id: "forest", th: "โซนความรู้",  en: "Knowledge Wilds", x: 2,  y: 4,  w: 33, h: 38, color: "#5f8a4a", terrain: "forest", desc: "แหล่งความรู้ · วิจัย" },
  { id: "mines",  th: "โซนพัฒนา",  en: "Code Mines",     x: 65, y: 3,  w: 33, h: 40, color: "#a06a32", terrain: "mine",   desc: "แหล่งพัฒนาโค้ด · ผลงาน" },
  { id: "market", th: "ศูนย์ทรัพยากร",    en: "Mana Bazaar",    x: 3,  y: 60, w: 36, h: 36, color: "#4f79ad", terrain: "water",  desc: "ทรัพยากร · โทเคน" },
  { id: "arena",  th: "โซนทดสอบ",   en: "Trial Grounds",  x: 61, y: 57, w: 36, h: 39, color: "#b1452f", terrain: "arena",  desc: "ทดสอบ · ตรวจหาข้อบกพร่อง" },
];

// group: farm | structure | marker
const PLACEABLES = [
  { type: "mana_crystal",   icon: "🔷", th: "แหล่งโทเคน",     group: "farm", farm: true, yield: "+โทเคน" },
  { type: "knowledge_tree", icon: "🌳", th: "แหล่งความรู้",    group: "farm", farm: true, yield: "+ความรู้" },
  { type: "code_ore",       icon: "💎", th: "แหล่งโค้ด",       group: "farm", farm: true, yield: "+ผลงาน" },
  { type: "data_node",      icon: "🍄", th: "จุดข้อมูล",       group: "farm", farm: true, yield: "+ข้อมูล" },
  { type: "tower",          icon: "🗼", th: "จุดสังเกตการณ์",  group: "structure" },
  { type: "storage",        icon: "📦", th: "ที่จัดเก็บ",      group: "structure" },
  { type: "portal",         icon: "🌀", th: "ทางลัด",          group: "structure" },
  { type: "anvil",          icon: "⚒️", th: "โซนพัฒนา",        group: "structure" },
  { type: "library",        icon: "📚", th: "คลังเอกสาร",      group: "structure" },
  { type: "campfire",       icon: "🔥", th: "จุดพัก",          group: "structure" },
  { type: "banner",         icon: "🚩", th: "สัญลักษณ์องค์กร",  group: "marker" },
  { type: "boss",           icon: "💀", th: "งานสำคัญ",        group: "marker" },
  { type: "chest",          icon: "🎁", th: "กล่องผลลัพธ์",    group: "marker" },
  { type: "rock",           icon: "🪨", th: "ก้อนหิน",         group: "marker" },
];
const placeableOf = (t) => PLACEABLES.find(p => p.type === t) || { icon: "❓", th: t };

let _wid = 0;
const wobj = (type, x, y) => ({ id: "w" + (++_wid) + "_" + Math.random().toString(36).slice(2, 6), type, x, y });
const WORLD_SEED = [
  wobj("banner", 50, 46), wobj("storage", 44, 54), wobj("campfire", 56, 53),
  wobj("knowledge_tree", 12, 16), wobj("knowledge_tree", 24, 30), wobj("data_node", 9, 33),
  wobj("code_ore", 76, 14), wobj("code_ore", 88, 28), wobj("anvil", 82, 36),
  wobj("mana_crystal", 12, 74), wobj("mana_crystal", 28, 86), wobj("storage", 20, 68),
  wobj("boss", 80, 76), wobj("chest", 70, 88), wobj("tower", 90, 60),
  wobj("portal", 33, 50), wobj("portal", 64, 48),
];

const WORLD_KEY = "guild-world-v1";
function loadWorld() {
  try {
    const raw = localStorage.getItem(WORLD_KEY);
    if (raw === null) return WORLD_SEED.map(o => ({ ...o }));
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : WORLD_SEED.map(o => ({ ...o }));
  } catch { return WORLD_SEED.map(o => ({ ...o })); }
}
function saveWorld(arr) { try { localStorage.setItem(WORLD_KEY, JSON.stringify(arr)); } catch {} }
const newWorldObj = (type, x, y) => wobj(type, x, y);
const zoneAt = (x, y) => ZONES.find(z => x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h);

/* AI API keys are managed by the tools screen (จัดการเครื่องมือ) via the backend /llm/connections
   flow — write-only, encrypted at rest. The old plaintext localStorage store (guildos.apikeys.v1 /
   window.__apiKeys) was an insecure duplicate and has been removed (F4). */

Object.assign(window, {
  STATUS_OPTS, MODEL_OPTS, SKILL_SUGGEST, TOOL_SUGGEST,
  makeCharacter, SAMPLE_CHARS, loadChars, saveChars, randPos, GuildCtx,
  loadArchived, saveArchived,
  ZONES, PLACEABLES, placeableOf, WORLD_SEED, loadWorld, saveWorld, newWorldObj, zoneAt,
});

export {
  ARCH_KEY,
  CHAR_KEY,
  GuildCtx,
  MODEL_OPTS,
  PLACEABLES,
  SAMPLE_CHARS,
  SKILL_SUGGEST,
  STATUS_OPTS,
  TOOL_SUGGEST,
  WORLD_KEY,
  WORLD_SEED,
  ZONES,
  _ensureCeo,
  _idn,
  _wid,
  loadArchived,
  loadChars,
  loadWorld,
  makeCharacter,
  newWorldObj,
  placeableOf,
  randPos,
  saveArchived,
  saveChars,
  saveWorld,
  wobj,
  zoneAt
};
