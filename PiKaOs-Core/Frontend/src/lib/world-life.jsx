/* PiKaOs — ES module (migrated from PiKaOs-Core/world-life.jsx). */


/* ============================================================
   WORLD-LIFE — live activity simulation for room agents.
   Gives each seated agent a believable "what it's doing right now"
   state (writing / reading / running commands / thinking / searching),
   waiting & permission speech bubbles, a finish-turn chime, and
   Task-style sub-agents that spawn linked to their parent.
   Pure simulation — drives the sprites; no real backend.
   ============================================================ */

const ACTS = {
  writing:    { th: "กำลังเขียนโค้ด", icon: "⌨️", cls: "act-writing" },
  reading:    { th: "กำลังอ่านไฟล์",  icon: "📖", cls: "act-reading" },
  running:    { th: "รันคำสั่ง",       icon: "⚙️", cls: "act-running" },
  thinking:   { th: "กำลังคิด",        icon: "💭", cls: "act-thinking" },
  searching:  { th: "ค้นหาข้อมูล",     icon: "🔍", cls: "act-reading" },
  idle:       { th: "ว่าง",            icon: "💤", cls: "" },
  walking:    { th: "กำลังเดิน",        icon: "🚶", cls: "" },
  cooking:    { th: "กำลังทำอาหาร",     icon: "🍳", cls: "act-cook" },
  fridge:     { th: "เปิดตู้เย็น",      icon: "🧊", cls: "act-fridge" },
  drinking:   { th: "พักดื่มน้ำ",       icon: "☕", cls: "" },
  waiting:    { th: "รอคำสั่ง",         icon: "⌛", cls: "act-wait", bubble: { kind: "input", text: "รอคำสั่งจากท่าน…" } },
  permission: { th: "ขออนุญาต",        icon: "🔐", cls: "act-wait", bubble: { kind: "perm",  text: "ขออนุญาตรันคำสั่งนี้?" } },
  done:       { th: "เสร็จเทิร์น",      icon: "✅", cls: "act-done", bubble: { kind: "done",  text: "เสร็จแล้ว ✓" } },
};
const WORK_ACTS = ["writing", "reading", "running", "thinking", "searching"];

/* live activity should echo the agent's class/role */
const ROLE_ACTS = {
  scribe:     ["writing", "writing", "reading"],
  smith:      ["writing", "running", "running"],
  mage:       ["thinking", "writing", "thinking"],
  knight:     ["running", "reading", "running"],
  researcher: ["searching", "reading", "thinking"],
  analyst:    ["reading", "thinking", "searching"],
};
function pickActivity(char) {
  const pool = ROLE_ACTS[char && char.classKey] || WORK_ACTS;
  return pool[(Math.random() * pool.length) | 0];
}

/* ---- optional finish-turn chime (Web Audio) ---- */
const Sound = {
  on: (() => { try { return localStorage.getItem("guildos.sound") === "1"; } catch (e) { return false; } })(),
  ctx: null, last: 0,
  ensure() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } return this.ctx; },
  set(v) { this.on = v; try { localStorage.setItem("guildos.sound", v ? "1" : "0"); } catch (e) { } if (v) this.ensure(); },
  chime() {
    if (!this.on) return; const now = Date.now(); if (now - this.last < 1100) return; this.last = now;
    const ctx = this.ensure(); if (!ctx) return; if (ctx.state === "suspended") ctx.resume();
    const t = ctx.currentTime;
    [[783.99, 0], [1046.5, 0.11], [1318.5, 0.22]].forEach(([f, dt]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = "triangle"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.13, t + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.42);
      o.connect(g); g.connect(ctx.destination); o.start(t + dt); o.stop(t + dt + 0.45);
    });
  }
};

/* ---- per-agent activity state machine (mutates agent in place) ---- */
function spawnSubs(a, now) {
  if (a.subs && a.subs.length) return;
  const n = 1 + (Math.random() < 0.45 ? 1 : 0);
  const offs = [[1.15, -0.15], [-1.15, -0.15], [0.0, -1.2]];
  a.subs = Array.from({ length: n }, (_, i) => ({
    id: a.id + "_sub" + i + "_" + now, dx: offs[i][0], dy: offs[i][1],
    act: WORK_ACTS[(Math.random() * WORK_ACTS.length) | 0],
    until: now + 4500 + Math.random() * 5000,
  }));
}
function tickSubs(a, now) {
  if (!a.subs || !a.subs.length) return;
  a.subs = a.subs.filter(s => s.until > now);
  a.subs.forEach(s => { if (Math.random() < 0.28) s.act = WORK_ACTS[(Math.random() * WORK_ACTS.length) | 0]; });
}
/* advance a seated/working agent to its next live activity */
function advanceActivity(a, now) {
  const cur = a.activity;
  if (cur === "done") { // finished its turn → now waits for the next instruction
    a.activity = "waiting"; a.bubble = ACTS.waiting.bubble; a.actUntil = now + 2600 + Math.random() * 3200; return;
  }
  if (cur === "waiting" || cur === "permission") { // "user" responded → back to work
    a.activity = pickActivity(a.char); a.bubble = null; a.actUntil = now + 2000 + Math.random() * 2600; return;
  }
  const r = Math.random();
  if (r < 0.15) { a.activity = "done"; a.bubble = ACTS.done.bubble; a.actUntil = now + 1500; Sound.chime(); return; }
  if (r < 0.23) { a.activity = "permission"; a.bubble = ACTS.permission.bubble; a.actUntil = now + 3200 + Math.random() * 3000; return; }
  a.activity = pickActivity(a.char); a.bubble = null; a.actUntil = now + 1800 + Math.random() * 2600;
  if (["running", "searching", "thinking"].includes(a.activity) && Math.random() < 0.7) spawnSubs(a, now);
}

Object.assign(window, { ACTS, WORK_ACTS, ROLE_ACTS, pickActivity, Sound, spawnSubs, tickSubs, advanceActivity });

export {
  ACTS,
  ROLE_ACTS,
  Sound,
  WORK_ACTS,
  advanceActivity,
  pickActivity,
  spawnSubs,
  tickSubs
};
