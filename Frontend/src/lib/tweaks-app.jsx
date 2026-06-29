/* PiKaOs — ES module (migrated from PiKaOs-Core/tweaks-app.jsx). */
import React from 'react';
import { createRoot } from 'react-dom/client';
const ReactDOM = { createRoot };
import { TweakColor, TweakRadio, TweakSection, TweaksPanel, useTweaks } from './tweaks-panel.jsx';

/* ============================================================
   TWEAKS — professional, office-appropriate controls:
     · ธีม (Day / Night)   — clean corporate light (pro) ↔ dark (pro-dark)
     · สีหลัก (Accent)      — professional accent: blue / teal / indigo / slate
     · ทรง (Shape)          — corner geometry
     · ชีวิตชีวา (Motion)   — energy of transitions, pulses & agent glides
   Themes live in CSS ([data-theme="pro" | "pro-dark"]); tweaks just switch +
   layer accent / radius / motion on top via <html> vars & data-attrs.
   ============================================================ */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "กลางวัน",
  "accent": "#4361ee",
  "shape": "ปกติ",
  "motion": "ปกติ"
}/*EDITMODE-END*/;

/* modern accents — confident hues, each deep enough for white button text */
const TW_ACCENTS = {
  "#4361ee": { bright: "#5872f2", deep: "#3048d4", glow: "rgba(67,97,238,0.26)" },   // อินดิโก
  "#2563eb": { bright: "#3b82f6", deep: "#1d4ed8", glow: "rgba(37,99,235,0.26)" },   // น้ำเงิน
  "#6a4be8": { bright: "#7c5cf0", deep: "#5436c8", glow: "rgba(106,75,232,0.26)" },  // ม่วง
  "#475569": { bright: "#5a6577", deep: "#374151", glow: "rgba(71,85,105,0.24)" },  // สเลต
};
const TW_ACCENT_VARS = ["--gold", "--gold-bright", "--gold-deep", "--gold-glow", "--gold-grad", "--gold-grad-hover"];

const TW_SHAPES = {
  "มุมคม": { "--radius": "2px", "--radius-lg": "3px", "--radius-sm": "1px" },
  "ปกติ": { "--radius": "6px", "--radius-lg": "10px", "--radius-sm": "4px" },
  "มนนุ่ม": { "--radius": "14px", "--radius-lg": "22px", "--radius-sm": "9px" },
};
const TW_SHAPE_VARS = ["--radius", "--radius-lg", "--radius-sm"];
const TW_MOTION = { "สงบ": "calm", "ปกติ": "regular", "คึกคัก": "lively" };

function ensureMotionCSS() {
  if (document.getElementById("tw-motion-css")) return;
  const s = document.createElement("style"); s.id = "tw-motion-css";
  s.textContent = `
    html[data-motion="calm"] * { transition-duration: .45s !important; }
    html[data-motion="calm"] .pulse-dot, html[data-motion="calm"] .hermes-fab-live,
    html[data-motion="calm"] [class*="pulse"] { animation-duration: 3.4s !important; }
    html[data-motion="calm"] .rc-agent { transition-duration: .9s !important; }
    html[data-motion="lively"] * { transition-duration: .1s !important; }
    html[data-motion="lively"] .pulse-dot, html[data-motion="lively"] [class*="pulse"] { animation-duration: .7s !important; }
    html[data-motion="lively"] .rc-agent { transition-duration: .26s !important; }
    html[data-motion="lively"] .room-card:hover, html[data-motion="lively"] .myagent-card:hover { transform: translateY(-5px) scale(1.012); }
  `;
  document.head.appendChild(s);
}

function applyTweaks(t) {
  const el = document.documentElement;
  // day / night — professional themes
  // day/night theme is owned by the app's topbar toggle (data-theme pro / pro-dark)
  const ac = TW_ACCENTS[t.accent] || TW_ACCENTS["#4361ee"];
  const accent = TW_ACCENTS[t.accent] ? t.accent : "#4361ee";
  el.style.setProperty("--gold", accent);
  el.style.setProperty("--gold-bright", ac.bright);
  el.style.setProperty("--gold-deep", ac.deep);
  el.style.setProperty("--gold-glow", ac.glow);
  el.style.setProperty("--gold-grad", `linear-gradient(180deg,${ac.bright} 0%,${accent} 52%,${ac.deep} 100%)`);
  el.style.setProperty("--gold-grad-hover", `linear-gradient(180deg,${ac.bright} 0%,${ac.bright} 52%,${accent} 100%)`);
  // shape
  TW_SHAPE_VARS.forEach(k => el.style.removeProperty(k));
  Object.entries(TW_SHAPES[t.shape] || TW_SHAPES["ปกติ"]).forEach(([k, v]) => el.style.setProperty(k, v));
  // motion
  el.setAttribute("data-motion", TW_MOTION[t.motion] || "regular");
}

function TweaksApp() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  React.useEffect(() => { ensureMotionCSS(); }, []);
  React.useEffect(() => { applyTweaks(t); }, [t.accent, t.shape, t.motion]);

  return (
    <TweaksPanel title="Tweaks">
      <TweakSection label="สีหลัก" />
      <TweakColor label="สีเน้น (Accent)" value={t.accent} options={Object.keys(TW_ACCENTS)}
        onChange={(v) => setTweak("accent", v)} />

      <TweakSection label="รูปทรง" />
      <TweakRadio label="ความโค้งมุม" value={t.shape} options={Object.keys(TW_SHAPES)}
        onChange={(v) => setTweak("shape", v)} />

      <TweakSection label="ชีวิตชีวา" />
      <TweakRadio label="พลังงานการเคลื่อนไหว" value={t.motion} options={Object.keys(TW_MOTION)}
        onChange={(v) => setTweak("motion", v)} />
    </TweaksPanel>
  );
}

(function mountTweaks() {
  const mount = () => {
    let host = document.getElementById("tweaks-root");
    if (!host) { host = document.createElement("div"); host.id = "tweaks-root"; document.body.appendChild(host); }
    try { ReactDOM.createRoot(host).render(<TweaksApp />); } catch (e) { /* ignore */ }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();

export {
  TWEAK_DEFAULTS,
  TW_ACCENTS,
  TW_ACCENT_VARS,
  TW_MOTION,
  TW_SHAPES,
  TW_SHAPE_VARS,
  TweaksApp,
  applyTweaks,
  ensureMotionCSS
};
