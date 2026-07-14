/* ============================================================================
   PikaMascot.js — the rig, the state machine, and the public API.

   RIG HIERARCHY (the no-distortion guarantee):
     scene
       rigGroup          whole-mascot transform (bob / tilt / hop / shake / lean)
         bodyGroup       RIGID console geometry — NEVER scaled or skewed
         leftArm/rightArm telescoping arms (Limbs)
         legs            swinging legs (Limbs)
       shadow            soft contact blob on the floor

   PUBLIC API:
     new PikaMascot(container, options)
     .setState(name)            smoothly blend to an emotion state
     .playGesture(name)         layer a one-shot gesture over the current state
     .setStatusLED(color)       status color, independent of emotion
     .setTalking(bool)          drive the mouth talk signal
     .lookAt(x, y)              aim eyes + rig lean at a normalized point (-1..1)
     .setPower(bool)            flip the side switch -> screen off + sleep
   ========================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { Face } from './Face.js';
import { Limbs } from './Limbs.js';
import { setupLights } from './lights.js';
import { STATES, GESTURES, ease } from './states.js';

const PALETTE = {
  blue:    '#9DD8F2',   // body base (bottom) — soft pastel sky blue
  pink:    '#FBBDD8',   // body top — soft pastel pink
  bezel:   '#3F5E94',   // deep-blue screen bezel
  navy:    '#2E4670',   // dpad / pills / grille
  aPink:   '#FF7FAC',   // A button
  bBlue:   '#5CB8EC',   // B button
  arm:     '#9AD6F2',
  hand:    '#FBBDD8',
  leg:     '#5CB8EC',
  foot:    '#5AA6DA',
  switch:  '#F4EFF8',
  bg:      0xF3EEF6,
};

export class PikaMascot {
  constructor(container, options = {}) {
    this.container = container;
    this.options = options;
    this.transparent = options.transparent ?? false;   // embed: composite over the host page
    this.bloomEnabled = options.bloom ?? false;         // glow post-fx — off by default (heavy)
    this.clock = new THREE.Clock();
    this.time = 0;

    // ---- lifecycle / perf bookkeeping ----
    this._listeners = [];     // [target, type, fn] for clean removal in dispose()
    this._disposed = false;
    this._contextLost = false;
    this._rafId = 0;
    this._fps = 0; this._fpsFrames = 0; this._fpsT0 = performance.now();
    // optional frame-rate cap: { maxFPS: 30 } halves GPU/battery use on weak
    // devices. 0 / unset = uncapped (smooth 60 via requestAnimationFrame).
    const _cap = options.maxFPS ?? options.fps ?? 0;
    this._frameInterval = _cap > 0 ? 1000 / _cap : 0;
    this._lastFrame = 0;

    // ---- live, damped values ----
    this.look = { x: 0, y: 0 };          // current (damped) gaze
    this.lookTarget = { x: 0, y: 0 };    // where we want to look
    this._manualLook = false;            // lookAt() overrides mouse until mouse moves
    this.talking = false;
    this.talkVal = 0;
    this.power = true;
    this.statusOverride = null;          // setStatusLED wins over the state's LED
    this.loadingProgress = 0;

    // ---- state machine ----
    this.stateName = 'idle';
    this.fromProfile = { ...STATES.idle.profile };
    this.toProfile = { ...STATES.idle.profile };
    this.blend = 1;                      // 0..1 progress of profile crossfade
    this.face = new Face();
    this.faceDesc = { ...STATES.idle.face };
    this.screenArt = null;               // optional scene drawn on the screen instead of the face
    this.screenArtColor = '#4361ee';

    // ---- one-shots (gestures + enter effects) layered additively ----
    this.shots = [];

    // blink scheduler
    this.eyeOpen = 1;
    this.blinkT = this._nextBlink();
    this.blinking = false;
    this.blinkPhase = 0;

    // idle -> sleep
    this.lastInteraction = performance.now();
    this.idleTimeout = (options.idleTimeout ?? 13) * 1000;

    this._initThree();
    this._buildMaterials();
    this._buildModel();
    this.limbs = new Limbs(this.rigGroup, this.materials);
    this._initInteraction();

    // apply initial state without a transition
    this._applyStateData('idle', true);

    this._onResize();
    this._initVisibility();
    this._initContextLossHandling();
    if (options.showStats) this._initStats();
    this._loop = this._loop.bind(this);
    this._rafId = requestAnimationFrame(this._loop);
  }

  // ---- listener registry: add + remember so dispose() can remove cleanly ----
  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
    return fn;
  }

  // ---- gracefully survive a lost GPU context (tab backgrounded too long,
  //      driver reset, etc.) instead of spewing errors ----
  _initContextLossHandling() {
    const el = this.renderer.domElement;
    this._on(el, 'webglcontextlost', (e) => { e.preventDefault(); this._contextLost = true; });
    this._on(el, 'webglcontextrestored', () => { this._contextLost = false; });
  }

  // ---- tiny built-in FPS readout (opt-in via { showStats:true }) ----
  _initStats() {
    const s = document.createElement('div');
    s.style.cssText = 'position:absolute;left:10px;bottom:10px;z-index:10;font:600 12px ui-monospace,monospace;' +
      'color:#5a4a6e;background:rgba(255,255,255,.6);backdrop-filter:blur(6px);padding:4px 9px;border-radius:8px;pointer-events:none;';
    s.textContent = '— fps';
    if (getComputedStyle(this.container).position === 'static') this.container.style.position = 'relative';
    this.container.appendChild(s);
    this._statsEl = s;
  }

  getFPS() { return this._fps; }

  // ---- full teardown: stop the loop, drop listeners, free all GPU memory ----
  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    if (this._rafId) cancelAnimationFrame(this._rafId);
    clearTimeout(this._pokeReturn);
    if (this._ro) this._ro.disconnect();
    for (const [t, type, fn, opts] of this._listeners) t.removeEventListener(type, fn, opts);
    this._listeners = [];
    // free geometries + materials + their textures
    const seenTex = new Set();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
      for (const m of mats) {
        for (const k in m) { const v = m[k]; if (v && v.isTexture && !seenTex.has(v)) { seenTex.add(v); v.dispose(); } }
        m.dispose();
      }
    });
    if (this.face?.texture) this.face.texture.dispose();
    this.bloomComposer?.dispose?.();
    this.finalComposer?.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.parentNode?.removeChild(this.renderer.domElement);
    this._statsEl?.parentNode?.removeChild(this._statsEl);
  }

  // pause all GPU/CPU work when the mascot isn't on screen or the tab is hidden.
  // We default to RUNNING and only pause on a positive off-screen reading — an
  // unreliable IntersectionObserver must never be able to freeze the mascot.
  _initVisibility() {
    this._onScreen = true;
    this._visTick = 0;
    this._on(document, 'visibilitychange', () => {
      // swallow the time gap so the animation doesn't jump on resume
      if (!document.hidden) this.clock.getDelta();
    });
  }

  // cheap rect-vs-viewport test (throttled in the loop) — true if any part of
  // the canvas is within the viewport
  _checkOnScreen() {
    const r = this.renderer.domElement.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return true;   // not laid out yet → keep running
    const vw = window.innerWidth || document.documentElement.clientWidth;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    return r.bottom > 0 && r.top < vh && r.right > 0 && r.left < vw;
  }

  // =====================================================================
  //  THREE setup
  // =====================================================================
  _initThree() {
    const { clientWidth: w, clientHeight: h } = this.container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: this.transparent, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    if (this.transparent) this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = false;   // shadows removed
    // keep colours true & vivid — AgX washes pastels; render linear→sRGB instead
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    if (!this.transparent) this.scene.background = new THREE.Color(PALETTE.bg);

    this.camera = new THREE.PerspectiveCamera(34, w / h, 0.1, 100);
    this.camera.position.set(0, 0.35, 9.2);
    this.camera.lookAt(0, 0.1, 0);

    this.lights = setupLights(this.scene, this.renderer);

    this.BLOOM_LAYER = 1;
    this.bloomLayer = new THREE.Layers();
    this.bloomLayer.set(this.BLOOM_LAYER);

    // -------- SELECTIVE bloom (optional — heavy on weak GPUs) --------
    // When enabled: render ONLY the bloom layer into a half-res buffer, blur it,
    // and add it over the full render. When OFF we render directly to screen,
    // which is far cheaper AND gets native MSAA for free.
    if (this.bloomEnabled) {
      this.bloomScale = 0.5;
      const bw = Math.max(1, Math.floor(w * this.bloomScale));
      const bh = Math.max(1, Math.floor(h * this.bloomScale));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(bw, bh), 0.62, 0.6, 0.0);
      this.bloomComposer = new EffectComposer(this.renderer);
      this.bloomComposer.renderToScreen = false;
      this.bloomComposer.setSize(bw, bh);
      this.bloomComposer.addPass(new RenderPass(this.scene, this.camera));
      this.bloomComposer.addPass(this.bloom);

      const mixPass = new ShaderPass(
        new THREE.ShaderMaterial({
          uniforms: {
            baseTexture: { value: null },
            bloomTexture: { value: this.bloomComposer.renderTarget2.texture },
          },
          vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
          fragmentShader: `uniform sampler2D baseTexture; uniform sampler2D bloomTexture; varying vec2 vUv;
                           void main(){
                             vec4 base = texture2D(baseTexture, vUv);
                             vec3 glow = texture2D(bloomTexture, vUv).rgb;
                             gl_FragColor = vec4(base.rgb + glow, base.a);
                           }`,
        }),
        'baseTexture'
      );
      mixPass.needsSwap = true;

      this.finalComposer = new EffectComposer(this.renderer);
      this.finalComposer.addPass(new RenderPass(this.scene, this.camera));
      this.finalComposer.addPass(mixPass);
      this.finalComposer.addPass(new OutputPass());
      // EffectComposer targets lose the renderer's MSAA — re-enable it here.
      this.finalComposer.renderTarget1.samples = 8;
      this.finalComposer.renderTarget2.samples = 8;
    }
  }

  _buildMaterials() {
    // injection-moulded plastic: smooth base + a soft clearcoat sheen (glossy toy look).
    const plastic = (color, extra = {}) =>
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(color),
        roughness: 0.45, metalness: 0.0,
        clearcoat: 0.6, clearcoatRoughness: 0.35,
        envMapIntensity: 0.9, ...extra,
      });
    this.materials = {
      body:   new THREE.MeshPhysicalMaterial({
        vertexColors: true, roughness: 0.42, metalness: 0.0,
        clearcoat: 0.6, clearcoatRoughness: 0.32, envMapIntensity: 0.95,
      }),
      bezel:  plastic(PALETTE.bezel, { roughness: 0.38, clearcoatRoughness: 0.28 }),
      navy:   plastic(PALETTE.navy, { roughness: 0.4 }),
      aPink:  plastic(PALETTE.aPink, { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.22 }),
      bBlue:  plastic(PALETTE.bBlue, { roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.22 }),
      arm:    plastic(PALETTE.arm),
      hand:   plastic(PALETTE.hand),
      leg:    plastic(PALETTE.leg),
      foot:   plastic(PALETTE.foot, { roughness: 0.55, clearcoat: 0.4 }),
      switch: plastic(PALETTE.switch, { roughness: 0.32, clearcoatRoughness: 0.2 }),
      screen: new THREE.MeshStandardMaterial({
        map: this.face.texture,
        emissive: 0xffffff,
        emissiveMap: this.face.texture,
        emissiveIntensity: 1.0,
        roughness: 0.5,
        metalness: 0.0,
        envMapIntensity: 0.0,   // flat screen, no reflection
      }),
      led: new THREE.MeshStandardMaterial({ color: 0x000000, emissive: new THREE.Color('#FF8FB1'), emissiveIntensity: 2.4, roughness: 0.4 }),
      glass: new THREE.MeshBasicMaterial({ visible: false }),   // reflective sheen plate removed
    };
  }

  // =====================================================================
  //  MODEL  (procedural — primitives only)
  // =====================================================================
  _buildModel() {
    this.rigGroup = new THREE.Group();
    this.scene.add(this.rigGroup);

    this.bodyGroup = new THREE.Group();          // <-- RIGID. never scaled/skewed.
    this.rigGroup.add(this.bodyGroup);

    const FW = 2.3, FH = 3.1, FD = 0.85;         // body footprint
    const FRONT = FD / 2 + 0.001;

    // ---- console shell: rounded, beveled, blue->pink vertical gradient ----
    const bodyGeo = this._roundedBox(FW, FH, FD, 0.42, 0.16);
    this._applyGradient(bodyGeo, PALETTE.blue, PALETTE.pink);
    const body = new THREE.Mesh(bodyGeo, this.materials.body);
    body.castShadow = true;
    body.receiveShadow = true;
    this.bodyGroup.add(body);

    // ---- screen bezel (deep blue inset frame) ----
    const bezel = new THREE.Mesh(this._roundedBox(1.78, 1.30, 0.14, 0.12, 0.04), this.materials.bezel);
    bezel.position.set(0, 0.55, FRONT);
    bezel.castShadow = true;
    this.bodyGroup.add(bezel);

    // ---- the FACE screen (emissive canvas texture) ----
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.05), this.materials.screen);
    screen.position.set(0, 0.55, FRONT + 0.085);
    this.bodyGroup.add(screen);
    // faint glass sheen plate just in front
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.56, 1.10), this.materials.glass);
    glass.position.set(0, 0.55, FRONT + 0.095);
    this.bodyGroup.add(glass);

    // ---- D-pad (cross) lower-left ----
    const dpad = new THREE.Group();
    dpad.position.set(-0.55, -0.92, FRONT);
    const padH = new THREE.Mesh(this._roundedBox(0.62, 0.20, 0.12, 0.05, 0.02), this.materials.navy);
    const padV = new THREE.Mesh(this._roundedBox(0.20, 0.62, 0.12, 0.05, 0.02), this.materials.navy);
    padH.position.z = 0.02; padV.position.z = 0.02;
    dpad.add(padH, padV);
    const padHub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 16), this.materials.navy);
    padHub.rotation.x = Math.PI / 2; padHub.position.z = 0.05;
    dpad.add(padHub);
    this.bodyGroup.add(dpad);

    // ---- A / B buttons lower-right ----
    const letterTex = (ch, color) => {
      const c = document.createElement('canvas'); c.width = c.height = 128;
      const g = c.getContext('2d');
      g.fillStyle = color;
      g.font = '800 84px ui-rounded, "Segoe UI", system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(ch, 64, 72);
      const t = new THREE.CanvasTexture(c);
      t.anisotropy = 4;
      return t;
    };
    const mkBtn = (x, y, mat, ch, letterColor) => {
      const grp = new THREE.Group();
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.18, 0.13, 28), mat);
      b.rotation.x = Math.PI / 2;
      b.castShadow = true;
      grp.add(b);
      // embossed-look letter decal on the button face (tone-on-tone)
      const lbl = new THREE.Mesh(
        new THREE.PlaneGeometry(0.19, 0.19),
        new THREE.MeshBasicMaterial({ map: letterTex(ch, letterColor), transparent: true, depthWrite: false })
      );
      lbl.position.set(0, 0, 0.067);
      grp.add(lbl);
      grp.position.set(x, y, FRONT + 0.02);
      return grp;
    };
    this.bodyGroup.add(mkBtn(0.66, -0.74, this.materials.aPink, 'A', '#B83A6B'));   // A (pink)
    this.bodyGroup.add(mkBtn(0.34, -1.05, this.materials.bBlue, 'B', '#236699'));   // B (blue)

    // ---- text decal helper (canvas label on the body front) ----
    const addText = (text, { x, y, w, h, color = '#2E4670', weight = 800, rot = 0, spacing = 0 }) => {
      // canvas aspect MUST match the plane's w/h, else glyphs get stretched flat
      const cw = 512, ch = Math.max(24, Math.round(cw * h / w));
      const c = document.createElement('canvas'); c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.fillStyle = color;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      if (spacing) g.letterSpacing = spacing + 'px';
      // auto-fit: shrink the font until the label fits inside the canvas
      let fs = Math.round(ch * 0.82);
      const setFont = () => { g.font = `${weight} ${fs}px ui-rounded, "Segoe UI", system-ui, sans-serif`; };
      setFont();
      while (g.measureText(text).width > cw * 0.94 && fs > 8) { fs -= 2; setFont(); }
      g.fillText(text, cw / 2, ch / 2 + fs * 0.04);
      const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false })
      );
      m.position.set(x, y, FRONT + 0.012);
      m.rotation.z = rot;
      this.bodyGroup.add(m);
      return m;
    };

    // brand wordmark + tagline below the screen
    addText('PIKA', { x: 0, y: -0.34, w: 1.05, h: 0.26, color: '#34507E', spacing: 3 });
    addText('AI ASSISTANT', { x: 0, y: -0.50, w: 0.80, h: 0.09, color: '#7C6F94', weight: 700, spacing: 2 });

    // ---- start / select pills ----
    for (let i = 0; i < 2; i++) {
      const pill = new THREE.Mesh(this._roundedBox(0.22, 0.07, 0.06, 0.03, 0.01), this.materials.navy);
      pill.position.set(-0.16 + i * 0.34, -1.34, FRONT);
      pill.rotation.z = -0.32;
      this.bodyGroup.add(pill);
    }
    addText('SELECT', { x: -0.20, y: -1.22, w: 0.32, h: 0.07, color: '#5A4E72', weight: 700, rot: -0.32, spacing: 1 });
    addText('START',  { x:  0.16, y: -1.22, w: 0.30, h: 0.07, color: '#5A4E72', weight: 700, rot: -0.32, spacing: 1 });

    // ---- speaker grille (grid of tiny holes) ----
    const grille = new THREE.Group();
    grille.position.set(0.66, -1.30, FRONT);
    grille.rotation.z = -0.35;
    for (let r = 0; r < 3; r++)
      for (let cc = 0; cc < 3; cc++) {
        const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.08, 10), this.materials.navy);
        hole.rotation.x = Math.PI / 2;
        hole.position.set((cc - 1) * 0.085, (r - 1) * 0.085, 0.01);
        grille.add(hole);
      }
    this.bodyGroup.add(grille);

    // ---- LED on top-left corner (emissive, blooms) ----
    this.led = new THREE.Mesh(new THREE.SphereGeometry(0.085, 18, 14), this.materials.led);
    this.led.position.set(-0.92, 1.34, FRONT - 0.02);
    this.led.layers.enable(this.BLOOM_LAYER);   // <-- glows in the bloom pass
    this.bodyGroup.add(this.led);
    // little chrome ring around it
    const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.025, 10, 20), this.materials.navy);
    ledRing.position.copy(this.led.position);
    this.bodyGroup.add(ledRing);
    // POWER caption beside the LED
    addText('POWER', { x: -0.52, y: 1.34, w: 0.42, h: 0.085, color: '#6A5E84', weight: 700, spacing: 1.5 });

    // ---- cartridge / disk SLOT on the RIGHT side ----
    const slot = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.16, 0.62), this.materials.navy);
    slot.position.set(FW / 2 - 0.02, 0.95, 0);
    this.bodyGroup.add(slot);

    // ---- POWER SWITCH on the LEFT side (real toggle nub) ----
    const swTrack = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.34, 0.16), this.materials.navy);
    swTrack.position.set(-FW / 2 + 0.01, 0.85, 0.16);
    this.bodyGroup.add(swTrack);
    this.powerSwitch = new THREE.Mesh(this._roundedBox(0.12, 0.14, 0.16, 0.03, 0.01), this.materials.switch);
    this.powerSwitch.position.set(-FW / 2 + 0.01, 0.92, 0.16);   // up = ON
    this.bodyGroup.add(this.powerSwitch);

    this.bodyGroup.position.y = 0;   // legs hang below within rig
  }

  // ---- rounded, beveled box via extruded rounded-rect (soft plastic edges) ----
  _roundedBox(w, h, d, r, bevel) {
    const sh = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    sh.moveTo(x + r, y);
    sh.lineTo(x + w - r, y);
    sh.quadraticCurveTo(x + w, y, x + w, y + r);
    sh.lineTo(x + w, y + h - r);
    sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    sh.lineTo(x + r, y + h);
    sh.quadraticCurveTo(x, y + h, x, y + h - r);
    sh.lineTo(x, y + r);
    sh.quadraticCurveTo(x, y, x + r, y);
    const geo = new THREE.ExtrudeGeometry(sh, {
      depth: Math.max(0.001, d - bevel * 2),
      bevelEnabled: true,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 8,
      steps: 1,
      curveSegments: 32,
    });
    geo.center();
    geo.computeVertexNormals();
    return geo;
  }

  // vertical blue(bottom) -> pink(top) gradient as vertex colors
  _applyGradient(geo, bottomHex, topHex) {
    const cb = new THREE.Color(bottomHex);
    const ct = new THREE.Color(topHex);
    const pos = geo.attributes.position;
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); if (y < minY) minY = y; if (y > maxY) maxY = y; }
    const colors = new Float32Array(pos.count * 3);
    const tmp = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - minY) / (maxY - minY);
      tmp.copy(cb).lerp(ct, t);
      colors[i * 3] = tmp.r; colors[i * 3 + 1] = tmp.g; colors[i * 3 + 2] = tmp.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  }

  _shadowMat() {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const rg = g.createRadialGradient(64, 64, 6, 64, 64, 60);
    rg.addColorStop(0, 'rgba(60,40,80,0.42)');
    rg.addColorStop(1, 'rgba(60,40,80,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    const tex = new THREE.CanvasTexture(c);
    return new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false });
  }

  // =====================================================================
  //  INTERACTION
  // =====================================================================
  _initInteraction() {
    this.raycaster = new THREE.Raycaster();
    const el = this.renderer.domElement;
    const ndc = new THREE.Vector2();

    const toNorm = (e) => {
      const r = el.getBoundingClientRect();
      return {
        x: ((e.clientX - r.left) / r.width) * 2 - 1,
        y: -(((e.clientY - r.top) / r.height) * 2 - 1),
      };
    };

    this._on(this.container, 'pointermove', (e) => {
      const n = toNorm(e);
      this._manualLook = false;
      this.lookTarget.x = n.x;
      this.lookTarget.y = n.y;
      this._wake();
    });

    this._on(this.container, 'pointerdown', (e) => {
      const n = toNorm(e);
      ndc.set(n.x, n.y);
      this.raycaster.setFromCamera(ndc, this.camera);
      // power switch first
      const hitSwitch = this.raycaster.intersectObject(this.powerSwitch, false);
      if (hitSwitch.length) { this.setPower(!this.power); return; }
      // otherwise body -> happy hop
      const hitBody = this.raycaster.intersectObject(this.bodyGroup, true);
      if (hitBody.length && this.power) this._happyPoke();
      this._wake();
    });
  }

  _happyPoke() {
    const prev = (this.stateName === 'happy') ? 'idle' : this.stateName;
    this.setState('happy');
    clearTimeout(this._pokeReturn);
    this._pokeReturn = setTimeout(() => {
      if (this.stateName === 'happy') this.setState(prev);
    }, 1700);
  }

  _wake() {
    this.lastInteraction = performance.now();
    if (this.stateName === 'sleeping' && this.power) this.setState('idle');
  }

  // =====================================================================
  //  PUBLIC API
  // =====================================================================
  setState(name) {
    if (!STATES[name]) { console.warn('[PikaMascot] unknown state:', name); return; }
    if (name === this.stateName) return;
    this.stateName = name;
    this._applyStateData(name, false);
  }

  _applyStateData(name, immediate) {
    const s = STATES[name];
    // crossfade idle-motion profile
    this.fromProfile = immediate ? { ...s.profile } : { ...this._currentProfile() };
    this.toProfile = { ...s.profile };
    this.blend = immediate ? 1 : 0;
    // face descriptor (types snap; numeric values tween in the loop)
    this.faceDesc = { ...s.face };
    if (name === 'loading') this.loadingProgress = 0;
    // mask the face snap with a quick blink (unless the state holds eyes fixed)
    if (!s.face.noBlink && !immediate) this._triggerBlink();
    // LED base color (status override still wins)
    this.stateLED = s.led;
    // one-shot "enter" flourish
    if (s.enter) this._fireShot(s.enter);
  }

  playGesture(name) {
    if (!GESTURES[name]) { console.warn('[PikaMascot] unknown gesture:', name); return; }
    this._fireShot(name);
    this._wake();
  }

  setStatusLED(color) { this.statusOverride = color; }

  // show a small animated scene on the screen (e.g. 'cable','lock','gears'); null restores the face
  setScreenArt(name, color) { this.screenArt = name || null; if (color) this.screenArtColor = color; }

  setTalking(on) { this.talking = !!on; }

  lookAt(x, y) {
    this._manualLook = true;
    this.lookTarget.x = THREE.MathUtils.clamp(x, -1, 1);
    this.lookTarget.y = THREE.MathUtils.clamp(y, -1, 1);
  }

  setPower(on) {
    on = !!on;
    if (on === this.power) return;
    this.power = on;
    // animate the switch nub up(on)/down(off)
    this.powerSwitch.position.y = on ? 0.92 : 0.78;
    if (!on) { this.setState('sleeping'); }
    else { this.lastInteraction = performance.now(); this.setState('idle'); }
  }

  // =====================================================================
  //  one-shot helpers
  // =====================================================================
  _fireShot(name) {
    const g = GESTURES[name];
    if (!g) return;
    this.shots.push({ name, fn: g.fn, dur: g.dur, t: 0 });
  }

  _currentProfile() {
    // blended snapshot, so re-transitions start from where we visually are
    const out = {};
    for (const k in this.toProfile) out[k] = THREE.MathUtils.lerp(this.fromProfile[k] ?? 0, this.toProfile[k] ?? 0, this.blend);
    return out;
  }

  // =====================================================================
  //  blink
  // =====================================================================
  _nextBlink() { return 2.4 + Math.random() * 3.2; }
  _triggerBlink() { this.blinking = true; this.blinkPhase = 0; }

  _updateBlink(dt) {
    if (this.faceDesc.noBlink) { this.eyeOpen = 1; return; }
    if (this.blinking) {
      this.blinkPhase += dt / 0.16;       // ~160ms blink
      // triangle: 1 -> 0 -> 1
      this.eyeOpen = this.blinkPhase < 0.5
        ? 1 - this.blinkPhase * 2
        : (this.blinkPhase - 0.5) * 2;
      if (this.blinkPhase >= 1) { this.blinking = false; this.eyeOpen = 1; }
    } else {
      this.blinkT -= dt;
      if (this.blinkT <= 0) { this._triggerBlink(); this.blinkT = this._nextBlink(); }
      this.eyeOpen = 1;
    }
  }

  // =====================================================================
  //  MAIN LOOP
  // =====================================================================
  _loop() {
    if (this._disposed) return;
    this._rafId = requestAnimationFrame(this._loop);

    // optional frame-rate cap (e.g. 30fps) — skip the render on in-between rAF
    // ticks to cut GPU/battery use. dt accumulates so motion speed is unchanged.
    const nowMs = performance.now();
    if (this._frameInterval) {
      if (nowMs - this._lastFrame < this._frameInterval - 0.5) return;
      this._lastFrame = nowMs;
    }

    // re-check on-screen state ~4x/sec (cheap), then skip work while off-screen,
    // in a hidden tab, or after a lost GPU context
    if ((this._visTick++ & 15) === 0) this._onScreen = this._checkOnScreen();
    if (document.hidden || !this._onScreen || this._contextLost) { this.clock.getDelta(); return; }
    const dt = Math.min(this.clock.getDelta(), 0.05);   // delta-time, clamped
    this.time += dt;

    // FPS meter (rendered frames only) — refreshed twice a second
    this._fpsFrames++;
    if (nowMs - this._fpsT0 >= 500) {
      this._fps = Math.round((this._fpsFrames * 1000) / (nowMs - this._fpsT0));
      this._fpsFrames = 0; this._fpsT0 = nowMs;
      if (this._statsEl) this._statsEl.textContent = this._fps + ' fps';
    }

    // idle -> sleep timeout
    if (this.power && this.stateName !== 'sleeping' && this.stateName !== 'error') {
      if (performance.now() - this.lastInteraction > this.idleTimeout) this.setState('sleeping');
    }

    // advance profile crossfade
    if (this.blend < 1) this.blend = Math.min(1, this.blend + dt / 0.45);
    const P = this._currentProfile();

    // damped gaze
    this.look.x = THREE.MathUtils.damp(this.look.x, this.lookTarget.x, 6, dt);
    this.look.y = THREE.MathUtils.damp(this.look.y, this.lookTarget.y, 6, dt);

    // talk signal (manual setTalking OR a state that auto-talks)
    const wantTalk = this.talking || this.faceDesc.autoTalk;
    const targetTalk = wantTalk
      ? 0.45 + 0.55 * Math.abs(Math.sin(this.time * 13 + Math.sin(this.time * 7)))
      : 0;
    this.talkVal = THREE.MathUtils.damp(this.talkVal, targetTalk, 18, dt);

    // loading progress auto-fills then loops
    if (this.stateName === 'loading') {
      this.loadingProgress += dt * 0.35;
      if (this.loadingProgress > 1) this.loadingProgress = 0;
    }

    this._updateBlink(dt);

    // ---- base rig pose from idle profile + gaze lean ----
    const breath = Math.sin(this.time * P.bobSpeed) * P.bobAmp;
    const sway = Math.sin(this.time * P.swaySpeed * 0.8) * P.swayAmp;
    let pose = {
      rigX: 0,
      rigY: breath,
      rigZ: 0,
      rigRX: P.lean + this.look.y * -0.14,     // lean toward / track cursor height
      rigRY: this.look.x * 0.22,               // turn toward cursor
      rigRZ: sway + P.tilt,                     // sway + static head-cock
      lArm: { stretch: 0, rotZ: 0, rotX: 0 },
      rArm: { stretch: 0, rotZ: 0, rotX: 0 },
      legWalk: 0,
    };

    // ---- layer one-shots additively, advance & retire them ----
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const sh = this.shots[i];
      sh.t += dt;
      const u = Math.min(1, sh.t / sh.dur);
      const o = sh.fn(u);   // each gesture eases internally over its own u(0..1)
      this._addPose(pose, o);
      if (sh.t >= sh.dur) this.shots.splice(i, 1);
    }

    // ---- commit rig transform (BODY stays rigid; we move the whole rig) ----
    this.rigGroup.position.set(pose.rigX, pose.rigY, pose.rigZ);
    this.rigGroup.rotation.set(pose.rigRX, pose.rigRY, pose.rigRZ);

    // arms + legs
    this.limbs.setArms(pose);
    this.limbs.setWalk(pose.legWalk, this.time);

    // ---- LED color + pulse ----
    const ledColor = this.statusOverride || this.stateLED || '#FF8FB1';
    this.materials.led.emissive.set(ledColor);
    const pulse = 1 + Math.sin(this.time * 4.2) * 0.5 * (P.ledPulse || 0);
    this.materials.led.emissiveIntensity = (this.power ? 2.4 : 0.5) * pulse;

    // ---- draw the face ----
    this.face.draw({
      on: this.power,
      time: this.time,
      bg: this.faceDesc.bg,
      dim: this.faceDesc.dim,
      eyes: this.faceDesc.eyes,
      mouth: this.faceDesc.mouth,
      overlay: this.faceDesc.overlay,
      eyeOpen: this.eyeOpen,
      look: this.look,
      talk: this.talkVal,
      progress: this.loadingProgress,
      flickerRed: this.faceDesc.flickerRed,
      noBlink: this.faceDesc.noBlink,
      art: this.screenArt,
      artColor: this.screenArtColor,
    });
    this.materials.screen.emissiveIntensity = this.power ? (this.faceDesc.dim ? 0.55 : 0.8) : 0.15;

    this._renderBloom();
  }

  // selective-bloom render (layer-based): render ONLY the glowing layer into the
  // half-res bloom buffer, then composite it over the full-res scene render.
  // Falls back to a cheap direct render (with native MSAA) when bloom is off.
  _renderBloom() {
    if (!this.bloomEnabled) { this.renderer.render(this.scene, this.camera); return; }
    this._bgSave = this.scene.background;
    this.scene.background = null;
    const camMask = this.camera.layers.mask;
    this.camera.layers.set(this.BLOOM_LAYER);   // draw only the LED + screen
    this.bloomComposer.render();
    this.camera.layers.mask = camMask;          // restore full view
    this.scene.background = this._bgSave;
    this.finalComposer.render();
  }

  _addPose(p, o) {
    if (!o) return;
    if (o.rigX) p.rigX += o.rigX;
    if (o.rigY) p.rigY += o.rigY;
    if (o.rigZ) p.rigZ += o.rigZ;
    if (o.rigRX) p.rigRX += o.rigRX;
    if (o.rigRY) p.rigRY += o.rigRY;
    if (o.rigRZ) p.rigRZ += o.rigRZ;
    if (o.legWalk) p.legWalk = Math.max(p.legWalk, o.legWalk);
    for (const arm of ['lArm', 'rArm']) {
      if (o[arm]) {
        p[arm].stretch += o[arm].stretch || 0;
        p[arm].rotZ += o[arm].rotZ || 0;
        p[arm].rotX += o[arm].rotX || 0;
      }
    }
  }

  // =====================================================================
  //  resize
  // =====================================================================
  _onResize() {
    const resize = () => {
      const { clientWidth: w, clientHeight: h } = this.container;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      if (this.bloomEnabled) {
        const bw = Math.max(1, Math.floor(w * this.bloomScale));
        const bh = Math.max(1, Math.floor(h * this.bloomScale));
        this.bloomComposer.setSize(bw, bh);
        this.finalComposer.setSize(w, h);
        this.bloom.setSize(bw, bh);
      }
    };
    if ('ResizeObserver' in window) {
      this._ro = new ResizeObserver(resize);
      this._ro.observe(this.container);
    }
    this._on(window, 'resize', resize);
  }
}
