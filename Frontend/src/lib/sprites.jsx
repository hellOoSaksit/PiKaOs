/* PiKaOs — ES module (migrated from PiKaOs/sprites.jsx). */
import React from 'react';

/* ============================================================
   PIXEL SPRITE ENGINE
   Canvas-generated recolorable pixel-art adventurers.
   Legend: . transparent · K outline · S skin · E eye
           C cloth(primary) · B cloth-shadow · M gold trim
           P pants · O boots · H hair · W metal
   ============================================================ */
const SPR_W = 12;

const SHAPES = {
  // hair, tunic — generic adventurer
  default: [
    "....KKKK....",
    "...KHHHHK...",
    "..KHHHHHHK..",
    "..KHSSSSHK..",
    "..KSSSSSSK..",
    "..KSESSESK..",
    "..KSSSSSSK..",
    "..KSSSSSSK..",
    "...KSSSSK...",
    "...MCCCCM...",
    "..KCCCCCCK..",
    "..KCBMMBCK..",
    "..KCCCCCCK..",
    "..KCCCCCCK..",
    "...KPPPPK...",
    "..KOO..OOK..",
  ],
  // pointy hat + long robe — mage / cleric / researcher
  mage: [
    ".....KK.....",
    "....KCCK....",
    "...KCCCCK...",
    "..KCCCCCCK..",
    "..KMCCCCMK..",
    "..KHSSSSHK..",
    "..KSESSESK..",
    "..KSSSSSSK..",
    "...KSSSSK...",
    "...KCCCCK...",
    "..KCCCCCCK..",
    "..KCMCCMCK..",
    "..KCCCCCCK..",
    "..KCCCCCCK..",
    "..KCCCCCCK..",
    "..KBPPPPBK..",
  ],
  // helmet + plate — knight / qa
  knight: [
    "...KWWWWK...",
    "..KWWWWWWK..",
    "..KWWWWWWK..",
    "..KWSSSSWK..",
    "..KWEEEEWK..",
    "..KWWWWWWK..",
    "..KWWWWWWK..",
    "...KWWWWK...",
    "...MCCCCM...",
    "..KCCWWCCK..",
    "..KCWWWWCK..",
    "..KCWMMWCK..",
    "..KCCWWCCK..",
    "..KCCCCCCK..",
    "...KPPPPK...",
    "..KOO..OOK..",
  ],
  // hood + cloak — scout / ranger
  scout: [
    "....KKKK....",
    "...KCCCCK...",
    "..KCCCCCCK..",
    "..KCSSSSCK..",
    "..KCSSSSCK..",
    "..KSESSESK..",
    "..KSSSSSSK..",
    "...KSSSSK...",
    "...KCCCCK...",
    "..KCCCCCCK..",
    "..KCCMMCCK..",
    "..KBCCCCBK..",
    "..KCCCCCCK..",
    "..KCCCCCCK..",
    "...KPPPPK...",
    "..KOO..OOK..",
  ],
  // bandana + apron — smith / builder
  smith: [
    "....KKKK....",
    "...KCCCCK...",
    "..KHHHHHHK..",
    "..KHSSSSHK..",
    "..KSESSESK..",
    "..KSSSSSSK..",
    "..KSSSSSSK..",
    "...KSSSSK...",
    "..MKCCCCKM..",
    ".KBCCCCCCBK.",
    ".KCCMMMMCCK.",
    ".KCCCCCCCCK.",
    "..KCCCCCCK..",
    "..KCCCCCCK..",
    "...KPPPPK...",
    "..KOO..OOK..",
  ],
};

const CLASS_TO_SHAPE = {
  warrior: "default", analyst: "default", scribe: "default",
  mage: "mage", cleric: "mage", researcher: "mage",
  knight: "knight", qa: "knight",
  scout: "scout", ranger: "scout",
  smith: "smith", builder: "smith",
};

// class presets shown in the builder
const CLASS_OPTS = [
  { key: "analyst",    icon: "🧭", th: "ผู้สำรวจ", en: "Scout", shape: "default" },
  { key: "scribe",     icon: "📜", th: "อาลักษณ์", en: "Scribe", shape: "default" },
  { key: "smith",      icon: "⚒️", th: "ช่างตีเหล็ก", en: "Blacksmith", shape: "smith" },
  { key: "mage",       icon: "🔮", th: "จอมเวท", en: "Mage", shape: "mage" },
  { key: "knight",     icon: "🛡️", th: "อัศวิน", en: "Knight", shape: "knight" },
  { key: "researcher", icon: "📚", th: "นักค้นคว้า", en: "Sage", shape: "mage" },
];

const COLOR_OPTS = ["#c25563", "#5b87b8", "#9173c0", "#7fa45a", "#d89a3f", "#3f9e93", "#b0683a", "#c7a14a"];

function _darken(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
  return "#" + [r, g, b].map(v => v.toString(16).padStart(2, "0")).join("");
}
function _hairFor(name) {
  const hairs = ["#3a2616", "#5a3a1c", "#26201a", "#6e4a26", "#7a5230", "#2a2330"];
  let h = 0; for (const c of (name || "x")) h = (h * 31 + c.charCodeAt(0)) % 997;
  return hairs[h % hairs.length];
}

const _spriteCache = new Map();
function spriteURL(char) {
  if (!char) return "";
  const shape = char.shape || CLASS_TO_SHAPE[char.classKey] || "default";
  const color = char.color || "#c7a14a";
  const hair = char.hair || _hairFor(char.name);
  const key = shape + "|" + color + "|" + hair;
  if (_spriteCache.has(key)) return _spriteCache.get(key);
  const rows = (SHAPES[shape] || SHAPES.default).map(r => (r + "............").slice(0, SPR_W));
  const pal = { K: "#160f05", S: "#e7c098", E: "#241608", C: color, B: _darken(color, 0.6),
    M: "#e3b952", P: "#3a2c18", O: "#1f1408", H: hair, W: "#c6cdd8" };
  const cv = document.createElement("canvas");
  cv.width = SPR_W; cv.height = rows.length;
  const ctx = cv.getContext("2d");
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch !== "." && pal[ch]) { ctx.fillStyle = pal[ch]; ctx.fillRect(x, y, 1, 1); }
  }));
  const url = cv.toDataURL();
  _spriteCache.set(key, url);
  return url;
}

function PixelSprite({ char, h = 40, className = "", style, bob = false }) {
  const src = spriteURL(char);
  const w = Math.round(h * SPR_W / 16);
  return (
    <img src={src} width={w} height={h} alt={char ? char.name : ""} draggable="false"
      className={`pixel-sprite ${bob ? "bob" : ""} ${className}`}
      style={{ imageRendering: "pixelated", ...style }} />
  );
}

Object.assign(window, { SHAPES, CLASS_TO_SHAPE, CLASS_OPTS, COLOR_OPTS, spriteURL, PixelSprite, SPR_W });

export {
  CLASS_OPTS,
  CLASS_TO_SHAPE,
  COLOR_OPTS,
  PixelSprite,
  SHAPES,
  SPR_W,
  _darken,
  _hairFor,
  _spriteCache,
  spriteURL
};
