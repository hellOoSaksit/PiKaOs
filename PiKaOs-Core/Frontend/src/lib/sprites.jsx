/* PiKaOs — class/color presets for the agent builder.
   (The pixel-sprite engine that lived here was removed when avatars went
   full 3D — rendering now happens in screens/world/CharacterSprite.jsx.) */

// class presets shown in the builder
const CLASS_OPTS = [
  { key: "analyst",    icon: "🧭", th: "ผู้สำรวจ", en: "Scout" },
  { key: "scribe",     icon: "📜", th: "อาลักษณ์", en: "Scribe" },
  { key: "smith",      icon: "⚒️", th: "ช่างตีเหล็ก", en: "Blacksmith" },
  { key: "mage",       icon: "🔮", th: "จอมเวท", en: "Mage" },
  { key: "knight",     icon: "🛡️", th: "อัศวิน", en: "Knight" },
  { key: "researcher", icon: "📚", th: "นักค้นคว้า", en: "Sage" },
];

const COLOR_OPTS = ["#c25563", "#5b87b8", "#9173c0", "#7fa45a", "#d89a3f", "#3f9e93", "#b0683a", "#c7a14a"];

Object.assign(window, { CLASS_OPTS, COLOR_OPTS });

export { CLASS_OPTS, COLOR_OPTS };
