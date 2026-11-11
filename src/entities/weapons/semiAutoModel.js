// The semi-auto as a real model: "low poly shotgun" by leoxx300 (Sketchfab, CC-BY-4.0; credited in the menu).
// Until it loads, or if it fails, the procedural gun (semiAuto.js) stays in the hands.
import * as THREE from 'three';
import { loadModel, prepareModel } from '../../core/gltf.js';
import shotgunUrl from '../../assets/models/low_poly_shotgun.glb?url';

// Model frame as loaded: already the gun frame's orientation (barrel along -z, rib on +y), in large units — muzzle at
// z = -2.477, bead (front-sight top) at y = 0.403, trigger at z ≈ 0.94, barrel axis at y ≈ 0.356. Scaled to ~1.3 m
// overall, which also puts the bead as high above the trigger as on the procedural gun; offset so the bead is on the
// aiming line (y 0.0405) and the trigger where the procedural gun's is (z ≈ 0), so the gun sits the same distance from the eye.
const SCALE = 0.265;
const OFFSET = new THREE.Vector3(0, 0.0405 - 0.403 * SCALE, 0.005 - 0.94 * SCALE);
const toGun = (x, y, z) => new THREE.Vector3(x, y, z).multiplyScalar(SCALE).add(OFFSET);

// Resolves to the gun's spec (see viewmodel.js), or null if the model is unavailable.
export const semiAutoModelReady = loadModel(shotgunUrl, 'Semi-auto').then(gl => {
  if (!gl) return null;
  prepareModel(gl.scene);
  gl.scene.scale.setScalar(SCALE); gl.scene.position.copy(OFFSET);
  const gun = new THREE.Group(); gun.add(gl.scene);
  return {
    gun,
    muzzle: toGun(0, 0.356, -2.477),
    port: new THREE.Vector3(0, -0.036, -0.12), // loading port: under the receiver, just ahead of the trigger guard
    // Measured on the model in gun space: behind the trigger is a sloping wrist rather than a pistol grip, so the trigger
    // hand tilts further than on the procedural gun, index finger on the trigger. The forend (z -0.51 … -0.18, 3.8 cm
    // wide) is held in its middle by a slightly smaller support hand, so the fingers wrap its side, not the barrel.
    hands: { grip: [0, -0.016, 0.06, -0.6], fore: [0, -0.006, -0.35], foreScale: 0.88 },
  };
});
