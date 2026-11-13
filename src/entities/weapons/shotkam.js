// The barrel camera every gun carries (the shotcam's eye, see game/shotcam.js): a matte black tube about 10 cm long
// with its lens toward the muzzle, hung under the barrel on a short clamp with a thumbscrew and the maker's mark on
// the side, after the reference photos of the real thing. Gun space as in gunKit.js: barrels along -z, rib on +y.
import * as THREE from 'three';
import { mesh } from '../../core/meshes.js';
import { canvasTex } from '../../core/textures.js';
import { mats, tube, tubeX, knurl } from './gunKit.js';

const R = 0.0155, LEN = 0.098, CLAMP = 0.007; // body radius and length, clamp height between barrel and body

let local = null;
const kamMats = () => local ||= {
  glass: new THREE.MeshPhysicalMaterial({ color: 0x0a1018, metalness: 0.2, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 }),
  mark: new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true, map: canvasTex(256, 48, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = '#e8e8e8'; g.font = 'bold 30px Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('SHOTKAM', w / 2, h / 2 + 1);
  }) }),
};

// The camera on its clamp, built with the clamp's top (where it meets the barrel) at the origin and the body's
// centre at z = 0.
function makeShotkam() {
  const K = mats(), L = kamMats(), g = new THREE.Group(), cy = -CLAMP - R;
  // Clamp: a saddle under the barrel, the block down to the body, a knurled thumbscrew out to the right, the mark.
  mesh(new THREE.BoxGeometry(0.02, 0.003, 0.03), K.satin, g, 0, -0.0015, 0);
  mesh(new THREE.BoxGeometry(0.016, CLAMP + 0.004, 0.026), K.satin, g, 0, -CLAMP / 2 - 0.002, 0);
  mesh(tubeX(0.0045, 0.006), K.satin, g, 0.011, -0.004, 0);
  mesh(tubeX(0.006, 0.004, 18), K.rubber, g, 0.0155, -0.004, 0);
  mesh(new THREE.PlaneGeometry(0.022, 0.0042), L.mark, g, 0.0081, -CLAMP / 2 - 0.002, 0).rotation.y = Math.PI / 2;
  // Body: the tube, rubber end caps, a recessed lens behind its bezel, and the power button at the back.
  mesh(tube(R, R, LEN * 0.82, 32), K.satin, g, 0, cy, 0);
  mesh(tube(R + 0.0008, R + 0.0008, LEN * 0.09, 32), K.rubber, g, 0, cy, -LEN * 0.455);
  mesh(tube(R + 0.0008, R + 0.0008, LEN * 0.09, 32), K.rubber, g, 0, cy, LEN * 0.455);
  knurl(g, R + 0.0006, -LEN * 0.36, -LEN * 0.3, cy, K.rubber, 3);
  mesh(tube(R * 0.72, R * 0.72, 0.004, 32), K.steel, g, 0, cy, -LEN / 2 - 0.0005);                     // lens bezel
  mesh(new THREE.CircleGeometry(R * 0.6, 32).rotateY(Math.PI), L.glass, g, 0, cy, -LEN / 2 - 0.0026);   // lens, facing the muzzle
  mesh(tube(0.004, 0.004, 0.003, 16), K.steel, g, 0, cy + 0.004, LEN / 2 + 0.0015);                     // power button
  return g;
}

const ray = new THREE.Raycaster(), from = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);

// Hang a camera under the barrel `back` metres behind the muzzle. gun: the gun's group, in gun space and not yet
// placed in a scene. The clamp is set against whatever is lowest there (the barrel, or a magazine tube beneath it),
// found by looking straight up from under the gun. parent: what the barrels move with, if they move (a break action's
// hinge bone), so the camera tips open with them.
export function mountShotkam(gun, muzzle, back = 0.16, parent = null) {
  const z = muzzle.z + back;
  gun.updateMatrixWorld(true);
  ray.set(from.set(0, muzzle.y - 0.3, z), UP); ray.far = 0.3;
  const hit = ray.intersectObject(gun, true)[0];
  const kam = makeShotkam();
  kam.position.set(0.002, hit ? hit.point.y : muzzle.y - 0.012, z);
  gun.add(kam);
  if (parent) { kam.updateMatrixWorld(true); parent.attach(kam); }
  return kam;
}
