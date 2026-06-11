/* PiKaOs — ES module (migrated from PiKaOs/room-tiles.jsx). */


/* ============================================================
   ROOM TILES — original top-down pixel art for the room system.
   Pure canvas drawing (no external assets). Three layers:
     floor  (paintable: wood/tile/carpet/concrete/grass)
     struct (paintable: wall / door)
     objects(furniture catalog, placeable + rotatable)
   drawRoom() paints a whole room onto a canvas at any cell size,
   so it powers both the live room view and the picker thumbnails.
   ============================================================ */

const PAL = {
  void: "#0b0e14",
  // floors
  woodA: "#9c6b3a", woodB: "#92632f", woodLine: "#7c5026",
  tileA: "#e6ded0", tileB: "#ded5c4", tileLine: "#cabfa9",
  carpetA: "#3b6e85", carpetB: "#35footer", carpetLine: "#315f73",
  concA: "#70767e", concB: "#6a7078", concLine: "#5c626a",
  grassA: "#5f8a4a", grassB: "#578040", grassLine: "#4d7338",
  // walls / doors
  wall: "#262b36", wallHi: "#39404f", wallSh: "#181b23",
  doorWood: "#8a5a30", doorHi: "#a06c3c", doorMat: "#caa15a",
  // wood furniture
  deskTop: "#7d5530", deskHi: "#8e6238", deskEdge: "#5d3e22", deskLeg: "#47301a",
  // electronics / metal / plastic
  black: "#23272f", dark: "#171a20",
  screen: "#3a5a78", screenHi: "#5f86ad",
  white: "#edf0f4", whiteSh: "#d2d7e0",
  steel: "#aab2bf", steelSh: "#838b99",
  red: "#c1554e", green: "#5d9a55", blue: "#4a78c2", yellow: "#d9b24a", pink: "#cf7fa0",
  // plants
  pot: "#b4763f", potSh: "#90five", leaf: "#4f8a45", leafHi: "#65a557", leafDk: "#3a6633",
  // fabric
  sofa: "#7a67a6", sofaSh: "#65548d", cushion: "#8e7bba",
  rugA: "#b3503f", rugB: "#caa24a", rugC: "#3f7bb3",
  book1: "#b3503f", book2: "#3f7bb3", book3: "#4f9a55", book4: "#caa24a", book5: "#9a6cc0",
  frameGold: "#c9a157", paintSky: "#9cc2d6", paintHill: "#6fa45c", paintSun: "#e6c45a",
};
/* fix a couple of typo'd values defensively */
PAL.carpetB = "#356074"; PAL.potSh = "#905e31";

/* ---- floor painting ---- */
function drawFloor(ctx, px, py, cell, type, x, y) {
  const seam = Math.max(1, Math.round(cell * 0.045));
  let a, b, line;
  switch (type) {
    case 1: a = PAL.woodA; b = PAL.woodB; line = PAL.woodLine; break;
    case 2: a = PAL.tileA; b = PAL.tileB; line = PAL.tileLine; break;
    case 3: a = PAL.carpetA; b = PAL.carpetB; line = PAL.carpetLine; break;
    case 4: a = PAL.concA; b = PAL.concB; line = PAL.concLine; break;
    case 5: a = PAL.grassA; b = PAL.grassB; line = PAL.grassLine; break;
    default: return; // void
  }
  if (type === 1) { // planks: alternate rows + bottom seam
    ctx.fillStyle = (y & 1) ? b : a; ctx.fillRect(px, py, cell, cell);
    ctx.fillStyle = line; ctx.fillRect(px, py + cell - seam, cell, seam);
    ctx.fillRect(px + ((x & 1) ? Math.round(cell / 2) : 0), py, seam, cell);
  } else if (type === 2 || type === 4) { // tiles: grout grid
    ctx.fillStyle = ((x + y) & 1) ? b : a; ctx.fillRect(px, py, cell, cell);
    ctx.fillStyle = line; ctx.fillRect(px, py + cell - seam, cell, seam); ctx.fillRect(px + cell - seam, py, seam, cell);
  } else { // carpet / grass: soft checker
    ctx.fillStyle = a; ctx.fillRect(px, py, cell, cell);
    ctx.fillStyle = b; if ((x + y) & 1) ctx.fillRect(px, py, cell, cell);
    if (type === 5) { ctx.fillStyle = PAL.grassLine; ctx.fillRect(px + Math.round(cell * 0.3), py + Math.round(cell * 0.6), seam, seam); }
  }
}

/* ---- walls + doors (struct layer). nb = {n,e,s,w} booleans: is neighbor also wall ---- */
function drawWall(ctx, px, py, cell) {
  ctx.fillStyle = PAL.wall; ctx.fillRect(px, py, cell, cell);
  const t = Math.max(1, Math.round(cell * 0.16));
  ctx.fillStyle = PAL.wallHi; ctx.fillRect(px, py, cell, t);
  ctx.fillStyle = PAL.wallSh; ctx.fillRect(px, py + cell - t, cell, t);
}
function drawDoor(ctx, px, py, cell) {
  ctx.fillStyle = PAL.doorMat; ctx.fillRect(px, py, cell, cell);
  ctx.fillStyle = PAL.doorWood;
  const m = Math.round(cell * 0.14);
  ctx.fillRect(px + m, py + m, cell - 2 * m, cell - 2 * m);
  ctx.fillStyle = PAL.doorHi; ctx.fillRect(px + m, py + m, cell - 2 * m, Math.max(1, Math.round(cell * 0.1)));
}

/* ============================================================
   FURNITURE CATALOG. Each item:
     w,h     footprint in cells (at rot 0)
     block   true = blocks walking
     seat    true = agents can sit here (walkable, a seat anchor)
     onWall  hint: meant to sit against a wall (decor)
     cat     palette category
     draw(ctx,x0,y0,cell,P)  paints into base footprint [x0..x0+w*cell]
   ============================================================ */
function mkR(ctx, x0, y0, cell) {
  return (a, b, w, h, c) => {
    ctx.fillStyle = c;
    ctx.fillRect(Math.round(x0 + a * cell), Math.round(y0 + b * cell),
      Math.max(1, Math.round(w * cell)), Math.max(1, Math.round(h * cell)));
  };
}

const FURN = {
  desk: {
    th: "โต๊ะทำงาน", cat: "work", w: 2, h: 1, block: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.04, 0.12, 1.92, 0.82, P.deskEdge); R(0.07, 0.14, 1.86, 0.7, P.deskTop); R(0.07, 0.14, 1.86, 0.12, P.deskHi);
      R(0.66, 0.16, 0.4, 0.32, P.black); R(0.7, 0.19, 0.32, 0.24, P.screen); R(0.73, 0.21, 0.14, 0.1, P.screenHi); R(0.82, 0.48, 0.08, 0.08, P.black);
      R(0.5, 0.54, 0.52, 0.18, P.whiteSh); R(1.16, 0.56, 0.12, 0.14, P.white); }
  },
  chair: {
    th: "เก้าอี้", cat: "work", w: 1, h: 1, seat: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.2, 0.1, 0.6, 0.2, P.black); R(0.18, 0.3, 0.64, 0.5, P.steelSh); R(0.22, 0.33, 0.56, 0.42, P.steel); R(0.45, 0.78, 0.1, 0.14, P.black); }
  },
  table: {
    th: "โต๊ะประชุม", cat: "work", w: 2, h: 1, block: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.06, 0.14, 1.88, 0.74, P.deskEdge); R(0.09, 0.16, 1.82, 0.62, P.deskTop); R(0.09, 0.16, 1.82, 0.1, P.deskHi);
      R(0.78, 0.3, 0.44, 0.4, P.white); R(0.84, 0.36, 0.32, 0.06, P.steelSh); }
  },
  bookshelf: {
    th: "ชั้นหนังสือ", cat: "work", w: 2, h: 1, block: true, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.04, 0.04, 1.92, 0.92, P.deskEdge); R(0.09, 0.09, 1.82, 0.36, P.dark); R(0.09, 0.52, 1.82, 0.36, P.dark);
      const books = [P.book1, P.book2, P.book3, P.book4, P.book5, P.book2, P.book3, P.book1, P.book4, P.book5];
      for (let i = 0; i < 14; i++) { const bx = 0.12 + i * 0.13; const hh = 0.26 + ((i * 7) % 5) * 0.018;
        R(bx, 0.45 - hh, 0.1, hh, books[i % books.length]); R(bx, 0.88 - hh, 0.1, hh, books[(i + 3) % books.length]); } }
  },
  sofa: {
    th: "โซฟา", cat: "lounge", w: 2, h: 1, seat: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.06, 0.22, 1.88, 0.68, P.sofaSh); R(0.06, 0.18, 1.88, 0.26, P.sofa); R(0.06, 0.18, 0.2, 0.72, P.sofaSh); R(1.74, 0.18, 0.2, 0.72, P.sofaSh);
      R(0.3, 0.4, 0.62, 0.4, P.cushion); R(1.08, 0.4, 0.62, 0.4, P.cushion); }
  },
  armchair: {
    th: "เก้าอี้นวม", cat: "lounge", w: 1, h: 1, seat: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.12, 0.2, 0.76, 0.7, P.sofaSh); R(0.12, 0.16, 0.76, 0.26, P.sofa); R(0.12, 0.2, 0.16, 0.66, P.sofaSh); R(0.72, 0.2, 0.16, 0.66, P.sofaSh);
      R(0.3, 0.38, 0.4, 0.42, P.cushion); }
  },
  coffee: {
    th: "โต๊ะกลาง", cat: "lounge", w: 1, h: 1, block: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.16, 0.28, 0.68, 0.5, P.deskEdge); R(0.19, 0.3, 0.62, 0.4, P.deskTop); R(0.4, 0.36, 0.2, 0.12, P.whiteSh); }
  },
  rug: {
    th: "พรม", cat: "lounge", w: 2, h: 2, floorDecor: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.1, 0.1, 1.8, 1.8, P.rugA); R(0.26, 0.26, 1.48, 1.48, P.rugB); R(0.44, 0.44, 1.12, 1.12, P.rugC); R(0.62, 0.62, 0.76, 0.76, P.rugB); }
  },
  lamp: {
    th: "โคมไฟ", cat: "lounge", w: 1, h: 1, block: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.42, 0.84, 0.16, 0.08, P.black); R(0.47, 0.34, 0.06, 0.52, P.black); R(0.32, 0.16, 0.36, 0.24, P.yellow); R(0.36, 0.18, 0.28, 0.1, "#f0d480"); }
  },
  tv: {
    th: "ทีวี", cat: "lounge", w: 2, h: 1, block: true, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.1, 0.2, 1.8, 0.6, P.black); R(0.16, 0.26, 1.68, 0.46, P.screen); R(0.22, 0.3, 0.7, 0.3, P.screenHi); R(0.7, 0.8, 0.6, 0.06, P.dark); }
  },
  bed: {
    th: "เตียง", cat: "lounge", w: 2, h: 2, block: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.06, 0.06, 1.88, 1.88, P.deskEdge); R(0.12, 0.12, 1.76, 1.76, P.whiteSh); R(0.12, 0.12, 1.76, 1.76, P.white);
      R(0.2, 0.2, 1.6, 0.5, P.steelSh); R(0.24, 0.24, 1.52, 0.4, P.white); R(0.2, 1.1, 1.6, 0.78, P.blue); }
  },
  fridge: {
    th: "ตู้เย็น", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.16, 0.06, 0.68, 0.88, P.steelSh); R(0.18, 0.08, 0.64, 0.84, P.white); R(0.18, 0.46, 0.64, 0.04, P.whiteSh);
      R(0.7, 0.16, 0.07, 0.22, P.steelSh); R(0.7, 0.56, 0.07, 0.22, P.steelSh); }
  },
  counter: {
    th: "เคาน์เตอร์", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.06, 0.1, 0.88, 0.82, P.whiteSh); R(0.08, 0.12, 0.84, 0.32, P.tileA); R(0.08, 0.46, 0.84, 0.46, P.white);
      R(0.55, 0.18, 0.3, 0.18, P.steel); R(0.59, 0.21, 0.22, 0.12, P.steelSh); }
  },
  vending: {
    th: "ตู้กดน้ำ", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.14, 0.05, 0.72, 0.9, P.red); R(0.17, 0.08, 0.5, 0.66, P.dark); R(0.2, 0.11, 0.44, 0.16, P.blue); R(0.2, 0.3, 0.44, 0.16, P.green); R(0.2, 0.49, 0.44, 0.16, P.yellow);
      R(0.7, 0.1, 0.13, 0.5, P.whiteSh); R(0.18, 0.78, 0.5, 0.1, P.black); }
  },
  cooler: {
    th: "ตู้น้ำเย็น", cat: "kitchen", w: 1, h: 1, block: true, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.33, 0.06, 0.34, 0.26, P.screenHi); R(0.3, 0.08, 0.4, 0.2, "#bfe0ef"); R(0.28, 0.3, 0.44, 0.62, P.whiteSh); R(0.3, 0.32, 0.4, 0.58, P.white);
      R(0.44, 0.5, 0.12, 0.1, P.blue); }
  },
  plantS: {
    th: "ต้นไม้เล็ก", cat: "decor", w: 1, h: 1, block: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.3, 0.62, 0.4, 0.3, P.potSh); R(0.32, 0.6, 0.36, 0.24, P.pot); R(0.28, 0.32, 0.44, 0.34, P.leafDk); R(0.33, 0.28, 0.34, 0.32, P.leaf); R(0.4, 0.3, 0.18, 0.16, P.leafHi); }
  },
  plantT: {
    th: "ต้นไม้สูง", cat: "decor", w: 1, h: 1, block: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.36, 0.66, 0.28, 0.26, P.potSh); R(0.38, 0.64, 0.24, 0.22, P.pot); R(0.22, 0.08, 0.56, 0.62, P.leafDk); R(0.28, 0.05, 0.44, 0.58, P.leaf); R(0.4, 0.1, 0.22, 0.34, P.leafHi); }
  },
  painting: {
    th: "ภาพแขวน", cat: "decor", w: 1, h: 1, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.16, 0.18, 0.68, 0.54, P.frameGold); R(0.21, 0.23, 0.58, 0.44, P.paintSky); R(0.21, 0.45, 0.58, 0.22, P.paintHill); R(0.6, 0.27, 0.13, 0.13, P.paintSun); }
  },
  clock: {
    th: "นาฬิกา", cat: "decor", w: 1, h: 1, onWall: true,
    draw(c, x, y, cell, P) { const R = mkR(c, x, y, cell);
      R(0.3, 0.22, 0.4, 0.4, P.dark); R(0.34, 0.26, 0.32, 0.32, P.white); R(0.49, 0.3, 0.03, 0.16, P.black); R(0.5, 0.41, 0.13, 0.03, P.black); }
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

/* ---- footprint / rotation helpers ---- */
function effFootprint(key, rot) { const d = FURN[key]; const r = ((rot || 0) % 4 + 4) % 4; return r % 2 ? { w: d.h, h: d.w } : { w: d.w, h: d.h }; }
function objCells(obj) { const f = effFootprint(obj.key, obj.rot); const out = []; for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) out.push([obj.x + xx, obj.y + yy]); return out; }

/* draw one object (handles rotation by transforming the context) */
function drawObject(ctx, obj, cell, ox = 0, oy = 0) {
  const d = FURN[obj.key]; if (!d) return;
  const r = ((obj.rot || 0) % 4 + 4) % 4;
  const eff = effFootprint(obj.key, r);
  ctx.save();
  ctx.translate(ox + (obj.x + eff.w / 2) * cell, oy + (obj.y + eff.h / 2) * cell);
  ctx.rotate(r * Math.PI / 2);
  d.draw(ctx, -d.w * cell / 2, -d.h * cell / 2, cell, PAL);
  ctx.restore();
}

/* ---- master room renderer ---- */
function drawRoom(canvas, room, opts = {}) {
  const cell = opts.cell || 24;
  const w = room.w, h = room.h;
  canvas.width = w * cell; canvas.height = h * cell;
  const ctx = canvas.getContext("2d"); ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = PAL.void; ctx.fillRect(0, 0, canvas.width, canvas.height);
  // floors
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = room.floor[y * w + x]; if (t) drawFloor(ctx, x * cell, y * cell, cell, t, x, y);
  }
  // floor decor (rugs) under furniture
  (room.objects || []).filter(o => FURN[o.key] && FURN[o.key].floorDecor).forEach(o => drawObject(ctx, o, cell));
  // struct
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = room.struct[y * w + x];
    if (s === 1) drawWall(ctx, x * cell, y * cell, cell);
    else if (s === 2) drawDoor(ctx, x * cell, y * cell, cell);
  }
  // objects, back-to-front by y
  (room.objects || []).filter(o => FURN[o.key] && !FURN[o.key].floorDecor)
    .slice().sort((a, b) => (a.y - b.y) || (a.x - b.x))
    .forEach(o => drawObject(ctx, o, cell));
}

Object.assign(window, { PAL, FURN, FLOOR_TYPES, CATS, drawFloor, drawWall, drawDoor, drawObject, drawRoom, effFootprint, objCells });

export {
  CATS,
  FLOOR_TYPES,
  FURN,
  PAL,
  drawDoor,
  drawFloor,
  drawObject,
  drawRoom,
  drawWall,
  effFootprint,
  mkR,
  objCells
};
