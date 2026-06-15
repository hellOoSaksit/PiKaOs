/* PiKaOs — ES module (room renderer v2). */

/* ============================================================
   ROOM TILES 3D — isometric "diorama" renderer for the room
   system. Pure canvas drawing (no external assets, no lib).
   The room data model is UNCHANGED (guildos.rooms.v2):
     floor  Int[]  0 void · 1 wood · 2 tile · 3 carpet · 4 concrete · 5 grass
     struct Int[]  0 none · 1 wall · 2 door
     objects       [{ key, x, y, rot }]
   Top-down grid coords are projected 2:1 isometric; the floor is
   an extruded platform slab, walls are prisms (dollhouse rule:
   front-facing walls render knee-high so the interior stays
   visible), furniture is built from extruded boxes / cylinders /
   spheres in a soft pastel-3D style (see chat decision 2026-06-13).
   drawRoom() powers the live room view, build mode (hover/ghost
   drawn in-canvas) and the picker thumbnails.
   ============================================================ */

const PAL = {
  void: "#dce8f5",                         // palette swatch for "erase floor"
  skyA: "#e5edf8", skyB: "#cfdcef",        // canvas backdrop gradient
  shadow: "rgba(96,114,150,0.22)",         // blob shadow under furniture
  // floors (a/b checker + seam line)
  woodA: "#e9cba9", woodB: "#e2bf9a", woodLine: "#d2ad88",
  tileA: "#f5f0e6", tileB: "#ece4d5", tileLine: "#ded3bf",
  carpetA: "#a9c9e9", carpetB: "#9cbfdf", carpetLine: "#8db3d6",
  concA: "#d5dae3", concB: "#cbd1dc", concLine: "#bcc4d2",
  grassA: "#aed6a0", grassB: "#a1cb91", grassLine: "#93bf82",
  // walls / doors
  wall: "#ded6c8", wallTop: "#f3eee4", wallS: "#e9e2d4", wallE: "#c4baa8",
  doorWood: "#cf9758", doorHi: "#e4b277", doorMat: "#cfe7d8",
  // wood furniture
  deskTop: "#d8a878", deskEdge: "#c08c5c", deskLeg: "#a87848",
  // electronics / metal / plastic (soft slate — no harsh black)
  black: "#566077", dark: "#454f63",
  screen: "#a9d0f2", screenHi: "#d6eafc",
  white: "#fdfdfd", whiteSh: "#e6eaf2",
  steel: "#cfd6e2", steelSh: "#a9b3c5",
  red: "#ee8d84", green: "#8cc97e", blue: "#8fb7ea", yellow: "#f2d287", pink: "#f2aac8",
  // plants
  pot: "#d99e6b", leaf: "#7fc070", leafHi: "#a5d894", leafDk: "#62a657",
  // fabric
  sofa: "#b3a3e2", sofaSh: "#9d8cd0", cushion: "#cfc3f0",
  rugA: "#f2b8c6", rugB: "#f6d9a8", rugC: "#a8c8e8",
  book1: "#ee8d84", book2: "#8fb7ea", book3: "#8cc97e", book4: "#f2d287", book5: "#c5a8ec",
  frameGold: "#e2bd7e", paintSky: "#bfe0f2", paintHill: "#a5d295", paintSun: "#f6d287",
  gold: "#d9aa3c",
};
const FLOOR_PAL = {
  1: { a: PAL.woodA, b: PAL.woodB, line: PAL.woodLine },
  2: { a: PAL.tileA, b: PAL.tileB, line: PAL.tileLine },
  3: { a: PAL.carpetA, b: PAL.carpetB, line: PAL.carpetLine },
  4: { a: PAL.concA, b: PAL.concB, line: PAL.concLine },
  5: { a: PAL.grassA, b: PAL.grassB, line: PAL.grassLine },
};

/* ---- color + iso math helpers ---- */
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const t = amt > 0 ? 255 : 0, a = Math.abs(amt);
  r = Math.round(r + (t - r) * a); g = Math.round(g + (t - g) * a); b = Math.round(b + (t - b) * a);
  return `rgb(${r},${g},${b})`;
}
/* geometry for a room at a given cell size — one source of truth for the
   canvas dims AND for DOM overlays (agents) positioned by the screens */
function isoGeom(room, cell = 24) {
  const TW = cell * 2, TH = cell;                 // 2:1 diamond
  const wallH = Math.round(cell * 1.95);
  const slabH = Math.max(2, Math.round(cell * 0.5));
  const ox = room.h * TW / 2 + cell;              // px of grid corner (0,0)
  const oy = wallH + Math.round(cell * 0.9);
  const W = Math.round((room.w + room.h) * TW / 2 + cell * 2);
  const H = Math.round((room.w + room.h) * TH / 2 + oy + slabH + cell * 1.2);
  return { cell, TW, TH, wallH, slabH, ox, oy, W, H };
}
/* continuous grid coord (fx,fy) -> canvas px at floor level */
function gridToPx(g, fx, fy) {
  return { x: g.ox + (fx - fy) * g.TW / 2, y: g.oy + (fx + fy) * g.TH / 2 };
}
/* inverse: canvas px -> continuous grid coord */
function pxToGrid(g, px, py) {
  const a = (px - g.ox) / (g.TW / 2), b = (py - g.oy) / (g.TH / 2);
  return { fx: (b + a) / 2, fy: (b - a) / 2 };
}

function poly(ctx, pts, fill, stroke, lw = 1) {
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
}
/* extruded box: footprint (fx,fy,w,d) in grid units, bottom z0 px above
   floor, height h px. Light from upper-left: bright top, mid south face
   (lower-left), dark east face (lower-right). */
function isoBox(ctx, g, fx, fy, w, d, z0, h, color, o = {}) {
  const A = gridToPx(g, fx, fy), B = gridToPx(g, fx + w, fy),
    C = gridToPx(g, fx + w, fy + d), D = gridToPx(g, fx, fy + d);
  const zt = z0 + h;
  const up = (p, z) => [p.x, p.y - z];
  if (h > 0) {
    poly(ctx, [up(D, z0), up(C, z0), up(C, zt), up(D, zt)], o.south || shade(color, -0.05));
    poly(ctx, [up(C, z0), up(B, z0), up(B, zt), up(C, zt)], o.east || shade(color, -0.26));
  }
  poly(ctx, [up(A, zt), up(B, zt), up(C, zt), up(D, zt)], o.top || shade(color, 0.22), o.line, o.lw);
}
function isoCyl(ctx, g, cx, cy, r, z0, h, color) {
  const p = gridToPx(g, cx, cy);
  const rx = r * g.cell, ry = rx * 0.5;
  const yTop = p.y - z0 - h, yBot = p.y - z0;
  if (h > 0) {
    const grad = ctx.createLinearGradient(p.x - rx, 0, p.x + rx, 0);
    grad.addColorStop(0, shade(color, 0.12)); grad.addColorStop(0.55, color); grad.addColorStop(1, shade(color, -0.28));
    ctx.fillStyle = grad; ctx.beginPath();
    ctx.moveTo(p.x - rx, yTop); ctx.lineTo(p.x - rx, yBot);
    ctx.ellipse(p.x, yBot, rx, ry, 0, Math.PI, 0, true);
    ctx.lineTo(p.x + rx, yTop); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = shade(color, 0.22); ctx.beginPath();
  ctx.ellipse(p.x, yTop, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
}
function isoSphere(ctx, g, cx, cy, z, r, color) {
  const p = gridToPx(g, cx, cy); const R = r * g.cell;
  const grad = ctx.createRadialGradient(p.x - R * 0.35, p.y - z - R * 0.45, R * 0.15, p.x, p.y - z, R);
  grad.addColorStop(0, shade(color, 0.38)); grad.addColorStop(0.6, color); grad.addColorStop(1, shade(color, -0.2));
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(p.x, p.y - z, R, 0, Math.PI * 2); ctx.fill();
}
function blobShadow(ctx, g, cx, cy, r) {
  const p = gridToPx(g, cx, cy);
  ctx.fillStyle = PAL.shadow; ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * g.cell, r * g.cell * 0.5, 0, 0, Math.PI * 2); ctx.fill();
}
/* legacy-compat rect filler (kept for API compat) */
function mkR(ctx, x0, y0, cell) {
  return (a, b, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x0 + a * cell, y0 + b * cell, w * cell, h * cell); };
}

/* ============================================================
   FURNITURE CATALOG. Same keys + metadata as v1 (saved layouts
   stay valid). Each item adds draw3d(k) where k is a kit bound
   to the object: local rot-0 coords are rotated automatically.
     k.c                  cell px (height unit)
     k.box / k.flat       extruded box / flat diamond
     k.cyl / k.sph        cylinder / sphere
     k.shadow             soft floor blob
   ============================================================ */
function makeKit(ctx, g, obj, def) {
  const r = ((obj.rot || 0) % 4 + 4) % 4;
  const W = def.w, H = def.h;
  const map = (lx, ly, lw, ld) => {
    let x, y, w, d;
    if (r === 0) { x = lx; y = ly; w = lw; d = ld; }
    else if (r === 1) { x = H - (ly + ld); y = lx; w = ld; d = lw; }
    else if (r === 2) { x = W - (lx + lw); y = H - (ly + ld); w = lw; d = ld; }
    else { x = ly; y = W - (lx + lw); w = ld; d = lw; }
    return { x: obj.x + x, y: obj.y + y, w, d };
  };
  return {
    c: g.cell, rot: r,
    box: (lx, ly, lw, ld, z0, h, color, o) => { const m = map(lx, ly, lw, ld); isoBox(ctx, g, m.x, m.y, m.w, m.d, z0, h, color, o); },
    flat: (lx, ly, lw, ld, z, color, o) => { const m = map(lx, ly, lw, ld); isoBox(ctx, g, m.x, m.y, m.w, m.d, z, 0, color, { top: color, ...(o || {}) }); },
    cyl: (lcx, lcy, rad, z0, h, color) => { const m = map(lcx, lcy, 0, 0); isoCyl(ctx, g, m.x, m.y, rad, z0, h, color); },
    sph: (lcx, lcy, z, rad, color) => { const m = map(lcx, lcy, 0, 0); isoSphere(ctx, g, m.x, m.y, z, rad, color); },
    shadow: (lcx, lcy, rad) => { const m = map(lcx, lcy, 0, 0); blobShadow(ctx, g, m.x, m.y, rad); },
  };
}

const FURN = {
  desk: {
    th: "โต๊ะทำงาน", cat: "work", w: 2, h: 1, block: true,
    draw3d(k) { const c = k.c;
      k.box(0.12, 0.14, 0.1, 0.72, 0, c * 0.82, PAL.deskLeg); k.box(1.78, 0.14, 0.1, 0.72, 0, c * 0.82, PAL.deskLeg);
      k.box(1.15, 0.18, 0.55, 0.64, 0, c * 0.82, PAL.white);                       // drawer unit
      k.box(0.02, 0.08, 1.96, 0.86, c * 0.82, c * 0.13, PAL.deskTop, { east: shade(PAL.deskEdge, -0.1) });
      k.box(0.95, 0.26, 0.14, 0.26, c * 0.95, c * 0.08, PAL.dark);                 // monitor stand
      k.box(0.55, 0.22, 0.94, 0.07, c * 1.03, c * 0.6, PAL.dark);                  // panel
      k.box(0.59, 0.3, 0.86, 0.015, c * 1.08, c * 0.5, PAL.screen, { south: PAL.screenHi, east: PAL.screen }); // glow
      k.box(0.6, 0.56, 0.78, 0.24, c * 0.95, c * 0.045, PAL.whiteSh);              // keyboard
      k.cyl(1.72, 0.68, 0.09, c * 0.95, c * 0.18, PAL.pink);                       // mug
    },
  },
  chair: {
    th: "เก้าอี้", cat: "work", w: 1, h: 1, seat: true,
    draw3d(k) { const c = k.c;
      k.cyl(0.5, 0.5, 0.3, 0, c * 0.05, PAL.steelSh);
      k.cyl(0.5, 0.5, 0.06, 0, c * 0.5, PAL.steelSh);
      k.box(0.18, 0.2, 0.64, 0.6, c * 0.5, c * 0.13, PAL.blue);
      k.box(0.2, 0.12, 0.6, 0.12, c * 0.63, c * 0.6, PAL.blue);                    // back
    },
  },
  table: {
    th: "โต๊ะประชุม", cat: "work", w: 2, h: 1, block: true,
    draw3d(k) { const c = k.c;
      k.box(0.8, 0.32, 0.4, 0.36, 0, c * 0.78, PAL.deskEdge);
      k.box(0.04, 0.08, 1.92, 0.84, c * 0.78, c * 0.13, PAL.deskTop, { east: shade(PAL.deskEdge, -0.1) });
      k.box(0.85, 0.36, 0.34, 0.26, c * 0.91, c * 0.04, PAL.white);                // laptop base
      k.box(0.85, 0.34, 0.34, 0.03, c * 0.95, c * 0.26, PAL.whiteSh);              // laptop lid
    },
  },
  bookshelf: {
    th: "ชั้นหนังสือ", cat: "work", w: 2, h: 1, block: true, onWall: true,
    draw3d(k) { const c = k.c, books = [PAL.book1, PAL.book2, PAL.book3, PAL.book4, PAL.book5];
      k.box(0.04, 0.2, 0.1, 0.6, 0, c * 2.05, PAL.deskLeg); k.box(1.86, 0.2, 0.1, 0.6, 0, c * 2.05, PAL.deskLeg);
      [0.42, 1.05, 1.68].forEach((z, row) => {
        k.box(0.08, 0.22, 1.84, 0.56, c * z, c * 0.07, PAL.deskTop);
        const n = 7 - row;
        for (let i = 0; i < n; i++) k.box(0.2 + i * 0.21, 0.3, 0.16, 0.4, c * (z + 0.07), c * (0.36 + ((i * 7 + row) % 3) * 0.04), books[(i + row * 2) % books.length]);
      });
      k.cyl(1.62, 0.5, 0.11, c * 1.75, c * 0.12, PAL.pot); k.sph(1.62, 0.5, c * 2.0, 0.15, PAL.leaf); // top plant
    },
  },
  sofa: {
    th: "โซฟา", cat: "lounge", w: 2, h: 1, seat: true,
    draw3d(k) { const c = k.c;
      k.box(0.05, 0.16, 1.9, 0.74, c * 0.18, c * 0.4, PAL.sofa);
      k.box(0.05, 0.08, 1.9, 0.24, c * 0.5, c * 0.55, PAL.sofaSh);                 // back
      k.box(0.0, 0.1, 0.2, 0.82, c * 0.4, c * 0.5, PAL.sofaSh);                    // arms
      k.box(1.8, 0.1, 0.2, 0.82, c * 0.4, c * 0.5, PAL.sofaSh);
      k.box(0.26, 0.36, 0.7, 0.5, c * 0.55, c * 0.1, PAL.cushion);
      k.box(1.04, 0.36, 0.7, 0.5, c * 0.55, c * 0.1, PAL.cushion);
    },
  },
  armchair: {
    th: "เก้าอี้นวม", cat: "lounge", w: 1, h: 1, seat: true,
    draw3d(k) { const c = k.c;
      k.box(0.12, 0.18, 0.76, 0.7, c * 0.16, c * 0.38, PAL.sofa);
      k.box(0.12, 0.1, 0.76, 0.2, c * 0.46, c * 0.52, PAL.sofaSh);
      k.box(0.06, 0.14, 0.16, 0.74, c * 0.36, c * 0.44, PAL.sofaSh);
      k.box(0.78, 0.14, 0.16, 0.74, c * 0.36, c * 0.44, PAL.sofaSh);
      k.box(0.28, 0.34, 0.44, 0.46, c * 0.5, c * 0.09, PAL.cushion);
    },
  },
  coffee: {
    th: "โต๊ะกลาง", cat: "lounge", w: 1, h: 1, block: true,
    draw3d(k) { const c = k.c;
      k.cyl(0.5, 0.5, 0.09, 0, c * 0.42, PAL.deskLeg);
      k.cyl(0.5, 0.5, 0.42, c * 0.42, c * 0.08, PAL.deskTop);
      k.box(0.36, 0.4, 0.26, 0.2, c * 0.5, c * 0.05, PAL.book2);                   // a book
    },
  },
  rug: {
    th: "พรม", cat: "lounge", w: 2, h: 2, floorDecor: true,
    draw3d(k) {
      k.flat(0.08, 0.08, 1.84, 1.84, 1.5, PAL.rugA);
      k.flat(0.3, 0.3, 1.4, 1.4, 2, PAL.rugB);
      k.flat(0.58, 0.58, 0.84, 0.84, 2.5, PAL.rugC);
    },
  },
  lamp: {
    th: "โคมไฟ", cat: "lounge", w: 1, h: 1, block: true,
    draw3d(k) { const c = k.c;
      k.cyl(0.5, 0.5, 0.22, 0, c * 0.07, PAL.steelSh);
      k.cyl(0.5, 0.5, 0.045, 0, c * 1.85, PAL.steelSh);
      k.sph(0.5, 0.5, c * 2.0, 0.42, PAL.yellow);                                  // warm glow shade
      k.cyl(0.5, 0.5, 0.3, c * 1.8, c * 0.42, "#f6dc9d");
    },
  },
  tv: {
    th: "ทีวี", cat: "lounge", w: 2, h: 1, block: true, onWall: true,
    draw3d(k) { const c = k.c;
      k.box(0.08, 0.28, 1.84, 0.54, 0, c * 0.5, PAL.deskTop, { east: shade(PAL.deskEdge, -0.1) }); // media cabinet
      k.box(0.24, 0.44, 1.52, 0.09, c * 0.58, c * 1.0, PAL.dark);                  // panel
      k.box(0.29, 0.52, 1.42, 0.015, c * 0.65, c * 0.86, PAL.screen, { south: PAL.screenHi, east: PAL.screen });
    },
  },
  bed: {
    th: "เตียง", cat: "lounge", w: 2, h: 2, block: true,
    draw3d(k) { const c = k.c;
      k.box(0.04, 0.02, 1.92, 0.22, 0, c * 0.85, PAL.deskEdge);                    // headboard (north)
      k.box(0.04, 0.06, 1.92, 1.9, 0, c * 0.42, PAL.deskEdge);
      k.box(0.1, 0.12, 1.8, 1.78, c * 0.42, c * 0.24, PAL.white);
      k.box(0.22, 0.26, 0.66, 0.46, c * 0.66, c * 0.14, PAL.whiteSh);              // pillows
      k.box(1.1, 0.26, 0.66, 0.46, c * 0.66, c * 0.14, PAL.whiteSh);
      k.box(0.1, 0.92, 1.8, 0.98, c * 0.62, c * 0.12, PAL.blue);                   // blanket
    },
  },
  fridge: {
    th: "ตู้เย็น", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw3d(k) { const c = k.c;
      k.box(0.18, 0.18, 0.64, 0.64, 0, c * 1.45, PAL.white);
      k.box(0.18, 0.18, 0.64, 0.64, c * 1.48, c * 0.5, PAL.white, { south: shade(PAL.white, -0.08) }); // freezer
      k.box(0.24, 0.8, 0.05, 0.04, c * 0.9, c * 0.45, PAL.steelSh);                // handle
    },
  },
  counter: {
    th: "เคาน์เตอร์", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw3d(k) { const c = k.c;
      k.box(0.06, 0.12, 0.88, 0.76, 0, c * 0.92, PAL.white);
      k.box(0.02, 0.08, 0.96, 0.84, c * 0.92, c * 0.08, PAL.tileA, { east: shade(PAL.tileLine, -0.1) });
      k.flat(0.3, 0.3, 0.42, 0.34, c * 1.01, PAL.steelSh);                         // sink
      k.cyl(0.74, 0.42, 0.035, c * 1.0, c * 0.3, PAL.steel);                       // faucet
    },
  },
  vending: {
    th: "ตู้กดน้ำ", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw3d(k) { const c = k.c;
      k.box(0.14, 0.18, 0.72, 0.64, 0, c * 1.95, PAL.red);
      k.box(0.18, 0.83, 0.42, 0.012, c * 0.7, c * 1.05, PAL.screenHi, { south: PAL.screenHi }); // lit window
      k.box(0.66, 0.83, 0.14, 0.012, c * 1.3, c * 0.3, PAL.whiteSh, { south: PAL.whiteSh });    // coin panel
      k.box(0.2, 0.83, 0.4, 0.012, c * 0.2, c * 0.22, shade(PAL.red, -0.25), { south: shade(PAL.red, -0.25) }); // tray
    },
  },
  cooler: {
    th: "ตู้น้ำเย็น", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw3d(k) { const c = k.c;
      k.box(0.3, 0.3, 0.4, 0.4, 0, c * 0.95, PAL.white);
      k.cyl(0.5, 0.5, 0.17, c * 0.98, c * 0.4, PAL.screenHi);                      // water jug
      k.box(0.42, 0.68, 0.07, 0.05, c * 0.7, c * 0.08, PAL.blue);                  // tap
    },
  },
  plantS: {
    th: "ต้นไม้เล็ก", cat: "decor", w: 1, h: 1, block: true,
    draw3d(k) { const c = k.c;
      k.cyl(0.5, 0.55, 0.2, 0, c * 0.35, PAL.pot);
      k.sph(0.42, 0.6, c * 0.62, 0.22, PAL.leafDk);
      k.sph(0.6, 0.48, c * 0.72, 0.24, PAL.leaf);
      k.sph(0.48, 0.52, c * 0.95, 0.18, PAL.leafHi);
    },
  },
  plantT: {
    th: "ต้นไม้สูง", cat: "decor", w: 1, h: 1, block: true,
    draw3d(k) { const c = k.c;
      k.cyl(0.5, 0.55, 0.24, 0, c * 0.45, PAL.pot);
      k.cyl(0.5, 0.52, 0.05, c * 0.4, c * 0.9, PAL.deskLeg);
      k.sph(0.36, 0.6, c * 1.25, 0.26, PAL.leafDk);
      k.sph(0.64, 0.5, c * 1.35, 0.26, PAL.leaf);
      k.sph(0.5, 0.55, c * 1.7, 0.3, PAL.leafHi);
    },
  },
  painting: {
    th: "ภาพแขวน", cat: "decor", w: 1, h: 1, onWall: true,
    draw3d(k) { const c = k.c;
      k.box(0.12, 0.44, 0.76, 0.07, c * 0.95, c * 0.62, PAL.frameGold);
      k.box(0.17, 0.5, 0.66, 0.015, c * 1.26, c * 0.26, PAL.paintSky, { south: PAL.paintSky });
      k.box(0.17, 0.5, 0.66, 0.015, c * 1.02, c * 0.24, PAL.paintHill, { south: PAL.paintHill });
      k.box(0.6, 0.5, 0.12, 0.015, c * 1.3, c * 0.12, PAL.paintSun, { south: PAL.paintSun });
    },
  },
  clock: {
    th: "นาฬิกา", cat: "decor", w: 1, h: 1, onWall: true,
    draw3d(k) { const c = k.c;
      k.box(0.36, 0.46, 0.28, 0.05, c * 1.2, c * 0.5, PAL.dark);
      k.box(0.4, 0.52, 0.2, 0.012, c * 1.27, c * 0.36, PAL.white, { south: PAL.white });
      k.box(0.48, 0.53, 0.04, 0.012, c * 1.44, c * 0.16, PAL.dark, { south: PAL.dark });   // hands
      k.box(0.48, 0.53, 0.1, 0.012, c * 1.42, c * 0.04, PAL.red, { south: PAL.red });
    },
  },
};

const FLOOR_TYPES = [
  { v: 1, th: "ไม้", swatch: PAL.woodA }, { v: 2, th: "กระเบื้อง", swatch: PAL.tileA },
  { v: 3, th: "พรมน้ำเงิน", swatch: PAL.carpetA }, { v: 4, th: "ปูน", swatch: PAL.concA },
  { v: 5, th: "หญ้า", swatch: PAL.grassA },
];
const CATS = [
  { key: "floor", th: "พื้น" }, { key: "struct", th: "โครงสร้าง" },
  { key: "work", th: "ทำงาน" }, { key: "lounge", th: "นั่งเล่น" },
  { key: "kitchen", th: "ครัว" }, { key: "decor", th: "ตกแต่ง" },
];

/* ---- footprint / rotation helpers (unchanged API) ---- */
function effFootprint(key, rot) { const d = FURN[key]; const r = ((rot || 0) % 4 + 4) % 4; return r % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; }
function objCells(obj) { const f = effFootprint(obj.key, obj.rot); const out = []; for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) out.push([obj.x + xx, obj.y + yy]); return out; }

/* draw one object into an iso scene */
function drawObject(ctx, g, obj) {
  const d = FURN[obj.key]; if (!d || !d.draw3d) return;
  const eff = effFootprint(obj.key, obj.rot);
  if (!d.floorDecor && !d.onWall) blobShadow(ctx, g, obj.x + eff.w / 2, obj.y + eff.h / 2, Math.min(eff.w, eff.h) * 0.42);
  d.draw3d(makeKit(ctx, g, obj, d));
}

/* ---- floor / walls / doors ---- */
function drawFloor(ctx, g, room, x, y, type, opts) {
  const fp = FLOOR_PAL[type] || FLOOR_PAL[1];
  const w = room.w, h = room.h;
  // struct cells count as platform too — walls must stand ON the slab
  const at = (gx, gy) => gx >= 0 && gy >= 0 && gx < w && gy < h && (room.floor[gy * w + gx] > 0 || room.struct[gy * w + gx] > 0);
  // platform slab sides where the floor ends (diorama edge)
  if (!at(x, y + 1)) isoBox(ctx, g, x, y, 1, 1, -g.slabH, g.slabH, fp.a, { top: "transparent", south: shade(fp.line, -0.12), east: "transparent" });
  if (!at(x + 1, y)) isoBox(ctx, g, x, y, 1, 1, -g.slabH, g.slabH, fp.a, { top: "transparent", south: "transparent", east: shade(fp.line, -0.32) });
  const base = ((x + y) & 1) ? fp.b : fp.a;
  isoBox(ctx, g, x, y, 1, 1, 0, 0, base, { top: type === 1 ? ((y & 1) ? fp.b : fp.a) : base, line: opts && opts.grid ? "rgba(120,135,170,.25)" : shade(fp.line, 0.18), lw: 1 });
  if (type === 5 && ((x * 7 + y * 13) % 4 === 0)) {        // grass tufts
    const p = gridToPx(g, x + 0.5, y + 0.55);
    ctx.fillStyle = fp.line; ctx.beginPath(); ctx.ellipse(p.x, p.y, g.cell * 0.08, g.cell * 0.04, 0, 0, Math.PI * 2); ctx.fill();
  }
}
function drawWall(ctx, g, x, y, low) {
  isoBox(ctx, g, x, y, 1, 1, 0, low ? g.cell * 0.45 : g.wallH, PAL.wall,
    { top: PAL.wallTop, south: PAL.wallS, east: PAL.wallE });
}
function drawDoor(ctx, g, x, y, low, panelEast) {
  if (low) {
    isoBox(ctx, g, x + 0.08, y + 0.08, 0.84, 0.84, 1, 0, PAL.doorMat, { top: PAL.doorMat });
    isoBox(ctx, g, x + 0.02, y + 0.02, 0.18, 0.18, 0, g.cell * 0.55, PAL.doorWood);
    isoBox(ctx, g, x + 0.8, y + 0.8, 0.18, 0.18, 0, g.cell * 0.55, PAL.doorWood);
    return;
  }
  drawWall(ctx, g, x, y, false);
  const c = g.cell, z0 = 2, z1 = g.wallH * 0.8;
  const pts = panelEast
    ? [gridToPx(g, x + 1, y + 0.16), gridToPx(g, x + 1, y + 0.84)]
    : [gridToPx(g, x + 0.16, y + 1), gridToPx(g, x + 0.84, y + 1)];
  poly(ctx, [[pts[0].x, pts[0].y - z0], [pts[1].x, pts[1].y - z0], [pts[1].x, pts[1].y - z1], [pts[0].x, pts[0].y - z1]], PAL.doorWood);
  const hx = pts[0].x + (pts[1].x - pts[0].x) * 0.78, hy = pts[0].y + (pts[1].y - pts[0].y) * 0.78 - g.wallH * 0.38;
  ctx.fillStyle = PAL.frameGold; ctx.beginPath(); ctx.arc(hx, hy, Math.max(1.5, c * 0.06), 0, Math.PI * 2); ctx.fill();
}

/* ---- build-mode overlays (drawn in-canvas so they sit in the iso plane) ---- */
function drawHover(ctx, g, x, y) {
  const A = gridToPx(g, x, y), B = gridToPx(g, x + 1, y), C = gridToPx(g, x + 1, y + 1), D = gridToPx(g, x, y + 1);
  poly(ctx, [[A.x, A.y], [B.x, B.y], [C.x, C.y], [D.x, D.y]], "rgba(217,170,60,.22)", PAL.gold, 2);
}
function drawGhost(ctx, g, gh) {
  for (let yy = 0; yy < gh.h; yy++) for (let xx = 0; xx < gh.w; xx++) {
    const A = gridToPx(g, gh.x + xx, gh.y + yy), B = gridToPx(g, gh.x + xx + 1, gh.y + yy),
      C = gridToPx(g, gh.x + xx + 1, gh.y + yy + 1), D = gridToPx(g, gh.x + xx, gh.y + yy + 1);
    poly(ctx, [[A.x, A.y], [B.x, B.y], [C.x, C.y], [D.x, D.y]], "rgba(217,170,60,.16)");
  }
  const A = gridToPx(g, gh.x, gh.y), B = gridToPx(g, gh.x + gh.w, gh.y),
    C = gridToPx(g, gh.x + gh.w, gh.y + gh.h), D = gridToPx(g, gh.x, gh.y + gh.h);
  ctx.save(); ctx.setLineDash([5, 4]);
  poly(ctx, [[A.x, A.y], [B.x, B.y], [C.x, C.y], [D.x, D.y]], null, PAL.gold, 2);
  ctx.restore();
}

/* ---- master room renderer ---- */
function drawRoom(canvas, room, opts = {}) {
  const cell = opts.cell || 24;
  const g = isoGeom(room, cell);
  canvas.width = g.W; canvas.height = g.H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  const sky = ctx.createLinearGradient(0, 0, 0, g.H);
  sky.addColorStop(0, PAL.skyA); sky.addColorStop(1, PAL.skyB);
  ctx.fillStyle = sky; ctx.fillRect(0, 0, g.W, g.H);

  const w = room.w, h = room.h;
  const floorish = (x, y) => x >= 0 && y >= 0 && x < w && y < h && room.floor[y * w + x] > 0 && room.struct[y * w + x] !== 1;

  // floor platform (back-to-front so slab edges layer correctly);
  // struct-only cells get a neutral concrete pad so walls never float
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = room.floor[y * w + x];
    if (t) drawFloor(ctx, g, room, x, y, t, opts);
    else if (room.struct[y * w + x]) drawFloor(ctx, g, room, x, y, 4, opts);
  }
  // rugs flat on the floor
  (room.objects || []).filter(o => FURN[o.key] && FURN[o.key].floorDecor).forEach(o => drawObject(ctx, g, o));
  if (opts.hover) drawHover(ctx, g, opts.hover.x, opts.hover.y);

  // walls / doors / furniture in painter's order (by far-corner depth)
  const items = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = room.struct[y * w + x]; if (!s) continue;
    // dollhouse rule: walls with no open floor to the south OR east face the
    // camera — render knee-high so they never hide the interior
    const low = !floorish(x, y + 1) && !floorish(x + 1, y);
    const panelEast = floorish(x + 1, y) && !floorish(x, y + 1);
    items.push({ d: x + y, tie: 0, fn: s === 1 ? () => drawWall(ctx, g, x, y, low) : () => drawDoor(ctx, g, x, y, low, panelEast) });
  }
  (room.objects || []).filter(o => FURN[o.key] && !FURN[o.key].floorDecor).forEach(o => {
    const eff = effFootprint(o.key, o.rot);
    items.push({ d: (o.x + eff.w - 1) + (o.y + eff.h - 1), tie: 1, fn: () => drawObject(ctx, g, o) });
  });
  items.sort((a, b) => (a.d - b.d) || (a.tie - b.tie)).forEach(it => it.fn());

  if (opts.ghost) drawGhost(ctx, g, opts.ghost);
  return g;
}

/* ---- palette thumbnail: one item on a tiny iso stage ---- */
function drawItemPreview(canvas, key, cell = 12) {
  const def = FURN[key]; if (!def || !canvas) return;
  const room = { w: def.w, h: def.h };
  const g = isoGeom(room, cell);
  canvas.width = g.W; canvas.height = g.H;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  isoBox(ctx, g, 0, 0, def.w, def.h, 0, 0, "#e3ebf7", { top: "#e3ebf7", line: "rgba(120,135,170,.35)" });
  drawObject(ctx, g, { key, x: 0, y: 0, rot: 0 });
}

Object.assign(window, { PAL, FURN, FLOOR_TYPES, CATS, isoGeom, gridToPx, pxToGrid, drawFloor, drawWall, drawDoor, drawObject, drawRoom, drawItemPreview, effFootprint, objCells });

export {
  CATS,
  FLOOR_TYPES,
  FURN,
  PAL,
  drawDoor,
  drawFloor,
  drawItemPreview,
  drawObject,
  drawRoom,
  drawWall,
  effFootprint,
  gridToPx,
  isoGeom,
  mkR,
  objCells,
  pxToGrid
};
