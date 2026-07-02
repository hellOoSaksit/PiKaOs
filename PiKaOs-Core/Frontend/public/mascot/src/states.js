/* ============================================================================
   ART DIRECTION — "Claude", a handheld-console mascot
   ----------------------------------------------------------------------------
   WHY BMO / GAME BOY:
     A handheld console is the friendliest possible robot body: people already
     read a rectangular screen + chunky buttons as "a face with a personality".
     Borrowing BMO's proportions (upright rounded slab, stubby legs, a single
     glowing screen-face) gives us instant warmth and a clear place to put
     emotion — the SCREEN — without sculpting an articulated head.

   THE BLUE-PINK PALETTE:
     Pastel sky-blue (#8FD0F0) at the base melting up into soft pink (#F7A8C4)
     keeps the toy plastic feel but signals "calm + approachable" rather than
     retro-grey. Pink is reserved for warm accents (the A button, the default
     LED, the cheeks of a smile); blue for structure (B button, bezel, legs).
     The mint screen (#BFEFE6) is the one cool "monitor" note that makes the
     drawn face read as a powered display.

   READ OF EACH STATE (what the silhouette + face should communicate at a glance):
     idle       neutral smile, slow breathing — "I'm here, relaxed"
     listening  wide eyes, slight forward lean, LED pulsing — "go on, I'm tuned in"
     thinking   eyes drift up + "..." , slow sway — "processing"
     speaking   steady eyes, mouth talking — "I'm telling you something"
     happy      ^_^ eyes + grin + a hop — "delighted"
     curious    whole rig cocks to one side, one eye bigger — "huh, interesting?"
     surprised  round eyes snap open + a recoil — "oh!"
     error      flat angry eyes, red flicker + shake — "something broke"
     sleeping   closed-line eyes + Zzz, very slow breathe — "powered down / idle"
     loading    progress bar on screen — "working, please wait"

   HOW THE NO-DISTORTION RIG WORKS:
     The console BODY mesh is geometry that is NEVER scaled or skewed. All
     "squash & stretch" lives in CHILD groups of the rig:
        rigGroup            <- bob / tilt / hop / shake (rotate+translate WHOLE unit)
          bodyGroup         <- RIGID console + screen + buttons + LED (read-only pose)
          leftArm/rightArm  <- telescoping arms (we scale a TUBE child, never the body)
          legs              <- swing for walk
     Personality therefore reads through (a) the screen face texture, (b) elastic
     limbs, and (c) moving the entire rigid rig as one object. The body keeps a
     clean, undistorted silhouette at all times.

   DATA-DRIVEN: a "state" is just { face, led, profile, enter }. Adding an emotion
   = adding an entry here + (if it needs a new eye/mouth shape) a draw branch in
   Face.js. A "gesture" is a pure function u(0..1) -> pose-offset. No new wiring.
   ========================================================================== */

// Screen background palettes (kept here so the whole face mood is data-driven)
const MINT      = '#BFEFE6';
const MINT_DARK = '#8FBEB6';
const RED       = '#E97A72';

// ---- easing helpers (pure) ------------------------------------------------
export const ease = {
  inOut: (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2),
  out:   (u) => 1 - Math.pow(1 - u, 3),
  // rise / hold / fall envelope — used so an arm extends, holds, then retracts flush
  bump:  (u, rise = 0.18, fall = 0.2) =>
           u < rise ? u / rise
         : u > 1 - fall ? (1 - u) / fall
         : 1,
};
const TAU = Math.PI * 2;

/* ---- STATES -------------------------------------------------------------
   face:    descriptor consumed by Face.js (eyes/mouth/overlay/bg + flags)
   led:     status color (overridable at runtime via setStatusLED)
   profile: idle-motion params blended smoothly on transition
            bob*  = vertical breathe, sway* = z-roll, lean = forward tilt toward
            viewer, tilt = static head-cock, ledPulse = LED breathing amount
   enter:   optional one-shot played once when entering the state
*/
export const STATES = {
  idle: {
    face: { eyes: 'open', mouth: 'smile', bg: MINT },
    led: '#FF8FB1',
    profile: { bobAmp: 0.06, bobSpeed: 1.6, swayAmp: 0.022, swaySpeed: 1.0, lean: 0, tilt: 0, ledPulse: 0.12 },
  },
  listening: {
    face: { eyes: 'wide', mouth: 'small', bg: MINT },
    led: '#FF8FB1',
    profile: { bobAmp: 0.035, bobSpeed: 2.2, swayAmp: 0.012, swaySpeed: 1.4, lean: 0.13, tilt: 0, ledPulse: 0.8 },
  },
  thinking: {
    face: { eyes: 'up', mouth: 'small', overlay: 'dots', bg: MINT },
    led: '#F2B23A',
    profile: { bobAmp: 0.045, bobSpeed: 1.1, swayAmp: 0.05, swaySpeed: 0.8, lean: -0.04, tilt: 0, ledPulse: 0.35 },
  },
  speaking: {
    face: { eyes: 'open', mouth: 'talk', bg: MINT, autoTalk: true },
    led: '#6FB8E6',
    profile: { bobAmp: 0.05, bobSpeed: 2.0, swayAmp: 0.02, swaySpeed: 1.6, lean: 0.05, tilt: 0, ledPulse: 0.25 },
  },
  happy: {
    face: { eyes: 'happy', mouth: 'bigSmile', bg: MINT, noBlink: true },
    led: '#5FD08A',
    profile: { bobAmp: 0.09, bobSpeed: 2.6, swayAmp: 0.03, swaySpeed: 2.0, lean: 0, tilt: 0, ledPulse: 0.4 },
    enter: 'hop',
  },
  curious: {
    face: { eyes: 'curiousBig', mouth: 'small', bg: MINT },
    led: '#C79BE8',
    profile: { bobAmp: 0.04, bobSpeed: 1.5, swayAmp: 0.02, swaySpeed: 1.0, lean: 0.05, tilt: 0.30, ledPulse: 0.25 },
  },
  surprised: {
    face: { eyes: 'round', mouth: 'open', bg: MINT, noBlink: true },
    led: '#F2B23A',
    profile: { bobAmp: 0.02, bobSpeed: 3.0, swayAmp: 0.01, swaySpeed: 2.0, lean: 0, tilt: 0, ledPulse: 0.6 },
    enter: 'recoil',
  },
  error: {
    face: { eyes: 'angry', mouth: 'frown', bg: RED, flickerRed: true, noBlink: true },
    led: '#E5564B',
    profile: { bobAmp: 0.02, bobSpeed: 6.0, swayAmp: 0.0, swaySpeed: 1.0, lean: 0, tilt: 0, ledPulse: 1.0 },
    enter: 'shake',
  },
  sleeping: {
    face: { eyes: 'closed', mouth: 'small', overlay: 'zzz', bg: MINT_DARK, noBlink: true, dim: true },
    led: '#5B6B8C',
    profile: { bobAmp: 0.05, bobSpeed: 0.55, swayAmp: 0.015, swaySpeed: 0.4, lean: -0.06, tilt: 0.04, ledPulse: 0.15 },
  },
  loading: {
    face: { eyes: 'open', mouth: 'small', overlay: 'progress', bg: MINT },
    led: '#6FB8E6',
    profile: { bobAmp: 0.03, bobSpeed: 1.4, swayAmp: 0.015, swaySpeed: 1.2, lean: 0, tilt: 0, ledPulse: 0.5 },
  },
};

export const STATE_NAMES = Object.keys(STATES);

/* ---- GESTURES / ONE-SHOTS ----------------------------------------------
   Each is { dur (seconds), fn(u) -> pose }. A pose is a sparse object of
   additive offsets, all optional, defaulting to 0:
     rigX rigY rigZ rigRX rigRY rigRZ           (whole rig — body stays rigid)
     lArm/rArm = { stretch(0..1), rotZ, rotX }  (elastic arms)
     legWalk (0..1)                             (leg swing amount)
   Sign convention (resolved in Limbs/ClaudeMascot): rArm.rotZ>0 raises the
   right hand UP; lArm.rotZ<0 raises the left hand up. stretch telescopes the
   tube only (hand never distorts), so 0 = flush, 1 = fully extended.
*/
export const GESTURES = {
  // -- user-facing gestures --
  wave: {
    dur: 1.7,
    fn: (u) => {
      const e = ease.bump(u, 0.22, 0.22);
      const osc = Math.sin(u * TAU * 3);
      return { rArm: { stretch: 0.85 * e, rotZ: (0.95 + osc * 0.45) * e, rotX: 0.18 * e } };
    },
  },
  point: {
    dur: 1.4,
    fn: (u) => {
      const e = ease.bump(u, 0.18, 0.25);
      return { rArm: { stretch: 1.0 * e, rotZ: -0.08 * e, rotX: 0.12 * e } };
    },
  },
  shrug: {
    dur: 1.2,
    fn: (u) => {
      const e = Math.sin(u * Math.PI);
      return {
        lArm: { stretch: 0.42 * e, rotZ: -0.45 * e, rotX: 0.15 * e },
        rArm: { stretch: 0.42 * e, rotZ: 0.45 * e, rotX: 0.15 * e },
        rigY: -0.04 * e,
      };
    },
  },
  nod: {
    dur: 1.0,
    fn: (u) => ({ rigRX: Math.sin(u * TAU * 2) * 0.20 * Math.sin(u * Math.PI) }),
  },
  shakeHead: {
    dur: 1.0,
    fn: (u) => ({ rigRY: Math.sin(u * TAU * 2.5) * 0.24 * Math.sin(u * Math.PI) }),
  },
  cheer: {
    dur: 1.6,
    fn: (u) => {
      const e = ease.bump(u, 0.2, 0.25);
      const hop = Math.abs(Math.sin(u * Math.PI * 2)) * 0.22 * e;
      return {
        lArm: { stretch: 0.9 * e, rotZ: -1.25 * e, rotX: 0 },
        rArm: { stretch: 0.9 * e, rotZ: 1.25 * e, rotX: 0 },
        rigY: hop,
      };
    },
  },
  walk: {
    dur: 2.4,
    fn: (u) => {
      const e = ease.bump(u, 0.12, 0.12);
      return { legWalk: e, rigY: Math.abs(Math.sin(u * Math.PI * 8)) * 0.05 * e };
    },
  },

  // -- internal enter-effects (triggered by STATES[*].enter) --
  hop: {
    dur: 0.7,
    fn: (u) => ({ rigY: Math.sin(u * Math.PI) * 0.45 + Math.max(0, Math.sin(u * TAU)) * 0.12 }),
  },
  recoil: {
    dur: 0.6,
    fn: (u) => ({
      rigRX: -0.32 * Math.exp(-u * 5) * Math.cos(u * 16),
      rigY: 0.08 * Math.sin(u * Math.PI),
    }),
  },
  shake: {
    dur: 0.6,
    fn: (u) => ({
      rigRZ: Math.sin(u * Math.PI * 12) * 0.11 * (1 - u),
      rigX: Math.sin(u * Math.PI * 16) * 0.04 * (1 - u),
    }),
  },
};

// Only the expressive, user-callable gestures (debug panel + public API list)
export const GESTURE_NAMES = ['wave', 'point', 'shrug', 'nod', 'shakeHead', 'cheer', 'walk'];
