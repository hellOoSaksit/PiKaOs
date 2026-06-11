/* PiKaOs — ES module (migrated from PiKaOs/room-store.jsx). */
import React from 'react';
const { useState, useEffect, useRef } = React;
import { FURN, objCells } from './room-tiles.jsx';

/* ============================================================
   ROOM STORE — room data model + localStorage autosave + the
   walkability grid & BFS pathfinding that make agents "alive".
   Room shape: { id, name, w, h, floor:Int[], struct:Int[], objects:[] }
     floor[i]  0 void · 1 wood · 2 tile · 3 carpet · 4 concrete · 5 grass
     struct[i] 0 none · 1 wall · 2 door
     objects   [{ key, x, y, rot }]
   ============================================================ */
const ROOM_W = 32, ROOM_H = 20;
const LS_KEY = "guildos.rooms.v2";
const idx = (x, y, w) => y * w + x;
let _rid = 1; const newId = () => "rm" + (_rid++) + Date.now().toString(36).slice(-3);

function blankRoom(name, fill = 1, extra = {}) {
  const w = ROOM_W, h = ROOM_H;
  const floor = new Array(w * h).fill(0), struct = new Array(w * h).fill(0);
  // a friendly starting canvas: floored interior + perimeter walls
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const edge = (x === 0 || y === 0 || x === w - 1 || y === h - 1);
    if (edge) struct[idx(x, y, w)] = 1; else floor[idx(x, y, w)] = fill;
  }
  struct[idx(Math.floor(w / 2), h - 1, w)] = 2; // a door on the south wall
  floor[idx(Math.floor(w / 2), h - 1, w)] = fill;
  return { id: newId(), name: name || "ห้องใหม่", w, h, floor, struct, objects: [], dept: extra.dept || "ทั่วไป", ceo: extra.ceo || "CEO" };
}

/* ---- the furnished demo room (showcases the system) ---- */
function demoRoom() {
  const r = blankRoom("ออฟฟิศกลาง · Hermes HQ", 1, { dept: "ศูนย์กลาง", ceo: "HERMES" });
  const w = r.w, h = r.h;
  const setF = (x, y, v) => { if (x > 0 && y > 0 && x < w - 1 && y < h - 1) r.floor[idx(x, y, w)] = v; };
  const setS = (x, y, v) => { if (x >= 0 && y >= 0 && x < w && y < h) r.struct[idx(x, y, w)] = v; };
  // zones: pantry (tile) top-right, meeting (carpet) bottom-right
  for (let y = 1; y <= 9; y++) for (let x = 18; x <= 30; x++) setF(x, y, 2);
  for (let y = 11; y <= 18; y++) for (let x = 18; x <= 30; x++) setF(x, y, 3);
  // interior walls + doors
  for (let y = 1; y <= 18; y++) setS(17, y, 1);
  setS(17, 9, 2); setS(17, 10, 2);
  for (let x = 18; x <= 30; x++) setS(x, 10, 1);
  setS(24, 10, 2); setF(24, 10, 2);
  const o = r.objects;
  const P = (key, x, y, rot = 0) => o.push({ key, x, y, rot });
  // left open office: desks + chairs
  [[2, 4], [6, 4], [2, 9], [6, 9], [2, 14], [6, 14], [11, 4], [11, 9]].forEach(([x, y]) => { P("desk", x, y); P("chair", x, y + 1); });
  P("bookshelf", 2, 1); P("bookshelf", 5, 1); P("bookshelf", 9, 1); P("bookshelf", 13, 1);
  P("plantT", 15, 2); P("plantS", 15, 17); P("plantT", 1, 17);
  // left lounge corner
  P("rug", 12, 15); P("sofa", 12, 16); P("armchair", 14, 15, 3); P("coffee", 13, 14);
  // pantry
  P("vending", 19, 1); P("counter", 21, 1); P("counter", 22, 1); P("counter", 23, 1);
  P("cooler", 26, 1); P("fridge", 28, 1); P("clock", 24, 1);
  P("table", 20, 5); P("chair", 20, 6); P("chair", 21, 6);
  P("plantS", 29, 8);
  // meeting room
  P("rug", 22, 13); P("table", 22, 14); P("armchair", 22, 13, 2); P("armchair", 23, 13, 2);
  P("armchair", 22, 16); P("armchair", 23, 16); P("bookshelf", 19, 11); P("bookshelf", 27, 11);
  P("painting", 24, 11); P("plantT", 29, 17); P("plantT", 18, 17);
  return r;
}

function loadRooms() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) { const data = JSON.parse(raw); if (Array.isArray(data.rooms) && data.rooms.length) { _rid = (data.seq || data.rooms.length) + 1; data.rooms.forEach(r => { if (!r.dept) r.dept = "ทั่วไป"; if (!r.ceo) r.ceo = "CEO"; }); return data.rooms; } }
  } catch (e) { /* ignore */ }
  return [demoRoom(), blankRoom("ห้องของฉัน")];
}
function saveRooms(rooms) { try { localStorage.setItem(LS_KEY, JSON.stringify({ rooms, seq: _rid })); } catch (e) { /* ignore */ } }

/* ---- room TEMPLATES (save a layout, spin up new rooms from it) ---- */
const TPL_KEY = "guildos.roomtpl.v1";
function _seedTemplates() {
  const open = blankRoom("ออฟฟิศเปิดโล่ง", 1, {});
  const oo = open.objects, P = (key, x, y, rot = 0) => oo.push({ key, x, y, rot });
  [[3, 4], [7, 4], [3, 9], [7, 9], [3, 14], [7, 14]].forEach(([x, y]) => { P("desk", x, y); P("chair", x, y + 1); });
  P("bookshelf", 2, 1); P("bookshelf", 6, 1); P("plantT", 11, 2); P("plantS", 11, 16);
  const meet = blankRoom("ห้องประชุม", 3, {});
  const mo = meet.objects, Q = (key, x, y, rot = 0) => mo.push({ key, x, y, rot });
  Q("rug", 13, 8); Q("table", 13, 9); Q("armchair", 13, 8, 2); Q("armchair", 14, 8, 2);
  Q("armchair", 13, 11); Q("armchair", 14, 11); Q("tv", 12, 1, 0); Q("plantT", 2, 2); Q("plantT", 28, 2);
  return [
    { id: "tpl_open", name: "ออฟฟิศเปิดโล่ง", dept: "ทั่วไป", seed: true, w: open.w, h: open.h, floor: open.floor, struct: open.struct, objects: open.objects, ts: Date.now() },
    { id: "tpl_meet", name: "ห้องประชุม", dept: "ทั่วไป", seed: true, w: meet.w, h: meet.h, floor: meet.floor, struct: meet.struct, objects: meet.objects, ts: Date.now() },
  ];
}
function loadTemplates() {
  try { const raw = localStorage.getItem(TPL_KEY); if (raw) { const a = JSON.parse(raw); if (Array.isArray(a)) return a; } } catch (e) { /* ignore */ }
  return _seedTemplates();
}
function saveTemplates(arr) { try { localStorage.setItem(TPL_KEY, JSON.stringify(arr)); } catch (e) { /* ignore */ } }
function templateFromRoom(room, name) {
  return { id: "tpl" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), name: name || room.name, dept: room.dept || "ทั่วไป",
    w: room.w, h: room.h, floor: room.floor.slice(), struct: room.struct.slice(), objects: (room.objects || []).map(o => ({ ...o })), ts: Date.now() };
}
function useTemplates() {
  const [templates, setTemplates] = useState(loadTemplates);
  const t = useRef(null);
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => saveTemplates(templates), 300); return () => clearTimeout(t.current); }, [templates]);
  const add = (tpl) => setTemplates(ts => [tpl, ...ts]);
  const remove = (id) => setTemplates(ts => ts.filter(x => x.id !== id));
  const rename = (id, name) => setTemplates(ts => ts.map(x => x.id === id ? { ...x, name } : x));
  return { templates, add, remove, rename };
}

/* ---- walkability + pathfinding ---- */
function buildGrid(room) {
  const w = room.w, h = room.h, g = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) g[i] = (room.floor[i] > 0 && room.struct[i] !== 1) ? 1 : 0;
  (room.objects || []).forEach(ob => { const d = FURN[ob.key]; if (d && d.block) objCells(ob).forEach(([x, y]) => { if (x >= 0 && y >= 0 && x < w && y < h) g[idx(x, y, w)] = 0; }); });
  return g;
}
function seatCells(room) {
  const out = [];
  (room.objects || []).forEach(ob => { const d = FURN[ob.key]; if (d && d.seat) { const [x, y] = objCells(ob)[0]; out.push({ x, y, key: ob.key }); } });
  return out;
}
function bfsPath(grid, w, h, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return [];
  const inB = (x, y) => x >= 0 && y >= 0 && x < w && y < h;
  if (!inB(tx, ty) || !grid[idx(tx, ty, w)]) return null;
  const prev = new Int32Array(w * h).fill(-1); const seen = new Uint8Array(w * h);
  const q = [sx + sy * w]; seen[idx(sx, sy, w)] = 1; let head = 0;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (head < q.length) {
    const cur = q[head++]; const cx = cur % w, cy = (cur / w) | 0;
    if (cx === tx && cy === ty) break;
    for (const [dx, dy] of D) { const nx = cx + dx, ny = cy + dy; if (!inB(nx, ny)) continue; const ni = idx(nx, ny, w); if (seen[ni] || !grid[ni]) continue; seen[ni] = 1; prev[ni] = cur; q.push(ni); }
  }
  const ti = idx(tx, ty, w); if (!seen[ti]) return null;
  const path = []; let c = ti; while (c !== idx(sx, sy, w) && c !== -1) { path.push([c % w, (c / w) | 0]); c = prev[c]; }
  return path.reverse();
}
function randomWalkable(grid, w, h) {
  const cells = []; for (let i = 0; i < w * h; i++) if (grid[i]) cells.push([i % w, (i / w) | 0]);
  return cells.length ? cells[(Math.random() * cells.length) | 0] : null;
}

/* ---- rooms hook with debounced autosave ---- */
function useRooms() {
  const [rooms, setRooms] = useState(loadRooms);
  const t = useRef(null);
  useEffect(() => { clearTimeout(t.current); t.current = setTimeout(() => saveRooms(rooms), 350); return () => clearTimeout(t.current); }, [rooms]);
  const update = (id, fn) => setRooms(rs => rs.map(r => r.id === id ? fn({ ...r }) : r));
  const create = (name, extra) => { const r = blankRoom(name, 1, extra || {}); setRooms(rs => [...rs, r]); return r.id; };
  const createFromTemplate = (name, tpl, extra) => {
    const base = blankRoom(name, 1, extra || {});
    const r = { ...base, w: tpl.w || base.w, h: tpl.h || base.h,
      floor: (tpl.floor || base.floor).slice(), struct: (tpl.struct || base.struct).slice(),
      objects: (tpl.objects || []).map(o => ({ ...o })) };
    setRooms(rs => [...rs, r]); return r.id;
  };
  const remove = (id) => setRooms(rs => rs.filter(r => r.id !== id));
  const rename = (id, name) => update(id, r => ({ ...r, name }));
  return { rooms, setRooms, update, create, createFromTemplate, remove, rename };
}

Object.assign(window, { ROOM_W, ROOM_H, idx, blankRoom, demoRoom, loadRooms, saveRooms, buildGrid, seatCells, bfsPath, randomWalkable, useRooms, loadTemplates, saveTemplates, templateFromRoom, useTemplates });

export {
  LS_KEY,
  ROOM_W,
  TPL_KEY,
  _rid,
  _seedTemplates,
  bfsPath,
  blankRoom,
  buildGrid,
  demoRoom,
  idx,
  loadRooms,
  loadTemplates,
  randomWalkable,
  saveRooms,
  saveTemplates,
  seatCells,
  templateFromRoom,
  useRooms,
  useTemplates
};
