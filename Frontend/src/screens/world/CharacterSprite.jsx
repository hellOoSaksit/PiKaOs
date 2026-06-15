/* PiKaOs — procedural 3D-style chibi avatar (replaces the sprite-sheet
   strips). Big head + headset, soft gradients — drawn as inline SVG so it
   needs no image assets and recolors deterministically per agent.
   Props are unchanged ({charId, walking, h, flip, style}); `seed` (optional)
   gives per-agent variety when many agents share one characterId. */
import React from 'react';
import { hashStr, variantOf } from '../../lib/avatar-style.js';

function CharacterSprite({ charId, walking, h = 40, flip = false, style, seed }) {
  const v = variantOf(seed || charId || "ceo");
  const gid = "av" + (hashStr(seed || charId || "ceo") % 9973);
  const w = Math.round(h * 96 / 122);
  const capStyle = v.hairStyle === 3;
  return (
    <span className={`av3d ${walking ? "av3d-walk" : ""}`} aria-hidden="true"
      style={{ width: w, height: Math.round(h), transform: flip ? "scaleX(-1)" : undefined, ...style }}>
      <svg viewBox="0 0 96 122" width="100%" height="100%">
        <defs>
          <radialGradient id={`${gid}-skin`} cx="38%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity=".5" />
            <stop offset="60%" stopColor="#ffffff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${gid}-shirt`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={v.shirt[1]} />
            <stop offset="100%" stopColor={v.shirt[0]} />
          </linearGradient>
          <linearGradient id={`${gid}-hair`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={v.hair} stopOpacity=".82" />
            <stop offset="100%" stopColor={v.hair} />
          </linearGradient>
        </defs>

        {/* back hair (long / bun styles) */}
        {v.hairStyle === 0 && <path d="M20 42 Q16 86 26 96 L70 96 Q80 86 76 42 Q72 18 48 18 Q24 18 20 42 Z" fill={v.hair} />}
        {v.hairStyle === 1 && <circle cx="48" cy="14" r="11" fill={v.hair} />}

        {/* body */}
        <path d="M48 76 C29 76 21 91 20 114 L76 114 C75 91 67 76 48 76 Z" fill={`url(#${gid}-shirt)`} />
        <path d="M40 78 L48 90 L56 78 Q52 75 48 75 Q44 75 40 78 Z" fill={v.collar} />
        {v.tie && <path d="M48 88 L44 96 L48 110 L52 96 Z" fill={v.tie} />}

        {/* head */}
        <ellipse cx="48" cy="46" rx="29" ry="28" fill={v.skin} />
        <ellipse cx="48" cy="46" rx="29" ry="28" fill={`url(#${gid}-skin)`} opacity=".9" />

        {/* hair / cap */}
        {v.hairStyle === 0 && <path d="M19 46 Q17 16 48 16 Q79 16 77 46 Q70 28 60 26 Q52 38 36 30 Q24 32 19 46 Z" fill={`url(#${gid}-hair)`} />}
        {v.hairStyle === 1 && <path d="M20 44 Q19 18 48 18 Q77 18 76 44 Q66 30 56 28 Q44 36 32 30 Q24 34 20 44 Z" fill={`url(#${gid}-hair)`} />}
        {v.hairStyle === 2 && <path d="M19 42 Q20 15 48 15 Q76 15 77 42 Q73 30 64 27 Q54 34 38 28 Q26 30 19 42 Z" fill={`url(#${gid}-hair)`} />}
        {capStyle && (
          <g>
            <path d="M20 40 Q21 16 48 16 Q75 16 76 40 L76 44 Q48 36 20 44 Z" fill={v.shirt[0]} />
            <path d="M20 41 Q48 33 76 41 L78 46 Q48 39 18 46 Z" fill={v.shirt[1]} />
            <path d="M22 50 Q18 60 24 70 L30 66 Q26 58 28 50 Z" fill={v.hair} />
            <path d="M74 50 Q78 60 72 70 L66 66 Q70 58 68 50 Z" fill={v.hair} />
          </g>
        )}

        {/* face */}
        <ellipse cx="38" cy="48" rx="3.4" ry="4.4" fill="#2e3247" />
        <ellipse cx="58" cy="48" rx="3.4" ry="4.4" fill="#2e3247" />
        <circle cx="39.2" cy="46.4" r="1.2" fill="#fff" />
        <circle cx="59.2" cy="46.4" r="1.2" fill="#fff" />
        <path d="M33 40 Q38 37.5 42 39.6" stroke="#3a3744" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M54 39.6 Q58 37.5 63 40" stroke="#3a3744" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <path d="M43 58 Q48 62 53 58" stroke="#b9684f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
        <ellipse cx="32" cy="55" rx="3.6" ry="2" fill="#f1958a" opacity=".45" />
        <ellipse cx="64" cy="55" rx="3.6" ry="2" fill="#f1958a" opacity=".45" />

        {/* headset */}
        <path d="M20 40 Q24 14 48 14 Q72 14 76 40" stroke={v.set} strokeWidth="6" fill="none" strokeLinecap="round" />
        <rect x="13" y="38" width="11" height="19" rx="5" fill={v.set} />
        <rect x="72" y="38" width="11" height="19" rx="5" fill={v.set} />
        <rect x="15" y="40" width="3.5" height="15" rx="1.7" fill="#fff" opacity=".25" />
        <path d="M22 55 Q26 66 38 64" stroke={v.set} strokeWidth="3" fill="none" strokeLinecap="round" />
        <ellipse cx="39.5" cy="64" rx="4" ry="3" fill={v.set} />
      </svg>
    </span>
  );
}

export { CharacterSprite };
