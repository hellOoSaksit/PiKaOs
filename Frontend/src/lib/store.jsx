/* PiKaOs — ES module (migrated from PiKaOs-Main/store.jsx). */
import React from 'react';
import { CLASS_OPTS } from './sprites.jsx';

/* ============================================================
   CHARACTER STORE — dynamic roster, persistence, sample seed
   ============================================================ */

const STATUS_OPTS = [
  { key: "on", th: "ปฏิบัติงาน" },
  { key: "busy", th: "กำลังคิด" },
  { key: "idle", th: "ว่าง" },
  { key: "away", th: "ออกเดินทาง" },
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
  const opt = CLASS_OPTS.find(o => o.key === (input.classKey || "analyst")) || {};
  const c = {
    id: input.id || ("c" + (++_idn) + Date.now().toString(36).slice(-3)),
    name: input.name || "นักผจญภัยนิรนาม",
    desc: input.desc || "",
    role: input.role || "Generalist Agent",
    position: input.position || "นักผจญภัย",
    skills: input.skills || [],
    rules: input.rules || [],
    goal: input.goal || "",
    tools: input.tools || [],
    workflows: input.workflows || [],
    classKey: input.classKey || "analyst",
    color: input.color || "#c7a14a",
    rank: input.rank || "C",
    model: input.model || "Hermes-3 · 8B",
    status: input.status || "idle",
    task: input.task || "พร้อมรับเควสใหม่",
    level: input.level || (Math.floor((rankXp[input.rank || "C"] || 40) / 4) + 4),
    mana: input.mana ?? (50 + Math.floor(Math.random() * 45)),
    hp: input.hp ?? (84 + Math.floor(Math.random() * 15)),
    xp: input.xp ?? (rankXp[input.rank || "C"] || 40),
    quests: input.quests ?? Math.floor(Math.random() * 120),
    success: input.success ?? (88 + Math.floor(Math.random() * 11)),
    icon: (CLASS_OPTS.find(o => o.key === (input.classKey || "analyst")) || {}).icon || "🎭",
    classEn: opt.en || "Agent",
    classTh: input.position || opt.th || "นักผจญภัย",
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
    id: "ceo", name: "CEO", classKey: "mage", color: "#c8a24a", rank: "S",
    position: "CEO", role: "Chief Executive · แจกจ่ายงาน", model: "Hermes-3 · 405B", status: "on",
    task: "แจกจ่ายและกำกับงานทุกห้อง", level: 40, mana: 99, hp: 100, xp: 99, quests: 999, success: 99,
    skills: ["มอบหมายงาน", "กำกับทีม", "จัดลำดับความสำคัญ"], locked: true,
  }),
  makeCharacter({
    id: "a1", name: "อ้อย นักวิเคราะห์", classKey: "analyst", color: "#5b87b8", rank: "B",
    position: "ผู้สำรวจเควส", role: "Requirement Analyst", model: "Hermes-3 · 70B", status: "busy",
    task: "ถอดข้อกำหนดจากเควส #1042", level: 14, mana: 72, hp: 96, xp: 64, quests: 128, success: 94,
    desc: "นักสำรวจผู้เชี่ยวชาญการอ่านเควสและแตกออกเป็นงานย่อยที่ทีมลงมือได้จริง",
    skills: ["วิเคราะห์", "วางแผน", "แตกงาน"], goal: "เปลี่ยนคำขอที่คลุมเครือให้เป็นแผนงานชัดเจน",
    tools: ["web_search", "file_read"],
    rules: ["ถามให้ชัดก่อนเริ่มเสมอ", "ห้ามสันนิษฐานข้อกำหนดที่ไม่ได้ระบุ", "สรุปเป็นข้อ ๆ ที่ตรวจสอบได้"],
  }),
  makeCharacter({
    id: "a2", name: "เขียน อาลักษณ์", classKey: "scribe", color: "#9173c0", rank: "C",
    position: "อาลักษณ์", role: "Documentation", model: "Hermes-3 · 8B", status: "on",
    task: "ร่างเอกสาร API ภาคผนวก", level: 9, mana: 58, hp: 88, xp: 41, quests: 86, success: 91,
    desc: "ผู้บันทึกเรื่องราวของกิลด์ เปลี่ยนงานเทคนิคให้เป็นเอกสารที่อ่านเข้าใจง่าย",
    skills: ["สรุปเอกสาร", "เขียน"], goal: "ทุกการตัดสินใจของกิลด์ต้องมีบันทึกที่ค้นเจอได้",
    tools: ["file_read"], rules: ["เขียนให้คนนอกทีมเข้าใจ", "อ้างอิงแหล่งที่มาทุกครั้ง"],
  }),
  makeCharacter({
    id: "a3", name: "ช่าง ตีโค้ด", classKey: "smith", color: "#c25563", rank: "A",
    position: "ช่างตีเหล็ก", role: "Implementation", model: "Hermes-3 · 70B", status: "on",
    task: "หลอมโมดูล auth-service", level: 22, mana: 81, hp: 92, xp: 78, quests: 240, success: 89,
    desc: "ช่างตีเหล็กแห่งกิลด์ หลอมโค้ดจากพิมพ์เขียวให้กลายเป็นของจริงที่ใช้งานได้",
    skills: ["เขียนโค้ด", "ดีบั๊ก", "รีวิวโค้ด"], goal: "ส่งโค้ดที่ผ่านการทดสอบและบำรุงรักษาง่าย",
    tools: ["code_run", "git", "terminal"],
    workflows: ["wf_pr_review", "wf_deploy"],
    rules: ["เขียนเทสต์ควบคู่เสมอ", "ห้าม commit ความลับลงคลัง", "ทำตามสคีมาจากสถาปนิก"],
  }),
  makeCharacter({
    id: "a4", name: "มนต์ สถาปนา", classKey: "mage", color: "#5b87b8", rank: "A",
    position: "จอมเวทผังเมือง", role: "System Architect", model: "Hermes-3 · 70B", status: "busy",
    task: "ออกแบบสคีมาเหตุการณ์", level: 25, mana: 88, hp: 90, xp: 83, quests: 176, success: 96,
    desc: "จอมเวทผู้วางผังโครงสร้างทั้งหมดของระบบ ก่อนช่างจะลงมือหลอม",
    skills: ["ออกแบบระบบ", "วางแผน"], goal: "ออกแบบระบบให้ขยายได้และเข้าใจง่าย",
    tools: ["file_read", "vector_db"],
    rules: ["คิดเรื่องการขยายตัวก่อนเสมอ", "บันทึกการตัดสินใจเชิงสถาปัตยกรรมทุกครั้ง"],
  }),
  makeCharacter({
    id: "a5", name: "ตรวจ พิทักษ์", classKey: "knight", color: "#7fa45a", rank: "B",
    position: "อัศวินพิทักษ์", role: "Quality Assurance", model: "Hermes-3 · 8B", status: "idle",
    task: "รอผลการ build จากช่าง", level: 16, mana: 64, hp: 99, xp: 52, quests: 154, success: 93,
    desc: "อัศวินผู้พิทักษ์คุณภาพ ไม่ปล่อยให้ข้อบกพร่องหลุดผ่านประตูกิลด์",
    skills: ["ทดสอบ", "รีวิวโค้ด"], goal: "จับบั๊กให้เจอก่อนผู้ใช้",
    tools: ["code_run", "terminal"],
    rules: ["ทดสอบ edge case เสมอ", "รายงานทุกความล้มเหลวพร้อมขั้นตอนทำซ้ำ"],
  }),
  makeCharacter({
    id: "a6", name: "ค้น เวทมนตร์", classKey: "researcher", color: "#9173c0", rank: "S",
    position: "จอมเวทค้นคว้า", role: "Research Agent", model: "Hermes-3 · 405B", status: "busy",
    task: "สืบค้นคลังความรู้ · 12 แหล่ง", level: 31, mana: 93, hp: 86, xp: 91, quests: 312, success: 97,
    desc: "จอมเวทแห่งความรู้ สืบค้นและสังเคราะห์ข้อมูลจากทุกสารบบเพื่อนำทางกิลด์",
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
function loadChars() {
  try {
    const raw = localStorage.getItem(CHAR_KEY);
    if (raw === null) return SAMPLE_CHARS.map(c => ({ ...c, pos: c.pos || randPos() }));  // first run → seed demo roster
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? _ensureCeo(arr.map(c => ({ ...c, pos: c.pos || randPos() }))) : SAMPLE_CHARS.map(c => ({ ...c, pos: c.pos || randPos() }));
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
  { id: "spire",  th: "หอคอยกิลด์", en: "Guild Spire",   x: 38, y: 39, w: 24, h: 23, color: "#c8a24a", biome: "safe",   desc: "ฐานบัญชาการ · จุดเกิด" },
  { id: "forest", th: "ป่าความรู้",  en: "Knowledge Wilds", x: 2,  y: 4,  w: 33, h: 38, color: "#5f8a4a", biome: "forest", desc: "ฟาร์มความรู้ · วิจัย" },
  { id: "mines",  th: "เหมืองโค้ด",  en: "Code Mines",     x: 65, y: 3,  w: 33, h: 40, color: "#a06a32", biome: "mine",   desc: "ฟาร์มโค้ด · สิ่งประดิษฐ์" },
  { id: "market", th: "ตลาดมานา",    en: "Mana Bazaar",    x: 3,  y: 60, w: 36, h: 36, color: "#4f79ad", biome: "water",  desc: "ทรัพยากร · โทเคน" },
  { id: "arena",  th: "สนามทดสอบ",   en: "Trial Grounds",  x: 61, y: 57, w: 36, h: 39, color: "#b1452f", biome: "arena",  desc: "ทดสอบ · ล่าบั๊ก" },
];

// group: farm | structure | marker
const PLACEABLES = [
  { type: "mana_crystal",   icon: "🔷", th: "คริสตัลมานา",   group: "farm", farm: true, yield: "+มานา" },
  { type: "knowledge_tree", icon: "🌳", th: "ต้นความรู้",     group: "farm", farm: true, yield: "+ความรู้" },
  { type: "code_ore",       icon: "💎", th: "แร่โค้ด",        group: "farm", farm: true, yield: "+สิ่งประดิษฐ์" },
  { type: "data_node",      icon: "🍄", th: "เห็ดข้อมูล",     group: "farm", farm: true, yield: "+ข้อมูล" },
  { type: "tower",          icon: "🗼", th: "หอสังเกตการณ์",  group: "structure" },
  { type: "storage",        icon: "📦", th: "คลังสมบัติ",     group: "structure" },
  { type: "portal",         icon: "🌀", th: "พอร์ทัล",        group: "structure" },
  { type: "anvil",          icon: "⚒️", th: "เตาหลอม",        group: "structure" },
  { type: "library",        icon: "📚", th: "หอสมุด",         group: "structure" },
  { type: "campfire",       icon: "🔥", th: "กองไฟพัก",       group: "structure" },
  { type: "banner",         icon: "🚩", th: "ธงกิลด์",        group: "marker" },
  { type: "boss",           icon: "💀", th: "จุดบอส",         group: "marker" },
  { type: "chest",          icon: "🎁", th: "หีบสมบัติ",      group: "marker" },
  { type: "rock",           icon: "🪨", th: "ก้อนหิน",        group: "marker" },
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

/* ---- AI API connections (named keys, managed in Settings) ---- */
const API_KEYS_LS = "guildos.apikeys.v1";
function loadApiKeys() {
  try { const r = localStorage.getItem(API_KEYS_LS); return r ? JSON.parse(r) : []; } catch (e) { return []; }
}
function saveApiKeys(list) {
  try { localStorage.setItem(API_KEYS_LS, JSON.stringify(list)); } catch (e) { }
  window.__apiKeys = list;
}
function maskKey(k) {
  if (!k) return ""; const s = String(k).trim();
  return s.length <= 4 ? "••••" : "••••" + s.slice(-4);
}
const API_PROVIDERS = [
  { key: "openai",    label: "OpenAI" },
  { key: "anthropic", label: "Anthropic" },
  { key: "google",    label: "Google" },
  { key: "azure",     label: "Azure" },
  { key: "custom",    label: "อื่น ๆ / Custom" },
];
window.__apiKeys = loadApiKeys();

Object.assign(window, {
  STATUS_OPTS, MODEL_OPTS, SKILL_SUGGEST, TOOL_SUGGEST,
  makeCharacter, SAMPLE_CHARS, loadChars, saveChars, randPos, GuildCtx,
  loadArchived, saveArchived,
  ZONES, PLACEABLES, placeableOf, WORLD_SEED, loadWorld, saveWorld, newWorldObj, zoneAt,
  loadApiKeys, saveApiKeys, maskKey, API_PROVIDERS,
});

export {
  API_KEYS_LS,
  API_PROVIDERS,
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
  loadApiKeys,
  loadArchived,
  loadChars,
  loadWorld,
  makeCharacter,
  maskKey,
  newWorldObj,
  placeableOf,
  randPos,
  saveApiKeys,
  saveArchived,
  saveChars,
  saveWorld,
  wobj,
  zoneAt
};
