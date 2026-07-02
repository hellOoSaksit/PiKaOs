/* ============================================================================
   Limbs.js — the only parts that are allowed to "squash & stretch".

   ARMS: BMO-style elastic side arms. The body stays rigid; an arm telescopes
   by scaling ONLY a thin tube along its length axis. The hand (a sphere) is a
   separate child that we re-position to the tube's tip each frame, so it never
   distorts. At stretch 0 the arm is short and tucked flush to the body side;
   at stretch 1 it reaches well out.

   LEGS: two stubby capsule legs that swing from the hip for walk-in-place.

   All limb groups are children of the rigGroup (siblings of the rigid body).
   ========================================================================== */
import * as THREE from 'three';

const FLUSH_LEN = 0.30;   // tube length when retracted
const REACH_LEN = 2.55;   // tube length fully extended

export class Limbs {
  constructor(parent, materials) {
    this.mat = materials;
    // Arms and legs removed — keep the API intact so the rig loop is unaffected.
    this.arms = { right: null, left: null };
    this.legs = null;
  }

  // side = +1 (right, extends +X) or -1 (left, extends -X)
  _buildArm(side, parent) {
    const container = new THREE.Group();
    container.position.set(side * 1.04, 0.05, 0.12);
    container.userData.side = side;
    parent.add(container);

    // unit tube along local +Y (0..1), so scale.y telescopes it; rotate to lie
    // along ±X. Tapered slightly for a soft rubber-hose look.
    const tubeGeo = new THREE.CylinderGeometry(0.085, 0.10, 1, 16, 1, false);
    tubeGeo.translate(0, 0.5, 0);                 // base at origin, grows +Y
    const tube = new THREE.Mesh(tubeGeo, this.mat.arm);
    tube.castShadow = true;
    tube.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;  // +Y -> ±X
    container.add(tube);

    // little shoulder cap so the joint reads cleanly against the body
    const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), this.mat.arm);
    container.add(shoulder);

    // hand — NOT scaled, just repositioned to the tube tip
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.165, 18, 14), this.mat.hand);
    hand.castShadow = true;
    container.add(hand);

    container.userData.tube = tube;
    container.userData.hand = hand;
    return container;
  }

  _buildLegs(parent) {
    const group = new THREE.Group();
    group.position.set(0, 0, 0);
    parent.add(group);

    const make = (x) => {
      const hip = new THREE.Group();
      hip.position.set(x, -1.45, 0.02);
      const geo = new THREE.CapsuleGeometry(0.26, 0.5, 6, 14);
      const leg = new THREE.Mesh(geo, this.mat.leg);
      leg.castShadow = true;
      leg.position.y = -0.45;        // hang down from the hip pivot
      hip.add(leg);
      // foot pad
      const foot = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), this.mat.foot);
      foot.scale.set(1.1, 0.6, 1.25);
      foot.position.set(0, -0.78, 0.06);
      hip.add(foot);
      group.add(hip);
      return hip;
    };
    group.userData.right = make(0.46);
    group.userData.left = make(-0.46);
    return group;
  }

  // pose.{lArm,rArm} = { stretch, rotZ, rotX }  — no-op (arms removed)
  setArms(pose) {}

  _setArm(container, p) {
    const stretch = p?.stretch || 0;
    const len = FLUSH_LEN + (REACH_LEN - FLUSH_LEN) * stretch;
    const side = container.userData.side;
    container.userData.tube.scale.y = len;        // telescope tube only
    container.userData.hand.position.x = side * len;  // hand rides the tip (no distort)
    container.rotation.z = p?.rotZ || 0;
    container.rotation.x = p?.rotX || 0;
  }

  // amount 0..1 of walk swing; time drives the cycle  — no-op (legs removed)
  setWalk(amount, time) {}
}
