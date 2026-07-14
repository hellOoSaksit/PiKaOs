/* ============================================================================
   Face.js — the expressive SCREEN, drawn to a 2D canvas and mapped on the
   screen plane as a CanvasTexture (used as both .map and .emissiveMap so it
   GLOWS and blooms like a powered display).

   Everything is data-driven: ClaudeMascot hands draw() a `state` object and
   this module decides how to render eyes / mouth / overlays. Adding a new
   expression = adding a `case` to drawEyes / drawMouth — no other wiring.
   ========================================================================== */
import * as THREE from 'three';

const W = 512;            // canvas pixels (matches screen plane aspect ~1.45:1)
const H = 360;
const INK = '#243a5e';    // navy face features
const INK_SOFT = '#3a5688';

export class Face {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d');

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;

    // tiny per-frame jitter to sell the "computer screen" feel
    this._jit = 0;
  }

  /* state = {
       on, time, bg, dim,
       eyes, mouth, eyeOpen(0..1), look:{x,y}, talk(0..1),
       overlay, progress(0..1), flickerRed, noBlink
     } */
  draw(s) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, W, H);

    // ---- powered off: dark glass with a faint highlight ----
    if (!s.on) {
      ctx.fillStyle = '#0e1622';
      ctx.fillRect(0, 0, W, H);
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, 'rgba(255,255,255,0.06)');
      g.addColorStop(0.5, 'rgba(255,255,255,0.0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
      this.texture.needsUpdate = true;
      return;
    }

    // ---- background (mint monitor, or red flicker for error) ----
    let bg = s.bg || '#BFEFE6';
    if (s.flickerRed && Math.sin(s.time * 22) > 0.3) bg = '#F2A39C';
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // subtle vignette inside the glass
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, 'rgba(255,255,255,0.10)');
    vg.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    // pixel jitter — shift the whole face drawing a hair, occasionally
    this._jit = (Math.random() < 0.04) ? (Math.random() * 2 - 1) : this._jit * 0.6;
    const jx = this._jit;
    ctx.translate(jx, 0);

    // look offset (eyes + mouth lean toward cursor / target)
    const lookX = (s.look?.x || 0) * 16;
    const lookY = (s.look?.y || 0) * 12;

    if (s.art) {
      this.drawArt(ctx, s);
    } else {
      this.drawEyes(ctx, s, lookX, lookY);
      this.drawMouth(ctx, s, lookX, lookY);
      if (s.overlay) this.drawOverlay(ctx, s);
    }

    ctx.translate(-jx, 0);

    // scanlines on top — sells the CRT/handheld read
    this.drawScanlines(ctx, s);

    ctx.restore();
    this.texture.needsUpdate = true;
  }

  // ---------------------------------------------------------------- eyes
  drawEyes(ctx, s, lx, ly) {
    const cy = H * 0.40 + ly;
    const dx = W * 0.20;
    const lcx = W / 2 - dx + lx;
    const rcx = W / 2 + dx + lx;
    const open = s.noBlink ? 1 : (s.eyeOpen ?? 1);
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const eye = (cx, big = 1, side = 0) => {
      switch (s.eyes) {
        case 'happy': {            // ^_^  upward arcs
          ctx.lineWidth = 16;
          ctx.beginPath();
          ctx.arc(cx, cy + 16, 30 * big, Math.PI * 1.15, Math.PI * 1.85);
          ctx.stroke();
          break;
        }
        case 'closed': {           // sleeping / blink — gentle down-curve line
          ctx.lineWidth = 13;
          ctx.beginPath();
          ctx.arc(cx, cy - 6, 28 * big, Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
          break;
        }
        case 'angry': {            // \  / slanted hard ovals
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(side < 0 ? 0.5 : -0.5);
          ctx.beginPath();
          this.roundedRect(ctx, -26, -10, 52, 20, 9);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'round':              // surprised
          this.pupil(ctx, cx, cy, 34 * big, 34 * big, open);
          break;
        case 'wide':               // listening
          this.pupil(ctx, cx, cy, 26 * big, 36 * big, open);
          break;
        case 'up':                 // thinking — pupils ride high
          this.pupil(ctx, cx, cy - 10, 24 * big, 30 * big, open, 0, -0.5);
          break;
        case 'curiousBig':         // one eye bigger
          this.pupil(ctx, cx, cy, 24 * big, 30 * big, open);
          break;
        case 'open':
        default:
          this.pupil(ctx, cx, cy, 24 * big, 30 * big, open);
      }
    };

    if (s.eyes === 'curiousBig') {
      eye(lcx, 1.0, -1);
      eye(rcx, 1.5, 1);          // right eye enlarged → quizzical
    } else {
      eye(lcx, 1, -1);
      eye(rcx, 1, 1);
    }
  }

  // a filled eye "pupil" (rounded vertical capsule) with a highlight + blink
  pupil(ctx, cx, cy, rx, ry, open, hx = 0, hy = -0.4) {
    const h = Math.max(2, ry * open);
    ctx.beginPath();
    this.roundedRect(ctx, cx - rx, cy - h, rx * 2, h * 2, Math.min(rx, h));
    ctx.fill();
    if (open > 0.6) {            // glint
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(cx + hx * rx + rx * 0.32, cy + hy * ry, rx * 0.22, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // --------------------------------------------------------------- mouth
  drawMouth(ctx, s, lx, ly) {
    const cx = W / 2 + lx * 0.6;
    const cy = H * 0.70 + ly * 0.5;
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.lineWidth = 13;
    ctx.lineCap = 'round';

    switch (s.mouth) {
      case 'bigSmile': {
        ctx.lineWidth = 15;
        ctx.beginPath();
        ctx.arc(cx, cy - 22, 56, Math.PI * 0.15, Math.PI * 0.85);
        ctx.stroke();
        // tongue dot for warmth
        ctx.beginPath();
        ctx.arc(cx, cy + 18, 12, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'smile':
        ctx.beginPath();
        ctx.arc(cx, cy - 16, 42, Math.PI * 0.18, Math.PI * 0.82);
        ctx.stroke();
        break;
      case 'frown':
        ctx.beginPath();
        ctx.arc(cx, cy + 24, 42, Math.PI * 1.2, Math.PI * 1.8);
        ctx.stroke();
        break;
      case 'flat':
        ctx.beginPath();
        ctx.moveTo(cx - 38, cy);
        ctx.lineTo(cx + 38, cy);
        ctx.stroke();
        break;
      case 'open': {              // surprised "o"
        ctx.beginPath();
        ctx.ellipse(cx, cy, 22, 28, 0, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'talk': {              // height driven by talk(0..1)
        const o = 6 + (s.talk || 0) * 34;
        ctx.beginPath();
        this.roundedRect(ctx, cx - 30, cy - o / 2, 60, o, Math.min(14, o / 2));
        ctx.fill();
        break;
      }
      case 'small':
      default:
        ctx.beginPath();
        ctx.arc(cx, cy - 6, 22, Math.PI * 0.25, Math.PI * 0.75);
        ctx.stroke();
    }
  }

  // ------------------------------------------------------------- overlays
  drawOverlay(ctx, s) {
    const t = s.time;
    switch (s.overlay) {
      case 'dots': {              // thinking  "..."
        const n = Math.floor(t * 3) % 4;      // 0..3 visible
        ctx.fillStyle = INK_SOFT;
        for (let i = 0; i < 3; i++) {
          const a = i < n ? 1 : 0.18;
          ctx.globalAlpha = a;
          ctx.beginPath();
          ctx.arc(W / 2 - 34 + i * 34, H * 0.88, 9, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        break;
      }
      case 'spinner': {
        ctx.strokeStyle = INK_SOFT;
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(W / 2, H * 0.86, 20, t * 6, t * 6 + Math.PI * 1.4);
        ctx.stroke();
        break;
      }
      case 'progress': {
        const p = Math.max(0, Math.min(1, s.progress ?? 0));
        const bw = 220, bh = 22, bx = W / 2 - bw / 2, by = H * 0.84;
        ctx.strokeStyle = INK_SOFT;
        ctx.lineWidth = 4;
        ctx.beginPath();
        this.roundedRect(ctx, bx, by, bw, bh, 11);
        ctx.stroke();
        ctx.fillStyle = INK;
        ctx.beginPath();
        this.roundedRect(ctx, bx + 4, by + 4, (bw - 8) * p, bh - 8, 7);
        ctx.fill();
        break;
      }
      case 'zzz': {               // sleeping — rising Z's
        ctx.fillStyle = INK_SOFT;
        ctx.font = 'bold 26px monospace';
        for (let i = 0; i < 3; i++) {
          const ph = (t * 0.5 + i * 0.33) % 1;
          ctx.globalAlpha = 1 - ph;
          ctx.fillText('z', W * 0.70 + i * 22, H * 0.40 - ph * 60);
        }
        ctx.globalAlpha = 1;
        break;
      }
    }
  }

  // ----------------------------------------------- per-error SCREEN ART
  // a small animated scene drawn on the screen instead of the face
  drawArt(ctx, s) {
    const t = s.time;
    const A = s.artColor || '#4361ee';
    const INKD = '#3a4458';
    const CASE = '#eef4fb', CASE_S = '#9fb0c8';
    const GOLD = '#d9b65c', GOLD_S = '#b8902f';
    const SPARK = '#ffce3a';
    const TAU = Math.PI * 2;
    const rr = (x, y, w, h, r) => this.roundedRect(ctx, x, y, w, h, r);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (s.art === 'cable') {                 // 404 — severed power cable, sparking
      const sway = Math.sin(t * 1.8) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.07)';
      ctx.beginPath(); ctx.ellipse(256, 300, 120, 14, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = INKD; ctx.lineWidth = 24;
      ctx.beginPath(); ctx.moveTo(26, 150); ctx.quadraticCurveTo(120, 150, 190, 196 + sway); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(486, 150); ctx.quadraticCurveTo(392, 150, 322, 196 - sway); ctx.stroke();
      ctx.save(); ctx.translate(0, sway);
      ctx.fillStyle = CASE; ctx.strokeStyle = CASE_S; ctx.lineWidth = 5;
      rr(170, 166, 56, 60, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD_S; ctx.lineWidth = 3;
      rr(226, 174, 18, 11, 4); ctx.fill(); ctx.stroke();
      rr(226, 197, 18, 11, 4); ctx.fill(); ctx.stroke();
      ctx.restore();
      ctx.save(); ctx.translate(0, -sway);
      ctx.fillStyle = CASE; ctx.strokeStyle = CASE_S; ctx.lineWidth = 5;
      rr(286, 166, 56, 60, 14); ctx.fill(); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD_S; ctx.lineWidth = 3;
      rr(268, 174, 18, 11, 4); ctx.fill(); ctx.stroke();
      rr(268, 197, 18, 11, 4); ctx.fill(); ctx.stroke();
      ctx.restore();
      const gl = 0.35 + 0.65 * Math.abs(Math.sin(t * 7));
      ctx.save(); ctx.globalAlpha = 0.30 * gl; ctx.fillStyle = A;
      ctx.beginPath(); ctx.arc(256, 196, 42, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = SPARK;
      if (Math.sin(t * 20) > 0) { ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(244, 190); ctx.lineTo(258, 172); ctx.lineTo(252, 190); ctx.lineTo(268, 176); ctx.stroke(); }
      if (Math.sin(t * 17 + 2) > 0.3) { ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(266, 202); ctx.lineTo(252, 220); ctx.lineTo(263, 214); ctx.lineTo(250, 232); ctx.stroke(); }
      return;
    }

    if (s.art === 'hourglass') {              // 401 — session timed out
      ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD_S; ctx.lineWidth = 5;
      rr(196, 84, 120, 16, 8); ctx.fill(); ctx.stroke();
      rr(196, 260, 120, 16, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.strokeStyle = CASE_S; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(206, 100); ctx.lineTo(306, 100); ctx.lineTo(262, 180); ctx.lineTo(250, 180); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(250, 180); ctx.lineTo(262, 180); ctx.lineTo(306, 260); ctx.lineTo(206, 260); ctx.closePath(); ctx.fill(); ctx.stroke();
      const cyc = (t * 0.5) % 1;
      ctx.fillStyle = A; ctx.globalAlpha = 0.85;
      const ty = 112 + cyc * 54;
      ctx.beginPath(); ctx.moveTo(214, ty); ctx.lineTo(298, ty); ctx.lineTo(259, 176); ctx.lineTo(253, 176); ctx.closePath(); ctx.fill();
      const bh = 8 + cyc * 30;
      ctx.beginPath(); ctx.moveTo(212, 254); ctx.lineTo(300, 254); ctx.lineTo(256, 254 - bh); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
      const gp = (t * 2) % 1;
      ctx.fillRect(253, 182 + gp * 54, 5, 9);
      return;
    }

    if (s.art === 'lock') {                   // 403 — forbidden
      const shake = Math.sin(t * 16) * 5 * (0.5 + 0.5 * Math.sin(t * 0.9));
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.5 + i * 0.5) % 1;
        ctx.save(); ctx.globalAlpha = (1 - ph) * 0.5; ctx.strokeStyle = A; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(256, 192, 64 + ph * 70, 0, TAU); ctx.stroke(); ctx.restore();
      }
      ctx.save(); ctx.translate(shake, 0);
      ctx.strokeStyle = '#aeb6c8'; ctx.lineWidth = 15;
      ctx.beginPath(); ctx.arc(256, 168, 28, Math.PI, 0, true); ctx.stroke();
      ctx.fillStyle = A; ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 4;
      rr(208, 168, 96, 82, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(256, 202, 11, 0, TAU); ctx.fill();
      rr(251, 207, 10, 26, 5); ctx.fill();
      ctx.restore();
      return;
    }

    if (s.art === 'server') {                 // 500 — server crash
      const jit = (Math.floor(t * 14) % 2) ? 2 : -2;
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.4 + i * 0.5) % 1;
        ctx.save(); ctx.globalAlpha = (1 - ph) * 0.4; ctx.fillStyle = '#9fb0c8';
        ctx.beginPath(); ctx.arc(332 + i * 12, 118 - ph * 50, 12 - i * 3, 0, TAU); ctx.fill(); ctx.restore();
      }
      ctx.save(); ctx.translate(jit, 0);
      ctx.fillStyle = CASE; ctx.strokeStyle = CASE_S; ctx.lineWidth = 5;
      rr(166, 122, 180, 128, 18); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d4dcec'; rr(186, 142, 140, 24, 6); ctx.fill();
      ctx.fillStyle = A; ctx.beginPath(); ctx.arc(312, 154, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.04)'; rr(186, 180, 140, 54, 10); ctx.fill();
      if (Math.sin(t * 8) > -0.3) {
        ctx.strokeStyle = A; ctx.fillStyle = A; ctx.lineWidth = 9;
        ctx.beginPath(); ctx.moveTo(256, 192); ctx.lineTo(256, 214); ctx.stroke();
        ctx.beginPath(); ctx.arc(256, 226, 5, 0, TAU); ctx.fill();
      }
      ctx.restore();
      if (Math.sin(t * 22) > 0) { ctx.strokeStyle = SPARK; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(160, 130); ctx.lineTo(146, 118); ctx.lineTo(154, 130); ctx.lineTo(140, 122); ctx.stroke(); }
      return;
    }

    if (s.art === 'gears') {                  // 503 — maintenance
      this._gear(ctx, 214, 168, 44, 9, t * 0.9, '#cfd7e6', '#9fb0c8');
      this._gear(ctx, 296, 214, 30, 8, -t * 1.25, A, 'rgba(0,0,0,0.22)');
      return;
    }

    if (s.art === 'unplug') {                 // offline — plug pulled out
      const tug = Math.sin(t * 2.2) * 6;
      ctx.fillStyle = CASE; ctx.strokeStyle = CASE_S; ctx.lineWidth = 5;
      rr(330, 150, 70, 84, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9fb0c8'; rr(346, 172, 24, 9, 4); ctx.fill(); rr(346, 196, 24, 9, 4); ctx.fill();
      ctx.save(); ctx.translate(-tug, 0);
      ctx.strokeStyle = INKD; ctx.lineWidth = 22;
      ctx.beginPath(); ctx.moveTo(70, 252); ctx.quadraticCurveTo(120, 252, 168, 192); ctx.stroke();
      ctx.fillStyle = A; ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 4;
      rr(150, 158, 64, 64, 16); ctx.fill(); ctx.stroke();
      ctx.fillStyle = GOLD; ctx.strokeStyle = GOLD_S; ctx.lineWidth = 3;
      rr(214, 168, 22, 11, 4); ctx.fill(); ctx.stroke();
      rr(214, 196, 22, 11, 4); ctx.fill(); ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.5 + i * 0.5) % 1;
        ctx.save(); ctx.globalAlpha = (1 - ph) * 0.7; ctx.strokeStyle = A; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.arc(284, 192, 16 + ph * 40, -0.9, 0.9); ctx.stroke(); ctx.restore();
      }
      return;
    }
  }

  _gear(ctx, cx, cy, r, teeth, rot, fill, stroke) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = fill; ctx.strokeStyle = stroke; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    for (let i = 0; i < teeth; i++) {
      ctx.save(); ctx.rotate((i / teeth) * Math.PI * 2);
      this.roundedRect(ctx, -9, -(r + 13), 18, 17, 4); ctx.fill();
      ctx.restore();
    }
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  drawScanlines(ctx, s) {
    ctx.globalAlpha = s.dim ? 0.10 : 0.06;
    ctx.fillStyle = '#000';
    for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1.4);
    ctx.globalAlpha = 1;
  }

  // utility: rounded rectangle path
  roundedRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}
