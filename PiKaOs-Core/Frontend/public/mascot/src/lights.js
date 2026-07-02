/* ============================================================================
   lights.js — soft 3-point studio rig (matte, no reflections).

   The goal is a flat matte-pastel toy read: a gentle key for form, a cool
   fill so the shaded side stays light and friendly, and a pink rim to separate
   the silhouette from the background. No environment map = no reflections.
   ========================================================================== */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export function setupLights(scene, renderer) {
  // ambient floor — gentle; the environment IBL does most of the bright fill
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0e6ff, 0.18));

  // KEY — clean white, upper front-right (modest so bright colours don't clip)
  const key = new THREE.DirectionalLight(0xfff6fa, 0.8);
  key.position.set(4, 6, 6);
  scene.add(key);

  // FILL — cool blue, lower left, lifts the shaded side (kept modest — too bright here washes out
  // the pink RIM kicker below, since the shaded side it's lifting is where the rim edge reads)
  const fill = new THREE.DirectionalLight(0xcfe8ff, 0.15);
  fill.position.set(-6, 1.5, 4);
  scene.add(fill);

  // RIM / back — soft pink kicker for a candy edge
  const rim = new THREE.DirectionalLight(0xffd4e8, 0.6);
  rim.position.set(-2, 4, -6);
  scene.add(rim);

  // environment for soft, even fill (makes pastels pop without blowing everything out). Materials
  // are matte (high roughness) so this reads as illumination, NOT mirror reflection. Was 0.85 — that
  // plus the 3 directional lights on top of it left the whole toy flat/overexposed (2026-07-02).
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.45;

  return { key, fill, rim };
}
