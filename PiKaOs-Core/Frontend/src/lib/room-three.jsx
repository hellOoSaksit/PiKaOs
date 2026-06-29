/* PiKaOs — ROOM THREE: builds the real-3D room scene (Three.js) from the
   same room data model (guildos.rooms.v2 — unchanged). World units: 1 = 1
   grid tile, +x = grid x, +z = grid y, y up. Furniture REUSES the FURN
   draw3d definitions from room-tiles.jsx via a kit whose box/cyl/sph calls
   become meshes (k.c = 30 so the px-tuned heights map to tile units /30).
   2D canvas (room-tiles) still powers thumbnails + palette previews. */
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { FURN, PAL, effFootprint } from './room-tiles.jsx';

const WALL_H = 1.5, WALL_LOW = 0.3, SLAB = 0.5, KPX = 30;   // px-per-tile for draw3d height conversion

/* ---- shared caches (never disposed) ----
   Soft toy look: rounded furniture + MeshStandardMaterial (matte, slightly
   waxy). Colors are authored sRGB hex; the renderer is sRGB so they read as
   the same pastels as the 2D iso art. */
const _hsl = {};
/* candy-pop the pastel base colors so 3D shading doesn't read washed-out:
   boost saturation, nudge lightness toward a rich mid. Greys (low sat) stay
   nearly untouched, so walls/floors don't turn neon. */
function vivid(hex) {
  const c = new THREE.Color(hex); c.getHSL(_hsl);
  c.setHSL(_hsl.h, Math.min(1, _hsl.s * 1.42 + 0.04), _hsl.l * 0.93 + 0.02);
  return c;
}
const _mats = new Map();
function matFor(color, opts = {}) {
  const key = color + "|" + (opts.opacity || 1);
  if (_mats.has(key)) return _mats.get(key);
  // flatShading = the low-poly faceted look; vivid colors keep it bright + cute
  const m = new THREE.MeshStandardMaterial({ color: vivid(color), roughness: 0.74, metalness: 0.0, flatShading: true });
  if (opts.opacity && opts.opacity < 1) { m.transparent = true; m.opacity = opts.opacity; }
  _mats.set(key, m);
  return m;
}
/* low segment counts → visible facets (the low-poly aesthetic) */
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),                       // sharp — structure (tiles seamlessly)
  rbox: new RoundedBoxGeometry(1, 1, 1, 1, 0.1),             // soft-chamfered furniture cube
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),           // octagonal prism
  sph: new THREE.SphereGeometry(0.5, 9, 6),                  // faceted ball
  head: new THREE.SphereGeometry(0.5, 11, 8),               // head a touch smoother
  limb: new THREE.CapsuleGeometry(0.5, 1.0, 2, 6),           // faceted capsule (arms/legs)
  circle: new THREE.CircleGeometry(0.5, 18),
  torus: new THREE.TorusGeometry(0.37, 0.05, 6, 16, Math.PI),
  ring: new THREE.TorusGeometry(0.46, 0.055, 8, 26),         // hover/select ring
};
const SHADOW_MAT = new THREE.MeshBasicMaterial({ color: 0x2c3a5c, transparent: true, opacity: 0.12, depthWrite: false });
const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xe7b54a, transparent: true, opacity: 0.9, depthWrite: false });

/* cast/receive defaults give the soft contact-shadow look; floors only receive */
function mesh(geo, mat, cast = true, receive = true) {
  const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = receive; return m;
}

/* ---- kit with the SAME interface as the 2D iso kit (room-tiles makeKit) ---- */
function makeKit3D(group, obj, def) {
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
    c: KPX, rot: r,
    box(lx, ly, lw, ld, z0, h, color) {
      const m = map(lx, ly, lw, ld);
      const hh = Math.max(0.02, h / KPX);
      const b = mesh(GEO.rbox, matFor(color));               // soft rounded edges
      b.scale.set(Math.max(0.04, m.w), hh, Math.max(0.04, m.d));
      b.position.set(m.x + m.w / 2, z0 / KPX + hh / 2, m.y + m.d / 2);
      group.add(b);
    },
    flat(lx, ly, lw, ld, z, color) {
      const m = map(lx, ly, lw, ld);
      const b = mesh(GEO.rbox, matFor(color), false, true);  // rugs: receive shadow, don't cast
      b.scale.set(m.w, 0.04, m.d);
      b.position.set(m.x + m.w / 2, z / KPX + 0.02, m.y + m.d / 2);
      group.add(b);
    },
    cyl(lcx, lcy, rad, z0, h, color) {
      const m = map(lcx, lcy, 0, 0);
      const hh = Math.max(0.02, h / KPX);
      const c = mesh(GEO.cyl, matFor(color));
      c.scale.set(rad * 2, hh, rad * 2);
      c.position.set(m.x, z0 / KPX + hh / 2, m.y);
      group.add(c);
    },
    sph(lcx, lcy, z, rad, color) {
      const m = map(lcx, lcy, 0, 0);
      const s = mesh(GEO.sph, matFor(color));
      s.scale.setScalar(rad * 2);
      s.position.set(m.x, z / KPX, m.y);
      group.add(s);
    },
    shadow() { /* real soft shadows handle furniture grounding now — no blob */ },
  };
}

/* ---- floor platform (instanced — one mesh, per-tile color) ---- */
const FLOOR3 = {
  1: [PAL.woodA, PAL.woodB], 2: [PAL.tileA, PAL.tileB], 3: [PAL.carpetA, PAL.carpetB],
  4: [PAL.concA, PAL.concB], 5: [PAL.grassA, PAL.grassB],
};
function buildFloorGroup(room) {
  const g = new THREE.Group(); g.name = "floor";
  const w = room.w, h = room.h;
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const t = room.floor[y * w + x] || (room.struct[y * w + x] ? 4 : 0);
    if (t) cells.push([x, y, t]);
  }
  if (!cells.length) return g;
  const inst = new THREE.InstancedMesh(GEO.box, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0 }), cells.length);
  inst.receiveShadow = true; inst.castShadow = false;
  const m4 = new THREE.Matrix4();
  cells.forEach(([x, y, t], i) => {
    m4.makeScale(1, SLAB, 1).setPosition(x + 0.5, -SLAB / 2, y + 0.5);
    inst.setMatrixAt(i, m4);
    const pair = FLOOR3[t] || FLOOR3[1];
    inst.setColorAt(i, vivid(pair[(x + y) & 1]));
  });
  inst.userData.ownMat = true;
  g.add(inst);
  return g;
}

/* ---- walls + doors (dollhouse rule: no open floor S/E → knee-high).
   Interior doors are a real opening (frame + a swinging leaf) collected in
   group.userData.doors so the render loop can swing them open when an agent
   approaches (character ↔ door sync). ---- */
function buildStructGroup(room) {
  const g = new THREE.Group(); g.name = "struct";
  const doors = [];
  const w = room.w, h = room.h;
  const floorish = (x, y) => x >= 0 && y >= 0 && x < w && y < h && room.floor[y * w + x] > 0 && room.struct[y * w + x] !== 1;
  const isWall = (x, y) => x >= 0 && y >= 0 && x < w && y < h && (room.struct[y * w + x] || 0) >= 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = room.struct[y * w + x]; if (!s) continue;
    const low = !floorish(x, y + 1) && !floorish(x + 1, y);
    if (s === 1) {
      const b = mesh(GEO.box, matFor(PAL.wall));
      b.scale.set(1, low ? WALL_LOW : WALL_H, 1); b.position.set(x + 0.5, (low ? WALL_LOW : WALL_H) / 2, y + 0.5);
      g.add(b);
    } else if (low) {                                     // perimeter threshold → flat welcome mat
      const mat = mesh(GEO.box, matFor(PAL.doorMat));
      mat.scale.set(0.84, 0.03, 0.84); mat.position.set(x + 0.5, 0.02, y + 0.5); g.add(mat);
      [[0.12, 0.12], [0.88, 0.88]].forEach(([ox, oy]) => {
        const p = mesh(GEO.box, matFor(PAL.doorWood)); p.scale.set(0.18, 0.5, 0.18); p.position.set(x + ox, 0.25, y + oy); g.add(p);
      });
    } else {                                              // interior doorway: opening + swinging leaf
      const H = WALL_H, vertical = isWall(x, y - 1) || isWall(x, y + 1);
      const head = mesh(GEO.box, matFor(PAL.wall));       // header beam over the opening
      const hinge = new THREE.Group();
      const leaf = mesh(GEO.box, matFor(PAL.doorWood)); leaf.scale.set(0.92, H * 0.82, 0.08); leaf.position.set(0.46, H * 0.42, 0); hinge.add(leaf);
      const knob = mesh(GEO.sph, matFor(PAL.frameGold)); knob.scale.setScalar(0.08); knob.position.set(0.84, H * 0.42, 0.07); hinge.add(knob);
      let baseRot, openSign;
      if (vertical) {                                     // wall runs N–S, passage E–W; leaf spans Z
        head.scale.set(0.32, 0.16, 1.0); head.position.set(x + 0.5, H - 0.08, y + 0.5);
        hinge.position.set(x + 0.5, 0, y + 0.05); baseRot = -Math.PI / 2;
        openSign = floorish(x + 1, y) ? 1 : -1;           // swing into the room side
      } else {                                            // wall runs E–W, passage N–S; leaf spans X
        head.scale.set(1.0, 0.16, 0.32); head.position.set(x + 0.5, H - 0.08, y + 0.5);
        hinge.position.set(x + 0.05, 0, y + 0.5); baseRot = 0;
        openSign = floorish(x, y + 1) ? -1 : 1;
      }
      hinge.rotation.y = baseRot;
      g.add(head); g.add(hinge);
      doors.push({ hinge, baseRot, openSign, cx: x + 0.5, cy: y + 0.5, open: 0 });
    }
  }
  g.userData.doors = doors;
  return g;
}

/* ---- furniture (reuses FURN draw3d via the 3D kit) ----
   pop=true tags each piece with a staggered delay so the render loop can
   spring them in (cute "drop-in" when first entering a room). */
function buildObjectsGroup(room, pop = false) {
  const g = new THREE.Group(); g.name = "objects";
  (room.objects || []).forEach((o, i) => {
    const def = FURN[o.key]; if (!def || !def.draw3d) return;
    const og = new THREE.Group();
    const kit = makeKit3D(og, o, def);
    def.draw3d(kit);
    if (pop) { og.scale.setScalar(0.0001); og.userData.popDelay = (g.children.length) * 0.035; }
    g.add(og);
  });
  if (pop) g.userData.pop = true;
  return g;
}

/* ---- build-mode grid lines ---- */
function buildGridLines(room) {
  const pts = [];
  for (let x = 0; x <= room.w; x++) pts.push(x, 0.02, 0, x, 0.02, room.h);
  for (let y = 0; y <= room.h; y++) pts.push(0, 0.02, y, room.w, 0.02, y);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x7887aa, transparent: true, opacity: 0.3 }));
  lines.userData.ownGeo = true;
  const g = new THREE.Group(); g.name = "grid"; g.add(lines);
  return g;
}

/* ---- low-poly chibi avatar WITH arms + legs (swing in the render loop).
   userData exposes { inner, legL, legR, armL, armR, ring } so the loop can
   animate limbs per ACTS activity. Identity from the avatar-style variant. ---- */
function buildAvatar(v) {
  const root = new THREE.Group();
  const inner = new THREE.Group(); root.add(inner);
  const pants = "#4a5680", shoe = "#343a52";
  const M = (geo, color, sx, sy, sz, x, y, z, parent) => {
    const m = mesh(geo, matFor(color), true, false);   // cast only — keep the cute face bright
    m.scale.set(sx, sy, sz); m.position.set(x, y, z); (parent || inner).add(m); return m;
  };
  // grounding disc + hover/select ring
  const sh = mesh(GEO.circle, SHADOW_MAT, false, false); sh.rotation.x = -Math.PI / 2; sh.scale.setScalar(0.6); sh.position.y = 0.014; root.add(sh);
  const ring = mesh(GEO.ring, RING_MAT, false, false); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.02; ring.visible = false; root.add(ring);

  // legs — each in a group pivoting at the hip so it can swing
  const mkLeg = (side) => {
    const g = new THREE.Group(); g.position.set(0.13 * side, 0.46, 0); inner.add(g);
    M(GEO.limb, pants, 0.17, 0.23, 0.17, 0, -0.22, 0, g);            // thigh → ankle
    M(GEO.rbox, shoe, 0.21, 0.11, 0.32, 0, -0.45, 0.05, g);          // little shoe
    return g;
  };
  const legL = mkLeg(-1), legR = mkLeg(1);

  // torso + collar + tie
  M(GEO.rbox, v.shirt[0], 0.48, 0.48, 0.34, 0, 0.68, 0);
  M(GEO.cyl, v.collar, 0.32, 0.07, 0.32, 0, 0.9, 0);
  if (v.tie) M(GEO.box, v.tie, 0.08, 0.28, 0.05, 0, 0.74, 0.18);

  // arms — each pivots at the shoulder
  const mkArm = (side) => {
    const g = new THREE.Group(); g.position.set(0.29 * side, 0.86, 0); inner.add(g);
    M(GEO.limb, v.shirt[0], 0.14, 0.2, 0.14, 0, -0.18, 0, g);        // sleeve
    M(GEO.sph, v.skin, 0.17, 0.17, 0.17, 0, -0.37, 0, g);           // hand
    return g;
  };
  const armL = mkArm(-1), armR = mkArm(1);

  // head + cute face
  M(GEO.head, v.skin, 0.66, 0.66, 0.66, 0, 1.1, 0);
  M(GEO.sph, "#2e3247", 0.085, 0.11, 0.06, -0.12, 1.12, 0.3);        // eyes
  M(GEO.sph, "#2e3247", 0.085, 0.11, 0.06, 0.12, 1.12, 0.3);
  M(GEO.sph, "#f6a6a0", 0.1, 0.07, 0.04, -0.21, 1.05, 0.27);         // rosy cheeks
  M(GEO.sph, "#f6a6a0", 0.1, 0.07, 0.04, 0.21, 1.05, 0.27);
  // hair / cap (offset back so the face pokes through)
  const capStyle = v.hairStyle === 3;
  M(GEO.head, capStyle ? v.shirt[0] : v.hair, 0.72, 0.62, 0.72, 0, 1.16, -0.05);
  if (v.hairStyle === 0) M(GEO.rbox, v.hair, 0.58, 0.5, 0.2, 0, 0.9, -0.24);     // long back hair
  if (v.hairStyle === 1) M(GEO.sph, v.hair, 0.27, 0.27, 0.27, 0, 1.52, -0.04);   // top bun
  if (capStyle) M(GEO.rbox, v.shirt[1], 0.52, 0.06, 0.3, 0, 1.14, 0.32);         // cap brim
  // (no headset — clean head)

  // held book — hidden until reading/searching (toggled in the render loop)
  const book = new THREE.Group();
  M(GEO.rbox, v.shirt[1], 0.38, 0.05, 0.3, 0, 0, 0, book);                        // cover
  M(GEO.rbox, "#fbf3e0", 0.34, 0.045, 0.26, 0, 0.03, 0, book);                    // pages
  book.position.set(0, 0.66, 0.34); book.rotation.x = -0.95; book.visible = false; inner.add(book);

  root.userData = { inner, legL, legR, armL, armR, ring, book };
  return root;
}

/* ---- cleanup (shared geos/mats are cached — only dispose what's owned) ---- */
function disposeGroup(g) {
  if (!g) return;
  g.traverse(o => {
    if (o.isInstancedMesh) { o.dispose(); if (o.userData.ownMat) o.material.dispose(); }
    else if (o.userData.ownGeo) { o.geometry.dispose(); o.material.dispose(); }
  });
  if (g.parent) g.parent.remove(g);
}

export { WALL_H, SLAB, matFor, buildFloorGroup, buildStructGroup, buildObjectsGroup, buildGridLines, buildAvatar, disposeGroup };
