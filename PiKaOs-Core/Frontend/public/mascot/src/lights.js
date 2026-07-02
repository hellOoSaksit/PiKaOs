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
  scene.add(new THREE.HemisphereLight(0xffffff, 0xf0e6ff, 0.3));

  // KEY — clean white, upper front-right (modest so bright colours don't clip)
  const key = new THREE.DirectionalLight(0xfff6fa, 1.0);
  key.position.set(4, 6, 6);
  scene.add(key);

  // FILL — cool blue, lower left, lifts the shaded side
  const fill = new THREE.DirectionalLight(0xcfe8ff, 0.45);
  fill.position.set(-6, 1.5, 4);
  scene.add(fill);

  // RIM / back — soft pink kicker for a candy edge
  const rim = new THREE.DirectionalLight(0xffd4e8, 0.55);
  rim.position.set(-2, 4, -6);
  scene.add(rim);

  // environment for soft, even, BRIGHT fill (makes pastels pop). Materials are
  // matte (high roughness) so this reads as illumination, NOT mirror reflection.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;

  return { key, fill, rim };
}
