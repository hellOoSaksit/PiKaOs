/* PiKaOs — the Sims-style room sandbox: living agents, the canvas + build
   interactions, the build palette, and the RoomView that orchestrates them. */
import React from 'react';
const { useState, useEffect, useRef } = React;
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { bfsPath, blankRoom, buildGrid, idx, randomWalkable, seatCells } from '../../lib/room-store.jsx';
import { CATS, FLOOR_TYPES, FURN, PAL, drawItemPreview, effFootprint, objCells } from '../../lib/room-tiles.jsx';
import { buildAvatar, buildFloorGroup, buildGridLines, buildObjectsGroup, buildStructGroup, disposeGroup } from '../../lib/room-three.jsx';
import { variantOf } from '../../lib/avatar-style.js';
import { ACTS, Sound, advanceActivity, pickActivity, spawnSubs, tickSubs } from '../../lib/world-life.jsx';
import Segmented from '../../components/ui/Segmented.jsx';
import { wt } from './wt.js';
import { CharacterSprite } from './CharacterSprite.jsx';
import { RoomAside } from './room-aside.jsx';

/* ---------------- living agents (walk everywhere — no teleport) ----------------
   Behavior contract (chat decision 2026-06-13):
   - ไม่มีวาร์ป: ทุกการย้ายที่คือการเดินตามเส้นทาง BFS จริง
   - agent ที่ "ทำงาน" (status on/busy) เดินไปนั่งเก้าอี้ที่ติดโต๊ะคอมเท่านั้น
   - agent ว่างเดินเล่น/หยุดพัก/นั่งโซฟา ตามนิสัยเฉพาะตัว (hash จาก id)
   - ป้ายสถานะกับท่าทางตัวละครมาจาก ACTS ตัวเดียวกันเสมอ (เปลี่ยนพร้อมกัน) */
function _hashLife(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const _DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
function _workSeats(room) {
  const seats = seatCells(room);
  const deskCells = new Set(), tableCells = new Set();
  (room.objects || []).forEach(o => {
    if (o.key === "desk") objCells(o).forEach(([x, y]) => deskCells.add(x + "," + y));
    if (o.key === "table") objCells(o).forEach(([x, y]) => tableCells.add(x + "," + y));
  });
  // facing = direction from the chair to the adjacent desk/table it serves
  const dirTo = (s, set) => { for (const [dx, dy] of _DIRS) if (set.has((s.x + dx) + "," + (s.y + dy))) return { dx, dy }; return null; };
  const chairs = seats.filter(s => s.key === "chair");
  const withDesk = chairs.map(s => ({ ...s, dir: dirTo(s, deskCells) })).filter(s => s.dir);
  if (withDesk.length) return withDesk;
  const withTable = chairs.map(s => ({ ...s, dir: dirTo(s, tableCells) })).filter(s => s.dir);
  return withTable.length ? withTable : chairs.map(s => ({ ...s, dir: null }));
}
function _loungeSeats(room) { return seatCells(room).filter(s => s.key === "sofa" || s.key === "armchair").map(s => ({ ...s, dir: null })); }
/* kitchen stations: a walkable stand cell facing a fridge/cooler (→ "fridge") or counter (→ "cooking") */
function _kitchenSpots(room) {
  const w = room.w, h = room.h;
  const occ = new Set();                                  // cells filled by blocking furniture (can't stand there)
  (room.objects || []).forEach(o => { const d = FURN[o.key]; if (d && d.block) objCells(o).forEach(([x, y]) => occ.add(x + "," + y)); });
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && room.floor[y * w + x] > 0 && room.struct[y * w + x] !== 1 && !occ.has(x + "," + y);
  const spots = [];
  (room.objects || []).forEach(o => {
    const station = (o.key === "fridge" || o.key === "cooler") ? "fridge" : (o.key === "counter" ? "cooking" : null);
    if (!station) return;
    for (const [ox, oy] of objCells(o)) {
      const hit = _DIRS.map(([dx, dy]) => ({ x: ox + dx, y: oy + dy, dir: { dx: -dx, dy: -dy } })).find(s => open(s.x, s.y));
      if (hit) { spots.push({ x: hit.x, y: hit.y, dir: hit.dir, station }); break; }
    }
  });
  return spots;
}

function useLivingAgents(room, active, chars) {
  const stateRef = useRef({ agents: [], claimed: new Set() });
  const roomRef = useRef(room); roomRef.current = room;
  const charsRef = useRef(chars); charsRef.current = chars;
  const [, force] = React.useReducer(x => x + 1, 0);
  const sig = chars.map(c => c.id).join(",");
  useEffect(() => {
    const g = buildGrid(room);
    stateRef.current.claimed = new Set();
    stateRef.current.agents = chars.map(c => {
      const s = randomWalkable(g, room.w, room.h) || [1, 1];
      const ph = _hashLife(c.id);
      return {
        id: c.id, char: c, cx: s[0], cy: s[1], path: [], face: 0,
        seat: null, station: null, target: null, sitUntil: 0, pauseUntil: 0, stationUntil: 0, breakUntil: 0, faceAngle: null,
        activity: "idle", actUntil: 0, bubble: null, subs: [],
        p: {                                              // นิสัยเฉพาะตัว
          workSpan: 10000 + (ph % 5) * 3000,              // นั่งทำงานต่อรอบ 10–22s
          stretch: 0.25 + ((ph >>> 3) % 4) * 0.1,         // โอกาสลุกยืดเส้นเมื่อครบรอบ
          wanderlust: 0.3 + ((ph >>> 6) % 4) * 0.15,      // ตอนว่าง ชอบเดินแค่ไหน
          loungey: ((ph >>> 9) % 3) === 0,                // ชอบนั่งโซฟา
        },
      };
    });
    force();
  }, [room.id, sig]);
  useEffect(() => {
    if (!active) return;
    const iv = setInterval(() => {
      const rm = roomRef.current, w = rm.w, h = rm.h;
      const g = buildGrid(rm); const st = stateRef.current; const now = Date.now();
      const works = _workSeats(rm), lounges = _loungeSeats(rm), kitchen = _kitchenSpots(rm);
      const freeOf = (list) => list.filter(s => !st.claimed.has(s.x + "," + s.y) && g[idx(s.x, s.y, w)]);
      const release = (a) => { if (a.seat) { st.claimed.delete(a.seat.x + "," + a.seat.y); a.seat = null; } a.subs = []; a.bubble = null; };
      const goTo = (a, x, y) => {
        if (x === a.cx && y === a.cy) { a.path = [[x, y]]; return true; }   // อยู่บนเป้าแล้ว — ให้ arrival logic ทำงานติ๊กหน้า
        const p = bfsPath(g, w, h, a.cx, a.cy, x, y);
        if (p && p.length) { a.path = p; return true; }
        return false;
      };
      st.agents.forEach(a => {
        const live = charsRef.current.find(c => c.id === a.id) || a.char;
        const working = live.status === "on" || live.status === "busy";
        // ----- walking: follow the path one cell per tick -----
        if (a.path.length) {
          const [nx, ny] = a.path.shift();
          if (nx < a.cx) a.face = 1; else if (nx > a.cx) a.face = 0;
          a.cx = nx; a.cy = ny; a.activity = "walking"; a.bubble = null;
          // arrived at the claimed target → sit / take up station, facing it
          if (!a.path.length && a.target && a.cx === a.target.x && a.cy === a.target.y) {
            const tg = a.target; a.target = null;
            if (tg.dir) a.faceAngle = Math.atan2(tg.dir.dx, tg.dir.dy);   // face the desk / appliance
            if (tg.station) {                             // ครัว → ทำอาหาร / เปิดตู้เย็น (ยืน)
              a.station = tg; a.activity = tg.station; a.stationUntil = now + 5000 + Math.random() * 5000; a.bubble = null;
            } else if (tg.work) {                         // โต๊ะคอม → เริ่มทำงาน
              a.seat = tg; a.sitUntil = now + a.p.workSpan;
              a.activity = pickActivity(a.char); a.actUntil = now + 1800 + Math.random() * 2400;
              if (["running", "searching", "thinking"].includes(a.activity) && Math.random() < 0.6) spawnSubs(a, now);
            } else {                                      // โซฟา → พัก
              a.seat = tg; a.sitUntil = now + 7000 + Math.random() * 9000;
              a.activity = "idle"; a.actUntil = a.sitUntil;
            }
          }
          return;
        }
        // ----- at a standing station (kitchen) -----
        if (a.station) {
          if (now >= a.stationUntil) { st.claimed.delete(a.station.x + "," + a.station.y); a.station = null; a.activity = "idle"; a.pauseUntil = now + 700; }
          return;
        }
        // ----- seated -----
        if (a.seat) {
          const wantsUp = a.seat.work ? !working : working;   // สถานะเปลี่ยน → ลุกทันที
          if (wantsUp || now >= a.sitUntil) {
            if (!wantsUp && a.seat.work && Math.random() < 0.4) {
              a.sitUntil = now + a.p.workSpan * 0.7;       // ติดลมงาน → นั่งต่ออีกรอบ (บ้าง)
              return;
            }
            const wasWork = a.seat.work;
            release(a);
            if (wasWork && Math.random() < 0.7) {          // พักเบรก → มุ่งตรงเข้าครัว (ทำอาหาร/เปิดตู้เย็น)
              a.breakUntil = now + 10000 + Math.random() * 8000;
              const free = freeOf(kitchen);
              if (free.length) {
                const s = free[(Math.random() * free.length) | 0];
                if (goTo(a, s.x, s.y)) { st.claimed.add(s.x + "," + s.y); a.target = { ...s }; return; }
              }
            }
            const goal = randomWalkable(g, w, h);
            if (goal) goTo(a, goal[0], goal[1]); else a.pauseUntil = now + 1500;
            return;
          }
          if (a.seat.work) { if (now >= a.actUntil) advanceActivity(a, now); tickSubs(a, now); }
          return;
        }
        // ----- standing -----
        if (a.target) {                                   // เดินไม่ถึงเป้า → ปล่อยที่จอง
          st.claimed.delete(a.target.x + "," + a.target.y); a.target = null;
        }
        if (now < a.pauseUntil) return;
        if (working && now >= a.breakUntil) {             // มีงาน + ไม่ได้พัก → หาโต๊ะคอมว่างที่ใกล้สุด
          const free = freeOf(works);
          if (free.length) {
            free.sort((s1, s2) => (Math.abs(s1.x - a.cx) + Math.abs(s1.y - a.cy)) - (Math.abs(s2.x - a.cx) + Math.abs(s2.y - a.cy)));
            const s = free[0];
            if (goTo(a, s.x, s.y)) { st.claimed.add(s.x + "," + s.y); a.target = { ...s, work: true }; return; }
          }
          a.activity = "idle"; a.pauseUntil = now + 2500 + Math.random() * 2500;  // โต๊ะเต็ม → ยืนรอ
          return;
        }
        // ว่าง/พักเบรก: เข้าครัว / นั่งโซฟา / เดินเล่น / ยืนพัก — ตามนิสัย
        const r = Math.random();
        const onBreak = working && now < a.breakUntil;    // คนทำงานที่กำลังพัก → มุ่งเข้าครัวเป็นหลัก
        if (kitchen.length && (onBreak ? r < 0.7 : r < 0.12)) {  // ไปทำอาหาร / เปิดตู้เย็น
          const free = freeOf(kitchen);
          if (free.length) {
            const s = free[(Math.random() * free.length) | 0];
            if (goTo(a, s.x, s.y)) { st.claimed.add(s.x + "," + s.y); a.target = { ...s }; return; }
          }
        }
        if (a.p.loungey && r < 0.32) {
          const free = freeOf(lounges);
          if (free.length) {
            const s = free[(Math.random() * free.length) | 0];
            if (goTo(a, s.x, s.y)) { st.claimed.add(s.x + "," + s.y); a.target = { ...s, work: false }; return; }
          }
        }
        if (r < a.p.wanderlust) {
          const goal = randomWalkable(g, w, h);
          if (goal && goTo(a, goal[0], goal[1])) return;
        }
        a.activity = "idle"; a.pauseUntil = now + 1800 + Math.random() * 3600;
      });
      force();
    }, 520);
    return () => clearInterval(iv);
  }, [active]);
  return stateRef.current.agents;
}

/* ---------------- the 3D room (Three.js) + build interactions ----------------
   Real-3D scene: orthographic camera + OrbitControls (view mode: drag = pan,
   right-drag = orbit, wheel = zoom; build mode: left = paint, right = pan).
   Status chips/bubbles stay DOM — anchored to agents by projecting their 3D
   position every frame. Activity poses are animated in the render loop from
   the SAME ACTS entry that renders the chip text. */
const ZOOM_LS = "guildos.world.zoom3d.v1";
const WALK_SPEED = 2.1;                                   // tiles/sec (sim ticks 1 tile / 520ms)
const easeOutBack = (x) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
function RoomCanvas({ room, build, tool, setTool, apply, chars, onAgent, viewH }) {
  const mountRef = useRef(null);
  const T = useRef(null);                                 // three context (renderer/scene/camera/…)
  const nodeRefs = useRef(new Map());
  const hoveredRef = useRef(null);                        // agent id under the cursor (drives 3D hover fx)
  const poppedRef = useRef(new Set());                    // room ids that already played their drop-in
  const agents = useLivingAgents(room, !build, chars);
  const agentsRef = useRef(agents); agentsRef.current = agents;
  const buildRef = useRef(build); buildRef.current = build;
  const toolRef = useRef(tool); toolRef.current = tool;
  const applyRef = useRef(apply); applyRef.current = apply;
  const roomRef = useRef(room); roomRef.current = room;
  const [zoomPct, setZoomPct] = useState(100);
  const zoomPctRef = useRef(100);

  /* ----- mount the renderer once ----- */
  useEffect(() => {
    const mount = mountRef.current; if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;                    // soft, feathered shadows
    // NO tone mapping — keep the candy-pop colors at full saturation (Neutral/ACES read washed-out)
    mount.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0xd7e4f4, 52, 104);                        // very subtle far-edge haze only
    // bright key for form + modest fill so colors stay vivid (too much fill = flat/pale)
    scene.add(new THREE.HemisphereLight(0xf0f5ff, 0xf6ead6, 0.55));
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));
    const sun = new THREE.DirectionalLight(0xfff3df, 1.5);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05; sun.shadow.radius = 4;
    scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0xcfe0ff, 0.32); fill.position.set(12, 9, -7); scene.add(fill);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 400);
    try { camera.zoom = Math.min(3.2, Math.max(0.45, parseFloat(localStorage.getItem(ZOOM_LS)) || 1)); } catch (e) { camera.zoom = 1; }
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.12;
    controls.minZoom = 0.45; controls.maxZoom = 3.2;
    controls.minPolarAngle = 0.45; controls.maxPolarAngle = 1.25;        // keep the dollhouse open side facing us
    controls.minAzimuthAngle = Math.PI / 4 - 0.85; controls.maxAzimuthAngle = Math.PI / 4 + 0.85;
    controls.addEventListener("end", () => { try { localStorage.setItem(ZOOM_LS, String(camera.zoom)); } catch (e) { } });

    // build-mode hover/ghost: soft rounded tinted pads
    const mkPlane = (op) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(0.94, 0.94), new THREE.MeshBasicMaterial({ color: 0xe7b54a, transparent: true, opacity: op, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.ownGeo = true; scene.add(m); return m; };
    const hover = mkPlane(0.34); hover.position.y = 0.035;
    const ghost = mkPlane(0.22); ghost.position.y = 0.04;

    const ctx = {
      renderer, scene, camera, controls, hover, ghost, sun,
      groups: {}, avatars: new Map(), zoomEase: null,
      ray: new THREE.Raycaster(), planeY: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      v3: new THREE.Vector3(), tgt: new THREE.Vector3(),
    };
    T.current = ctx;

    const resize = () => {
      const wpx = mount.clientWidth, hpx = mount.clientHeight; if (!wpx || !hpx) return;
      renderer.setSize(wpx, hpx);
      const half = 8.5, aspect = wpx / hpx;
      camera.left = -half * aspect; camera.right = half * aspect; camera.top = half; camera.bottom = -half;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(mount);

    /* pointer → grid cell via raycast onto the floor plane */
    const cellAt = (e) => {
      const r = renderer.domElement.getBoundingClientRect();
      ctx.ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
      const pt = new THREE.Vector3();
      if (!ctx.ray.ray.intersectPlane(ctx.planeY, pt)) return null;
      const rm = roomRef.current;
      const x = Math.floor(pt.x), y = Math.floor(pt.z);
      if (x < 0 || y < 0 || x >= rm.w || y >= rm.h) return null;
      return { x, y };
    };
    let painting = false, last = null;
    const dn = (e) => {
      if (!buildRef.current || e.button !== 0) return;
      const c = cellAt(e); if (!c) return;
      painting = true; last = c.x + "," + c.y;
      applyRef.current(c.x, c.y, true);
    };
    const mv = (e) => {
      if (!buildRef.current) return;
      const c = cellAt(e);
      if (c) {
        const tl = toolRef.current;
        if (tl.type === "object" && tl.key) {
          const f = effFootprint(tl.key, tl.rot);
          ghost.scale.set(f.w, f.h, 1); ghost.position.set(c.x + f.w / 2, 0.04, c.y + f.h / 2);
          ghost.visible = true; hover.visible = false;
        } else {
          hover.position.set(c.x + 0.5, 0.035, c.y + 0.5);
          hover.visible = true; ghost.visible = false;
        }
      } else { hover.visible = false; ghost.visible = false; }
      if (!painting || !c) return;
      const k = c.x + "," + c.y; if (k === last) return; last = k;
      if (toolRef.current.type !== "object") applyRef.current(c.x, c.y, false);
    };
    const upH = () => { painting = false; last = null; };
    const lv = () => { upH(); hover.visible = false; ghost.visible = false; };
    const el = renderer.domElement;
    el.addEventListener("pointerdown", dn); el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", upH); el.addEventListener("pointerleave", lv);

    /* ----- agent meshes: walk-lerp + activity pose (linked to ACTS) ----- */
    const stepAgents = (t, dt) => {
      const seen = new Set();
      const place = (key, seedKey, gx, gy, scale, activity, headingTo, seated, faceAngle, stationary) => {
        seen.add(key);
        let av = ctx.avatars.get(key);
        if (!av) {
          av = { root: buildAvatar(variantOf(seedKey)), pos: new THREE.Vector3(gx, 0, gy), rotY: Math.PI / 4, phase: (key.length * 1.7) % 6.28, baseScale: scale, curScale: scale };
          av.root.scale.setScalar(scale);
          ctx.scene.add(av.root); ctx.avatars.set(key, av);
        }
        const tgt = ctx.tgt.set(gx, 0, gy);
        const d = av.pos.distanceTo(tgt);
        if (d > 0.004) {
          av.pos.lerp(tgt, Math.min(1, (dt * WALK_SPEED) / d));
          if (headingTo) {
            const want = Math.atan2(tgt.x - av.pos.x, tgt.z - av.pos.z);
            let dr = want - av.rotY; while (dr > Math.PI) dr -= 2 * Math.PI; while (dr < -Math.PI) dr += 2 * Math.PI;
            av.rotY += dr * Math.min(1, dt * 9);
          }
        }
        // seated/stationed → turn to face the desk / appliance (not movement heading)
        if (stationary && faceAngle != null) {
          let dr = faceAngle - av.rotY; while (dr > Math.PI) dr -= 2 * Math.PI; while (dr < -Math.PI) dr += 2 * Math.PI;
          av.rotY += dr * Math.min(1, dt * 8);
        }
        av.root.position.copy(av.pos);
        av.root.rotation.y = av.rotY;
        // pose จาก activity เดียวกับป้ายสถานะ (ACTS) — body bob + limb swing
        const ud = av.root.userData, inner = ud.inner, p = t * 1 + av.phase;
        let yOff = 0, rotZ = 0, xOff = 0;
        let lLeg = 0, rLeg = 0, lArm = 0, rArm = 0;       // limb target rotations (x)
        switch (activity) {
          case "walking": { const s = Math.sin(p * 8) * 0.5; yOff = Math.abs(Math.sin(p * 8)) * 0.06; lLeg = s; rLeg = -s; lArm = -s * 0.8; rArm = s * 0.8; break; }
          case "running": { const s = Math.sin(p * 15) * 0.7; yOff = Math.abs(Math.sin(p * 15)) * 0.09; lLeg = s; rLeg = -s; lArm = -s; rArm = s; break; }
          case "writing": yOff = (Math.sin(p * 15) > 0 ? 0.02 : 0); lArm = -0.5 + Math.sin(p * 15) * 0.06; rArm = -0.5 - Math.sin(p * 15) * 0.06; break; // typing
          case "reading": case "searching": rotZ = Math.sin(p * 2.2) * 0.05; lArm = -0.95; rArm = -0.95; break;          // hold the book up to read
          case "thinking": yOff = Math.sin(p * 2.4) * 0.04 + 0.02; rArm = -1.25; break;                                   // hand to chin
          case "cooking": yOff = Math.sin(p * 3) * 0.02; lArm = -0.7; rArm = -1.0 + Math.sin(p * 7) * 0.35; break;        // stir at the counter
          case "fridge": lArm = -1.15; rArm = -1.15; yOff = 0.0; rotZ = Math.sin(p * 1.5) * 0.03; break;                  // reach into the fridge
          case "drinking": rArm = -1.9 + Math.sin(p * 2) * 0.1; lArm = 0.05; break;                                       // sip
          case "waiting": case "permission": rotZ = Math.sin(p * 3.4) * 0.05; lArm = Math.sin(p * 3) * 0.12; rArm = -Math.sin(p * 3) * 0.12; break;
          case "done": { const c = Math.sin(p * 8) * 0.4; yOff = Math.abs(Math.sin(p * 8)) * 0.12; lArm = -2.2 + c; rArm = -2.2 - c; break; } // cheer, arms up
          default: yOff = Math.sin(p * 1.7) * 0.02; lArm = Math.sin(p * 1.6) * 0.05; rArm = -Math.sin(p * 1.6) * 0.05;     // idle sway
        }
        if (seated) { lLeg = 1.3; rLeg = 1.3; yOff -= 0.02; }   // sit on the chair: thighs forward
        // book appears only when reading/searching, with a gentle page sway
        if (ud.book) { const reading = activity === "reading" || activity === "searching"; ud.book.visible = reading; if (reading) ud.book.rotation.z = Math.sin(p * 3) * 0.07; }
        const le = Math.min(1, dt * 14);                  // ease limbs toward targets
        ud.legL.rotation.x += (lLeg - ud.legL.rotation.x) * le;
        ud.legR.rotation.x += (rLeg - ud.legR.rotation.x) * le;
        ud.armL.rotation.x += (lArm - ud.armL.rotation.x) * le;
        ud.armR.rotation.x += (rArm - ud.armR.rotation.x) * le;
        // playful hover: spring up in scale + a hop, glowing ring pulses
        const isHover = hoveredRef.current === key;
        const wantScale = av.baseScale * (isHover ? 1.13 : 1);
        av.curScale += (wantScale - av.curScale) * Math.min(1, dt * 13);
        av.root.scale.setScalar(av.curScale);
        if (isHover) yOff += Math.abs(Math.sin(t * 7)) * 0.06;
        const ring = av.root.userData.ring;
        if (ring) {
          ring.visible = isHover;
          if (isHover) { const rs = 1 + Math.sin(t * 6) * 0.07; ring.scale.set(rs, rs, rs); ring.material.opacity = 0.55 + Math.sin(t * 6) * 0.25; }
        }
        inner.position.set(xOff, yOff, 0); inner.rotation.z = rotZ;
        return av;
      };
      agentsRef.current.forEach(a => {
        const stationary = !!(a.seat || a.station);
        place(a.id, a.char.id || "ceo", a.cx + 0.5, a.cy + 0.5, 1, a.activity, true, !!a.seat, a.faceAngle, stationary);
        (a.subs || []).forEach(s => place(String(s.id), a.char.id + s.id, a.cx + 0.5 + s.dx, a.cy + 0.5 + s.dy, 0.55, s.act, false, false, null, false));
      });
      [...ctx.avatars.keys()].forEach(k => {
        if (!seen.has(k)) { const av = ctx.avatars.get(k); ctx.scene.remove(av.root); ctx.avatars.delete(k); }
      });
    };
    /* DOM chips follow their agents (projected each frame — no React churn) */
    const placeOverlays = () => {
      const wpx = mount.clientWidth, hpx = mount.clientHeight;
      agentsRef.current.forEach(a => {
        const elN = nodeRefs.current.get(a.id); const av = ctx.avatars.get(a.id);
        if (!elN || !av) return;
        const v = ctx.v3.set(av.pos.x, 1.55, av.pos.z).project(camera);   // anchor above the head
        elN.style.transform = `translate(${(v.x * 0.5 + 0.5) * wpx}px, ${(-v.y * 0.5 + 0.5) * hpx}px)`;
      });
    };

    let raf, lastT = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const t = clock.getElapsedTime(), dt = Math.min(0.1, t - lastT); lastT = t;
      // gentle zoom-in intro when entering a room
      if (ctx.zoomEase) {
        if (ctx.zoomEase.t0 == null) ctx.zoomEase.t0 = t;
        const k = Math.min(1, (t - ctx.zoomEase.t0) / 0.6), e = 1 - Math.pow(1 - k, 3);
        camera.zoom = ctx.zoomEase.from + (ctx.zoomEase.to - ctx.zoomEase.from) * e;
        camera.updateProjectionMatrix();
        if (k >= 1) ctx.zoomEase = null;
      }
      // staggered spring drop-in for furniture (first entry of a room)
      const og = ctx.groups.objects;
      if (og && og.userData.pop) {
        if (og.userData.t0 == null) og.userData.t0 = t;
        let done = true;
        og.children.forEach(ch => {
          const age = t - og.userData.t0 - (ch.userData.popDelay || 0);
          if (age <= 0) { ch.scale.setScalar(0.0001); done = false; }
          else if (age < 0.5) { ch.scale.setScalar(Math.max(0.0001, easeOutBack(age / 0.5))); done = false; }
          else ch.scale.setScalar(1);
        });
        if (done) og.userData.pop = false;
      }
      controls.update();
      stepAgents(t, dt);
      // doors ↔ characters: swing open when any avatar is close to the doorway
      const doors = ctx.groups.struct && ctx.groups.struct.userData.doors;
      if (doors && doors.length) doors.forEach(dr => {
        let near = false;
        for (const av of ctx.avatars.values()) { const dx = av.pos.x - dr.cx, dz = av.pos.z - dr.cy; if (dx * dx + dz * dz < 1.7) { near = true; break; } }
        dr.open += ((near ? 1 : 0) - dr.open) * Math.min(1, dt * 7);
        dr.hinge.rotation.y = dr.baseRot + dr.openSign * dr.open * 1.5;
      });
      placeOverlays();
      const zp = Math.round(camera.zoom * 100);
      if (zp !== zoomPctRef.current) { zoomPctRef.current = zp; setZoomPct(zp); }
      renderer.render(scene, camera);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      el.removeEventListener("pointerdown", dn); el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", upH); el.removeEventListener("pointerleave", lv);
      controls.dispose();
      Object.values(ctx.groups).forEach(disposeGroup);
      ctx.avatars.forEach(av => { scene.remove(av.root); });
      disposeGroup(hover); disposeGroup(ghost);
      renderer.dispose();
      if (renderer.domElement.parentNode === mount) mount.removeChild(renderer.domElement);
      T.current = null;
    };
  }, []);

  /* ----- camera frames the room + sun/shadow fit + zoom-in intro ----- */
  useEffect(() => {
    const ctx = T.current; if (!ctx) return;
    const cx = room.w / 2, cz = room.h / 2, span = Math.max(room.w, room.h);
    ctx.controls.target.set(cx, 0.4, cz);
    ctx.camera.position.set(cx + 16, 17, cz + 16);
    ctx.controls.update();
    // sun high above the back-left → short, soft shadows toward the open side
    ctx.sun.position.set(cx - span * 0.3, span * 0.95 + 8, cz - span * 0.12);
    ctx.sun.target.position.set(cx, 0, cz); ctx.sun.target.updateMatrixWorld();
    const sc = ctx.sun.shadow.camera, half = span * 0.72 + 4;
    sc.left = -half; sc.right = half; sc.top = half; sc.bottom = -half;
    sc.near = 1; sc.far = span * 2 + 60; sc.updateProjectionMatrix();
    // gentle zoom-in settle
    const target = ctx.camera.zoom;
    ctx.zoomEase = { from: target * 0.72, to: target, t0: null };
    ctx.camera.zoom = target * 0.72; ctx.camera.updateProjectionMatrix();
  }, [room.id]);

  /* ----- rebuild scene layers only when their slice of room data changes ----- */
  const rebuild = (key, builder) => {
    const ctx = T.current; if (!ctx) return;
    disposeGroup(ctx.groups[key]);
    const g = builder(); ctx.groups[key] = g; ctx.scene.add(g);
  };
  useEffect(() => { rebuild("floor", () => buildFloorGroup(room)); }, [room.id, room.floor, room.struct]);
  useEffect(() => { rebuild("struct", () => buildStructGroup(room)); }, [room.id, room.struct, room.floor]);
  useEffect(() => {
    const first = !poppedRef.current.has(room.id); poppedRef.current.add(room.id);
    rebuild("objects", () => buildObjectsGroup(room, first));    // drop-in only on first entry
  }, [room.id, room.objects]);
  useEffect(() => {
    const ctx = T.current; if (!ctx) return;
    disposeGroup(ctx.groups.grid); ctx.groups.grid = null;
    if (build) { ctx.groups.grid = buildGridLines(room); ctx.scene.add(ctx.groups.grid); }
    else { ctx.hover.visible = false; ctx.ghost.visible = false; }
  }, [build, room.id, room.w, room.h]);
  /* build mode: left = paint (orbit off) · view mode: left = pan, right = orbit */
  useEffect(() => {
    const ctx = T.current; if (!ctx) return;
    ctx.controls.mouseButtons = build
      ? { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN }
      : { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
    ctx.renderer.domElement.style.cursor = build ? "crosshair" : "grab";
  }, [build]);

  const zoomBy = (f) => {
    const ctx = T.current; if (!ctx) return;
    const z = Math.min(3.2, Math.max(0.45, ctx.camera.zoom * f));
    ctx.camera.zoom = z; ctx.camera.updateProjectionMatrix();
    try { localStorage.setItem(ZOOM_LS, String(z)); } catch (e) { }
  };

  return (
    <div className="room-stage" style={{ height: viewH ? viewH + "px" : undefined }}>
      <div className={`room-viewport room-3d ${build ? "is-build" : "is-pan"}`} ref={mountRef} />
      <div className="rc-agents3d">
        {agents.map(a => {
          const act = ACTS[a.activity] || null;
          const busy = !!(a.seat || a.station);            // seated OR at a kitchen station → show the activity chip
          return (
            <div key={a.id} className="rc-a3" ref={el => { if (el) nodeRefs.current.set(a.id, el); else nodeRefs.current.delete(a.id); }}>
              <button className="rc-a3-inner" title={`${a.char.name}${act ? " · " + act.th : ""}`}
                onMouseEnter={() => { hoveredRef.current = a.id; }}
                onMouseLeave={() => { if (hoveredRef.current === a.id) hoveredRef.current = null; }}
                onClick={(e) => { e.stopPropagation(); onAgent && onAgent(a.char); }}>
                {/* ป้ายสถานะ + ท่าทางตัวละครมาจาก ACTS entry เดียวกัน — เปลี่ยนพร้อมกันเสมอ */}
                {a.bubble
                  ? <span className={`rc-bubble ${a.bubble.kind}`}>{act ? act.icon : ""} {a.bubble.text}</span>
                  : (busy && act ? <span className="rc-actchip">{act.icon} <b>{act.th}</b></span> : null)}
                <span className="rc-agent-status" data-s={a.char.status} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="rv-zoom">
        <button onClick={() => zoomBy(0.85)} title="ซูมออก">−</button>
        <span className="mono">{zoomPct}%</span>
        <button onClick={() => zoomBy(1.18)} title="ซูมเข้า">＋</button>
      </div>
    </div>
  );
}

/* ---------------- build palette ---------------- */
function ItemPreview({ kind }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) drawItemPreview(ref.current, kind, 12); }, [kind]);
  return <canvas ref={ref} className="item-prev" />;
}
function BuildPalette({ tool, setTool, canPlace = true, canMove = true }) {
  const [cat, setCat] = useState("floor");
  const items = Object.keys(FURN).filter(k => FURN[k].cat === cat);
  const pick = (t) => {
    if ((t.type === "floor" || t.type === "struct" || t.type === "object") && !canPlace) return;
    if (t.type === "erase" && !canMove) return;
    setTool(prev => ({ ...prev, ...t }));
  };
  return (
    <div className="build-palette panel">
      <div className="bp-cats">
        {CATS.map(c => <button key={c.key} className={`bp-cat ${cat === c.key ? "on" : ""}`} onClick={() => setCat(c.key)}>{wt("cat." + c.key)}</button>)}
      </div>
      {(!canPlace || !canMove) && (
        <div className="bp-lock mono">🔒 {!canPlace && wt("world.lockPlace")}{!canPlace && !canMove && " · "}{!canMove && wt("world.lockMove")}</div>
      )}
      <div className="bp-body">
        {cat === "floor" && (
          <div className="bp-grid">
            {FLOOR_TYPES.map(f => (
              <button key={f.v} disabled={!canPlace} className={`bp-item ${tool.type === "floor" && tool.floor === f.v ? "on" : ""}`} onClick={() => pick({ type: "floor", floor: f.v })}>
                <span className="bp-swatch" style={{ background: f.swatch }} /><span className="bp-label">{wt("floor." + f.v)}</span>
              </button>
            ))}
            <button disabled={!canPlace} className={`bp-item ${tool.type === "floor" && tool.floor === 0 ? "on" : ""}`} onClick={() => pick({ type: "floor", floor: 0 })}>
              <span className="bp-swatch" style={{ background: PAL.void, border: "1px dashed var(--ink-4)" }} /><span className="bp-label">{wt("world.eraseFloor")}</span>
            </button>
          </div>
        )}
        {cat === "struct" && (
          <div className="bp-grid">
            <button disabled={!canPlace} className={`bp-item ${tool.type === "struct" && tool.struct === 1 ? "on" : ""}`} onClick={() => pick({ type: "struct", struct: 1 })}><span className="bp-swatch" style={{ background: PAL.wall }} /><span className="bp-label">{wt("world.wall")}</span></button>
            <button disabled={!canPlace} className={`bp-item ${tool.type === "struct" && tool.struct === 2 ? "on" : ""}`} onClick={() => pick({ type: "struct", struct: 2 })}><span className="bp-swatch" style={{ background: PAL.doorMat }} /><span className="bp-label">{wt("world.door")}</span></button>
            <button disabled={!canPlace} className={`bp-item ${tool.type === "struct" && tool.struct === 0 ? "on" : ""}`} onClick={() => pick({ type: "struct", struct: 0 })}><span className="bp-swatch" style={{ background: "transparent", border: "1px dashed var(--ink-4)" }} /><span className="bp-label">{wt("world.removeWall")}</span></button>
          </div>
        )}
        {!["floor", "struct"].includes(cat) && (
          <div className="bp-grid">
            {items.map(k => (
              <button key={k} disabled={!canPlace} className={`bp-item ${tool.type === "object" && tool.key === k ? "on" : ""}`} onClick={() => pick({ type: "object", key: k })}>
                <span className="bp-prevwrap"><ItemPreview kind={k} /></span><span className="bp-label">{wt("furn." + k)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="bp-tools">
        <button className={`bp-tool ${tool.type === "erase" ? "on" : ""}`} disabled={!canMove} onClick={() => pick({ type: "erase" })}>{wt("world.toolErase")}</button>
        <button className="bp-tool" onClick={() => setTool(p => ({ ...p, rot: ((p.rot || 0) + 1) % 4 }))} disabled={tool.type !== "object" || !canPlace}>{wt("world.toolRotate")}</button>
      </div>
    </div>
  );
}

/* ---------------- status cards (map-off view mode) ---------------- */
function RoomStatusCards({ chars, onAgent }) {
  return (
    <div className="rv-cards fade-in">
      {chars.map(c => {
        const s = ["on", "busy", "idle"].includes(c.status) ? c.status : "idle";
        return (
          <button key={c.id} className="rvc-card" onClick={() => onAgent && onAgent(c)}>
            <span className="rvc-portrait"><CharacterSprite charId={c.characterId} seed={c.id} walking={false} h={56} style={{ position: "static" }} /></span>
            <span className="rvc-name">{c.name}</span>
            <span className={`badge ${s}`}><span className="dot" />{wt("world.cards.s." + s)}</span>
            <span className="rvc-task">{c.task || "—"}</span>
          </button>
        );
      })}
      {!chars.length && <div className="empty-state rvc-empty">{wt("world.ovNoAgent")}</div>}
    </div>
  );
}

/* ---------------- room view (orchestrates canvas + palette) ---------------- */
const VIEW_LS = "guildos.world.view.v1";
function RoomView({ room, chars, onAgent, onExit, update, rename, can, onSpawn, onOpenDoc, canTemplate, onSaveTemplate }) {
  const [build, setBuild] = useState(false);
  const [view, setView] = useState(() => { try { return localStorage.getItem(VIEW_LS) === "cards" ? "cards" : "map"; } catch (e) { return "map"; } });
  const setViewPersist = (v) => { setView(v); try { localStorage.setItem(VIEW_LS, v); } catch (e) { } };
  const canBuild = !can || can("room.build");
  const canPlace = !can || can("room.place");
  const canMove  = !can || can("room.move");
  const canReset = !can || can("room.reset");
  const canRename = !can || can("room.delete");
  const canCreate = !can || can("agent.create");
  useEffect(() => { if (build && !canBuild) setBuild(false); }, [build, canBuild]);
  const [soundOn, setSoundOn] = useState(() => Sound.on);
  const toggleSound = () => { const v = !soundOn; setSoundOn(v); Sound.set(v); };
  const [asideTab, setAsideTab] = useState("chat");
  const asideBottom = !build;                                  // view mode: dock aside at the bottom
  const asidePeek = asideBottom ? 92 : 0;                      // small peek (tab bar) — canvas dominates, dock scrolls
  const viewH = Math.max(360, (typeof window !== "undefined" ? window.innerHeight : 800) - 180 - asidePeek);
  const [tool, setTool] = useState({ type: "floor", floor: 1, struct: 1, key: null, rot: 0 });

  // ----- history (undo / redo) + reset to default -----
  const roomRef = useRef(room); roomRef.current = room;
  const updateRef = useRef(update); updateRef.current = update;
  const histRef = useRef({ past: [], future: [] });
  const [, bumpHist] = React.useReducer(x => x + 1, 0);
  useEffect(() => { histRef.current = { past: [], future: [] }; bumpHist(); }, [room.id]);
  const snapState = (r) => JSON.stringify([r.floor, r.struct, r.objects]);
  const snapshot = React.useCallback(() => { const r = roomRef.current; histRef.current.past.push(snapState(r)); if (histRef.current.past.length > 60) histRef.current.past.shift(); histRef.current.future = []; bumpHist(); }, []);
  const applySnap = (snap) => { const [floor, struct, objects] = JSON.parse(snap); updateRef.current(roomRef.current.id, r => ({ ...r, floor, struct, objects })); };
  const doUndo = React.useCallback(() => { const h = histRef.current; if (!h.past.length) return; h.future.push(snapState(roomRef.current)); applySnap(h.past.pop()); bumpHist(); }, []);
  const doRedo = React.useCallback(() => { const h = histRef.current; if (!h.future.length) return; h.past.push(snapState(roomRef.current)); applySnap(h.future.pop()); bumpHist(); }, []);
  const resetDefault = async () => { if (!(await uiConfirm({ title: wt("world.resetRoomTitle"), message: wt("world.resetRoomMsg"), danger: true }))) return; snapshot(); const blank = blankRoom(roomRef.current.name); updateRef.current(roomRef.current.id, r => ({ ...r, floor: blank.floor, struct: blank.struct, objects: [] })); };

  useEffect(() => {
    const onKey = (e) => {
      if (!build) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "z" || e.key === "Z")) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); return; }
      if (mod && (e.key === "y" || e.key === "Y")) { e.preventDefault(); doRedo(); return; }
      if (e.key === "r" || e.key === "R") setTool(p => ({ ...p, rot: ((p.rot || 0) + 1) % 4 }));
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, [build, doUndo, doRedo]);

  const apply = (x, y, isDown) => {
    const w = room.w, i = idx(x, y, w);
    if (tool.type === "floor") update(room.id, r => { const f = r.floor.slice(); f[i] = tool.floor; return { ...r, floor: f }; });
    else if (tool.type === "struct") update(room.id, r => { const s = r.struct.slice(); s[i] = tool.struct; const f = r.floor.slice(); if (tool.struct === 2 && !f[i]) f[i] = 1; return { ...r, struct: s, floor: f }; });
    else if (tool.type === "erase") update(room.id, r => {
      const hit = (r.objects || []).filter(o => !FURN[o.key].floorDecor).reverse().find(o => objCells(o).some(([cx, cy]) => cx === x && cy === y))
        || (r.objects || []).find(o => objCells(o).some(([cx, cy]) => cx === x && cy === y));
      if (hit) return { ...r, objects: r.objects.filter(o => o !== hit) };
      if (r.struct[i]) { const s = r.struct.slice(); s[i] = 0; return { ...r, struct: s }; }
      const f = r.floor.slice(); f[i] = 0; return { ...r, floor: f };
    });
    else if (tool.type === "object" && isDown && tool.key) {
      const f = effFootprint(tool.key, tool.rot);
      update(room.id, r => {
        for (let yy = 0; yy < f.h; yy++) for (let xx = 0; xx < f.w; xx++) {
          const cx = x + xx, cy = y + yy; if (cx < 0 || cy < 0 || cx >= r.w || cy >= r.h) return r;
          const ci = idx(cx, cy, r.w); if (!r.floor[ci] || r.struct[ci] === 1) return r;
          if ((r.objects || []).some(o => !FURN[o.key].floorDecor && objCells(o).some(([ox, oy]) => ox === cx && oy === cy))) return r;
        }
        return { ...r, objects: [...(r.objects || []), { key: tool.key, x, y, rot: tool.rot || 0 }] };
      });
    }
  };
  const applyEdit = (x, y, isDown) => {
    const t = tool.type;
    if ((t === "floor" || t === "struct" || t === "object") && !canPlace) return;
    if (t === "erase" && !canMove) return;
    if (isDown) snapshot();
    apply(x, y, isDown);
  };

  return (
    <div className="room-view fade-in">
      <div className="rv-topbar">
        <button className="btn btn-ghost btn-sm" onClick={onExit}>{wt("world.allRooms")}</button>
        <input className="rv-name" defaultValue={room.name} key={room.id} readOnly={!canRename}
          onBlur={e => { if (!canRename) { e.target.value = room.name; return; } const v = e.target.value.trim(); if (v && v !== room.name) rename(room.id, v); }} onKeyDown={e => e.key === "Enter" && e.target.blur()} />
        <span className="rv-spacer" />
        {build && (
          <div className="rv-actions">
            <button className="btn btn-ghost btn-sm btn-icon" onClick={doUndo} disabled={!histRef.current.past.length} title={wt("world.undoTitle")}>↶</button>
            <button className="btn btn-ghost btn-sm btn-icon" onClick={doRedo} disabled={!histRef.current.future.length} title={wt("world.redoTitle")}>↷</button>
            <button className="btn btn-danger btn-sm" onClick={resetDefault} title={wt("world.resetTitle")} style={{ display: canReset ? "" : "none" }}>{wt("world.reset")}</button>
          </div>
        )}
        {!build && (
          <Segmented value={view} onChange={setViewPersist}
            options={[{ value: "map", label: wt("world.view.map") }, { value: "cards", label: wt("world.view.cards") }]} />
        )}
        <button className={`btn btn-ghost btn-sm btn-icon ${soundOn ? "rv-sound-on" : ""}`} onClick={toggleSound} title={wt("world.soundTitle")}>{soundOn ? "🔔" : "🔕"}</button>
        {canCreate && <button className="btn btn-gold btn-sm" onClick={() => onSpawn && onSpawn()} title={wt("world.spawnTitle")}>{wt("world.spawnAgent")}</button>}
        <span className="live-badge"><span className="pulse-dot" />🎭 {chars.length}</span>
        {canTemplate && <button className="btn btn-ghost btn-sm" onClick={() => onSaveTemplate && onSaveTemplate()} title={wt("world.saveTplTitle")}>{wt("world.saveTpl")}</button>}
        {canBuild
          ? <button className={`btn btn-sm ${build ? "btn-gold" : "btn-ghost"}`} onClick={() => setBuild(b => !b)}>{build ? wt("world.buildDone") : wt("world.buildMode")}</button>
          : <span className="rv-nobuild mono" title={wt("world.viewOnlyTitle")}>{wt("world.viewOnly")}</span>}
      </div>
      {build && <div className="rv-hint mono">{(canPlace || canMove) ? wt("world.buildHint") : wt("world.viewHint")}</div>}
      <div className={`rv-body ${build ? "is-build" : "is-view"}`}>
        {(build || view === "map")
          ? <RoomCanvas room={room} build={build} tool={tool} setTool={setTool} apply={applyEdit} chars={chars} onAgent={onAgent} viewH={viewH} />
          : <RoomStatusCards chars={chars} onAgent={onAgent} />}
        {build && <BuildPalette tool={tool} setTool={setTool} canPlace={canPlace} canMove={canMove} />}
        {!build && <RoomAside room={room} roomChars={chars} onOpenDoc={onOpenDoc} tab={asideTab} setTab={setAsideTab} />}
      </div>
    </div>
  );
}

export { useLivingAgents, RoomCanvas, ItemPreview, BuildPalette, RoomView };
