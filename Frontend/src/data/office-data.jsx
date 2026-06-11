/* PiKaOs — ES module (migrated from PiKaOs/office-data.jsx). */

/* ============================================================
   OFFICE DESIGNER — data: isometric geometry, furniture catalog,
   multi-office persistence + a seeded starter office.
   Top-down grid coords (gx,gy); rendered in 2:1 isometric.
   ============================================================ */

const ISO = { TW: 58, TH: 29, PAD: 26 };   // tile width / height (2:1) + canvas padding

/* grid (gx,gy) -> screen px (top-left of the tile's bounding box).
   originX centers the diamond so x=0..W maps inside the canvas. */
function isoPos(gx, gy, W) {
  const originX = (W - 1) * ISO.TW / 2 + ISO.PAD;
  return {
    x: originX + (gx - gy) * ISO.TW / 2,
    y: ISO.PAD + (gx + gy) * ISO.TH / 2,
  };
}
/* canvas pixel size for a W×H grid (before object height) */
function isoCanvasSize(W, H) {
  return { w: (W + H) * ISO.TW / 2 + ISO.PAD * 2, h: (W + H) * ISO.TH / 2 + ISO.PAD * 2 + 60 };
}
/* inverse: screen px (relative to canvas) -> nearest grid cell */
function tileFromScreen(px, py, W) {
  const originX = (W - 1) * ISO.TW / 2 + ISO.PAD;
  const a = (px - originX) / (ISO.TW / 2);
  const b = (py - ISO.PAD - ISO.TH / 2) / (ISO.TH / 2);   // -TH/2: aim at tile center
  return { gx: Math.round((a + b) / 2), gy: Math.round((b - a) / 2) };
}

/* ---- furniture catalog ----
   h = pixel height of the block · group = palette section
   accent = extra decoration drawn on top · seat = agents can sit here
   dir = whether rotation matters (facing) · flat = floor-level (rug) */
const FURNI = {
  wall:   { th: "ผนัง",        en: "Wall",      group: "struct", icon: "🧱", h: 38, color: "#aab2c0", dir: false },
  glass:  { th: "ผนังกระจก",   en: "Glass wall", group: "struct", icon: "🪟", h: 38, color: "#7fa9c9", glassy: true, dir: false },
  door:   { th: "ประตู",       en: "Door",      group: "struct", icon: "🚪", h: 38, color: "#b0884a", accent: "door", dir: true },
  rug:    { th: "พรม",         en: "Rug",       group: "struct", icon: "🟦", h: 0,  color: "#3f6ea0", flat: true, dir: false },

  desk:   { th: "โต๊ะทำงาน",   en: "Desk",      group: "furni", icon: "🖥️", h: 14, color: "#b1814e", accent: "monitor", seat: true, dir: true },
  meet:   { th: "โต๊ะประชุม",  en: "Meeting table", group: "furni", icon: "🪑", h: 13, color: "#8a6a40", accent: "meet", dir: false },
  chair:  { th: "เก้าอี้",      en: "Chair",     group: "furni", icon: "💺", h: 10, color: "#5b6b86", accent: "chairback", dir: true },
  sofa:   { th: "โซฟา",        en: "Sofa",      group: "furni", icon: "🛋️", h: 12, color: "#6d6f8c", accent: "sofaback", dir: true },
  shelf:  { th: "ตู้หนังสือ",   en: "Bookshelf", group: "furni", icon: "📚", h: 32, color: "#7a5a38", accent: "shelf", dir: true },
  server: { th: "แร็คเซิร์ฟเวอร์", en: "Server rack", group: "furni", icon: "🖲️", h: 32, color: "#39414f", accent: "server", dir: false },
  water:  { th: "ตู้กดน้ำ",     en: "Water cooler", group: "furni", icon: "🚰", h: 18, color: "#5b9bd8", accent: "water", dir: false },

  plant:  { th: "ต้นไม้",       en: "Plant",     group: "decor", icon: "🪴", h: 9,  color: "#9a7048", accent: "foliage", dir: false },
  tree:   { th: "ต้นไม้ใหญ่",   en: "Tree",      group: "decor", icon: "🌳", h: 14, color: "#7a5a38", accent: "foliageBig", dir: false },
  lamp:   { th: "โคมไฟ",        en: "Lamp",      group: "decor", icon: "🛋", h: 30, color: "#b8a05a", accent: "lamp", dir: false },
  crystal:{ th: "คริสตัล",      en: "Crystal",   group: "decor", icon: "🔷", h: 16, color: "#5b9bd8", accent: "crystal", dir: false },
  fountain:{ th: "น้ำพุ",       en: "Fountain",  group: "decor", icon: "⛲", h: 12, color: "#6f93b3", accent: "fountain", dir: false },
};
const FURNI_GROUPS = [
  { key: "struct", th: "โครงสร้าง", en: "Structure" },
  { key: "furni",  th: "เฟอร์นิเจอร์", en: "Furniture" },
  { key: "decor",  th: "ตกแต่ง",   en: "Decor" },
];
const furniOf = (t) => FURNI[t] || FURNI.desk;

/* ---- floor styles (per office) ---- */
const FLOORS = {
  wood:   { th: "ไม้",   a: "#caa56e", b: "#c09a60" },
  marble: { th: "หินอ่อน", a: "#d9dde4", b: "#cfd4dd" },
  carpet: { th: "พรมเทา", a: "#8f97a6", b: "#888f9e" },
  grass:  { th: "หญ้า",  a: "#6f9b53", b: "#669049" },
};

/* ---- a starter office layout (programmatic) ---- */
const OFFICE_W = 12, OFFICE_H = 10;
let _oid = 0;
const oobj = (type, gx, gy, rot = 0) => ({ id: "o" + (++_oid) + "_" + Math.random().toString(36).slice(2, 5), type, gx, gy, rot });

function seedOffice() {
  const objs = [];
  // perimeter walls (leave a door gap on the south edge)
  for (let x = 0; x < OFFICE_W; x++) {
    objs.push(oobj("wall", x, 0));
    if (x !== 6 && x !== 7) objs.push(oobj("wall", x, OFFICE_H - 1)); else objs.push(oobj("door", x, OFFICE_H - 1, 2));
  }
  for (let y = 1; y < OFFICE_H - 1; y++) { objs.push(oobj("wall", 0, y)); objs.push(oobj("glass", OFFICE_W - 1, y)); }
  // a meeting room divider (glass) around top-right
  objs.push(oobj("glass", 8, 3), oobj("glass", 9, 3), oobj("glass", 10, 3));
  // desks row (with chairs facing them)
  const desks = [[2, 2], [4, 2], [2, 4], [4, 4]];
  desks.forEach(([x, y]) => { objs.push(oobj("desk", x, y, 1)); objs.push(oobj("chair", x, y + 1, 3)); });
  // meeting table top-right
  objs.push(oobj("meet", 9, 1), oobj("chair", 8, 1, 0), oobj("chair", 10, 1, 2));
  // lounge + decor
  objs.push(oobj("sofa", 2, 7, 0), oobj("rug", 3, 7), oobj("plant", 1, 7));
  objs.push(oobj("shelf", 6, 1, 1), oobj("server", 10, 7), oobj("water", 9, 7));
  objs.push(oobj("tree", 6, 7), oobj("crystal", 5, 7), oobj("lamp", 3, 2));
  return { id: "off_main", name: "ออฟฟิศหลัก", floor: "wood", w: OFFICE_W, h: OFFICE_H, objects: objs, seats: true };
}

/* ---- persistence ---- */
const OFFICE_KEY = "guildos-offices-v1";
function loadOffices() {
  try {
    const raw = localStorage.getItem(OFFICE_KEY);
    if (raw === null) return [seedOffice()];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : [seedOffice()];
  } catch { return [seedOffice()]; }
}
function saveOffices(arr) { try { localStorage.setItem(OFFICE_KEY, JSON.stringify(arr)); } catch {} }
function blankOffice(name) {
  return { id: "off_" + Date.now(), name: name || "ออฟฟิศใหม่", floor: "marble", w: OFFICE_W, h: OFFICE_H, objects: [], seats: true };
}

Object.assign(window, {
  ISO, isoPos, isoCanvasSize, tileFromScreen,
  FURNI, FURNI_GROUPS, furniOf, FLOORS, OFFICE_W, OFFICE_H, oobj,
  seedOffice, loadOffices, saveOffices, blankOffice,
});

export {
  FLOORS,
  FURNI,
  FURNI_GROUPS,
  ISO,
  OFFICE_KEY,
  OFFICE_W,
  _oid,
  blankOffice,
  furniOf,
  isoCanvasSize,
  isoPos,
  loadOffices,
  oobj,
  saveOffices,
  seedOffice,
  tileFromScreen
};
