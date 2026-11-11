// First-person hands, built from capsules: a trigger hand on the grip and a support hand under the forend.
import * as THREE from 'three';
import { sph, part } from '../../core/meshes.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z), Y_AXIS = V(0, 1, 0);
// A capsule from a to b: one finger segment, a wrist, a forearm.
function capsule(parent, mat, a, b, r) {
  const d = b.clone().sub(a), o = new THREE.Mesh(new THREE.CapsuleGeometry(r, d.length(), 4, 10), mat);
  o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(Y_AXIS, d.normalize()); parent.add(o);
}
const chain = (parent, mat, pts, r0, r1) => pts.slice(1).forEach((p, i) => capsule(parent, mat, pts[i], p, r0 + (r1 - r0) * i / (pts.length - 2 || 1)));
const skin = new THREE.MeshStandardMaterial({ color: 0xc08a68, roughness: 0.62, metalness: 0, envMapIntensity: 0.4 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.95, envMapIntensity: 0.3 });
const cuff = new THREE.MeshStandardMaterial({ color: 0x2c2f22, roughness: 0.95, envMapIntensity: 0.3 });
function forearm(g, wrist, elbow) {
  const d = elbow.clone().sub(wrist);
  capsule(g, skin, wrist, wrist.clone().addScaledVector(d, 0.35), 0.022);
  capsule(g, cuff, wrist.clone().addScaledVector(d, 0.2), wrist.clone().addScaledVector(d, 0.3), 0.034);
  capsule(g, sleeve, wrist.clone().addScaledVector(d, 0.28), elbow, 0.04);
}

// Trigger hand. Frame: origin at the top of the grip, -y down the grip, -z toward the muzzle, +x to the right.
function triggerHand() {
  const g = new THREE.Group();
  part(g, sph, skin, 0.015, 0.046, 0.034, 0.028, -0.045, 0.01);              // back of the hand
  part(g, sph, skin, 0.022, 0.04, 0.017, 0.01, -0.058, 0.03);                // heel of the palm round the back of the grip
  [[0.03, 0.0088], [0.052, 0.0084], [0.073, 0.0074]].forEach(([h, r], i) => { // middle, ring, little finger wrap the grip
    const k = 1 - i * 0.12;
    chain(g, skin, [V(0.03, -h, -0.008), V(0.026, -h, -0.031), V(0.024 - 0.026 * k, -h - 0.002, -0.034), V(0.022 - 0.044 * k, -h - 0.004, -0.02)], r, r * 0.85);
  });
  chain(g, skin, [V(0.03, -0.01, -0.014), V(0.024, 0.0, -0.038), V(0.011, 0.011, -0.054), V(0.001, 0.007, -0.062)], 0.0085, 0.0072); // index on the trigger
  chain(g, skin, [V(0.03, -0.02, 0.02), V(0.024, 0.024, 0.022), V(0.003, 0.036, 0.016), V(-0.018, 0.031, 0.009)], 0.0105, 0.0085); // thumb over the wrist
  forearm(g, V(0.032, -0.075, 0.035), V(0.14, -0.17, 0.4));
  return g;
}

// Support hand. Frame: origin on the forend's axis, palm under it, fingers up the right side, thumb along the left.
export function supportHand() {
  const g = new THREE.Group();
  part(g, sph, skin, 0.03, 0.013, 0.045, 0.002, -0.043, 0.005).rotation.z = 0.3; // palm cupping the forend
  [[-0.03, 0.0088, 1], [-0.01, 0.0088, 1], [0.01, 0.0082, 0.95], [0.028, 0.0072, 0.82]].forEach(([z, r, k]) => {
    chain(g, skin, [V(0.02, -0.036, z), V(0.037, -0.016 * k, z - 0.004), V(0.036, 0.011 * k, z - 0.008), V(0.021, 0.029 * k, z - 0.011)], r, r * 0.85);
  });
  chain(g, skin, [V(-0.012, -0.045, 0.035), V(-0.03, -0.03, 0.012), V(-0.037, -0.012, -0.014), V(-0.036, 0.0, -0.034)], 0.0105, 0.0085);
  forearm(g, V(-0.006, -0.05, 0.05), V(-0.16, -0.27, 0.33));
  return g;
}

// Where the hands go on a gun, in gun space. grip: [x, y, z, tilt] of the trigger hand's frame (tilt about x follows
// the grip's slope); fore: [x, y, z] of the support hand's frame; foreScale shrinks the support hand for a slim forend.
export function poseHands({ trigger, support }, { grip, fore, foreScale = 1 }) {
  trigger.position.set(grip[0], grip[1], grip[2]); trigger.rotation.set(grip[3], 0, 0);
  support.position.set(fore[0], fore[1], fore[2]); support.scale.setScalar(foreScale);
}

// Put both hands on a gun. Returns { trigger, support }, so a gun whose model changes can pose them again.
export function addHands(gunGroup, pose) {
  const hands = { trigger: triggerHand(), support: supportHand() };
  poseHands(hands, pose); gunGroup.add(hands.trigger, hands.support);
  return hands;
}
