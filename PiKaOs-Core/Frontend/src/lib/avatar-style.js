/* PiKaOs — avatar look table, shared by the 2D SVG avatar (cards/drawers)
   and the 3D in-room avatar (Three.js). One hash → one identical identity
   (skin/hair/shirt/headset) everywhere. */

const SKINS = ["#ffd9c2", "#f7c6a3", "#eab68d", "#d99a6c"];
const HAIRS = ["#8a5a3b", "#3a3744", "#c98e4e", "#2a2834", "#a04f35", "#6b4a78"];
const SHIRTS = [
  ["#6f74d9", "#9ba0ef"], ["#4f8fdd", "#86b7ef"], ["#3fb7a8", "#7fd6c9"],
  ["#ef8b74", "#f7b3a2"], ["#9a7bd6", "#bda3ea"], ["#5f6d85", "#8b99b3"],
];
const SETS = ["#3b3f8f", "#e0a23c", "#475063"];

function hashStr(s) {
  let h = 2166136261; s = String(s || "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function variantOf(key) {
  if (key === "ceo") {
    return { skin: SKINS[0], hair: "#33303d", hairStyle: 2, shirt: ["#384064", "#56608c"], collar: "#f4f6fb", set: SETS[1], tie: "#d9aa3c" };
  }
  const h = hashStr(key);                          // >>> keeps every index unsigned
  return {
    skin: SKINS[h % SKINS.length],
    hair: HAIRS[(h >>> 3) % HAIRS.length],
    hairStyle: (h >>> 6) % 4,                      // 0 long · 1 bun · 2 short · 3 cap
    shirt: SHIRTS[(h >>> 9) % SHIRTS.length],
    collar: "#eef2fa",
    set: SETS[(h >>> 13) % SETS.length],
    tie: null,
  };
}

Object.assign(window, { avatarVariantOf: variantOf });

export { hashStr, variantOf };
