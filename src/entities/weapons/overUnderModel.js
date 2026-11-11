// The over-under as a real model: "Low-Poly CZ Drake" by TastyTony (Sketchfab, CC-BY-4.0; credited in the menu).
// It is rigged: the barrels bone hinges the barrels and forend open, which the reload uses. Until it loads, or if it
// fails, the procedural over-under (overUnder.js) stays in the hands.
import * as THREE from 'three';
import { loadModel, prepareModel } from '../../core/gltf.js';
import drakeUrl from '../../assets/models/low-poly_cz_drake.glb?url';

// Model frame as loaded: muzzle toward +x (x = 458), up +y, in large units — trigger at (-150, 13.7), bead top y = 68.3,
// barrel axes y = 34.3 (bottom) and 54.7 (top), hinge at (-45.2, 32.7), forend x -10 … 156. Turned a quarter about y
// (x → -z: a proper rotation), scaled so the bead is as high above the trigger as on the procedural gun (~1.1 m overall,
// true to the real gun), and offset so the trigger sits where the procedural gun's does — so the aiming pose lines up.
const SCALE = 0.0012;
const TRIGGER_MODEL = new THREE.Vector3(-150, 13.7, 0), TRIGGER_GUN = new THREE.Vector3(0, -0.026, 0);
const TO_GUN = new THREE.Matrix4()
  .makeTranslation(TRIGGER_GUN.x, TRIGGER_GUN.y, TRIGGER_GUN.z)
  .multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2))
  .multiply(new THREE.Matrix4().makeScale(SCALE, SCALE, SCALE))
  .multiply(new THREE.Matrix4().makeTranslation(-TRIGGER_MODEL.x, -TRIGGER_MODEL.y, -TRIGGER_MODEL.z));
const toGun = (x, y, z = 0) => new THREE.Vector3(x, y, z).applyMatrix4(TO_GUN);

const Z = new THREE.Vector3(0, 0, 1), q = new THREE.Quaternion();

// Resolves to the gun's spec (see viewmodel.js), or null if the model is unavailable.
export const overUnderModelReady = loadModel(drakeUrl, 'Over-under').then(gl => {
  if (!gl) return null;
  prepareModel(gl.scene);
  // Its materials are flat, near-black and fully matte, which turns to a silhouette under the game's exposure. Give them
  // a gun's finish instead: blued steel that catches the sky, and oiled walnut (Material.001) a shade warmer.
  gl.scene.traverse(o => {
    if (!o.isMesh) return;
    const m = o.material;
    if (m.name === 'Material.001') { m.color.multiplyScalar(1.8); Object.assign(m, { roughness: 0.45, envMapIntensity: 0.9 }); }
    else Object.assign(m, { metalness: 0.85, roughness: 0.32, envMapIntensity: 1.1 });
  });
  TO_GUN.decompose(gl.scene.position, gl.scene.quaternion, gl.scene.scale);
  const hingeBone = gl.scene.getObjectByName('barrels_01'), rest = hingeBone.quaternion.clone();
  const gun = new THREE.Group(); gun.add(gl.scene);
  return {
    gun,
    muzzle: toGun(470, 34.3),
    barrels: [toGun(0, 34.3).y, toGun(0, 54.7).y], // bottom fires first, then top
    // Breech-face centres when closed, bottom then top: where the tubes' full profile begins (x = -101; the geometry
    // further back is the rib extension and top-lever lugs), on the tube axes measured from their walls (r ≈ 9.5).
    chambers: [toGun(-101, 34.3), toGun(-101, 54.7)],
    // Measured on the model in gun space: trigger hand as on the procedural gun; support hand under the middle of
    // the forend (z -0.13 … -0.34, only ~3.6 cm deep), smaller so the palm meets the wood and the fingers wrap its side.
    hands: { grip: [0, -0.0194, 0.0646, -0.42], fore: [0, 0.004, -0.27], foreScale: 0.8 },
    hinge: toGun(-45.2, 32.7),
    // angle: about the gun's x axis at the hinge, negative drops the barrels. The bone's local z is that axis.
    open(angle) { hingeBone.quaternion.copy(rest).multiply(q.setFromAxisAngle(Z, angle)); },
  };
});
