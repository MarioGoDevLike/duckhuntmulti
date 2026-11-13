import * as THREE from 'three';
import { mesh } from '../../core/meshes.js';
// import { mountShotkam } from './shotkam.js'; // SHOTKAM MODEL OFF
import { mats, profile, tube, tubeX, knurl } from './gunKit.js';

/* ======================================================================================================
   Semi-auto — black synthetic waterfowl gun (after the A400-style reference photos)
   ====================================================================================================== */
export function makeSemiAuto() {
  const K = mats(), g = new THREE.Group(), BY = 0.018;           // barrel axis height
  // Barrel: tapered, with an extended, knurled choke.
  mesh(tube(0.0118, 0.0101, 0.69), K.blued, g, 0, BY, -0.585);
  mesh(tube(0.0119, 0.0119, 0.036), K.satin, g, 0, BY, -0.946);
  knurl(g, 0.0123, -0.94, -0.962, BY, K.satin);
  // Vented rib: a thin plate standing on posts, fibre-optic bead at the muzzle, a small mid bead.
  mesh(profile([[0.24, 0.0335], [0.93, 0.0335], [0.93, 0.0362], [0.24, 0.0362]], 0.0075, { bevel: 0.0008, smooth: false }), K.blued, g);
  for (let z = -0.27; z > -0.92; z -= 0.055) mesh(new THREE.BoxGeometry(0.0035, 0.0055, 0.008), K.blued, g, 0, 0.031, z);
  mesh(new THREE.BoxGeometry(0.006, 0.006, 0.014), K.satin, g, 0, 0.039, -0.918);
  mesh(new THREE.SphereGeometry(0.0028, 12, 10), K.fibreRed, g, 0, 0.0405, -0.913);
  mesh(new THREE.SphereGeometry(0.0016, 8, 6), K.steel, g, 0, 0.0375, -0.58);
  // Magazine tube and its knurled cap.
  mesh(tube(0.0105, 0.0105, 0.46), K.blued, g, 0, -0.0095, -0.4);
  mesh(tube(0.0138, 0.0128, 0.034), K.polymer, g, 0, -0.0095, -0.645);
  knurl(g, 0.0141, -0.634, -0.656, -0.0095, K.polymer, 5);
  // Forend: long and rounded, with stippled grip panels on both sides.
  mesh(profile([[0.165, 0.004], [0.3, 0.006], [0.47, 0.004], [0.515, -0.002], [0.522, -0.016], [0.51, -0.03], [0.46, -0.036],
    [0.3, -0.039], [0.18, -0.036], [0.165, -0.018]], 0.054, { bevel: 0.013 }), K.polymer, g);
  for (const x of [-1, 1]) {
    const p = mesh(profile([[0.21, -0.002], [0.45, -0.002], [0.46, -0.026], [0.22, -0.03]], 0.004, { bevel: 0.0012, smooth: false }), K.grip, g);
    p.position.x = x * 0.0268;
  }
  // Receiver: flat-topped, sloping slightly to the rear; ejection port with bolt and cocking handle on the right.
  mesh(profile([[-0.045, 0.019], [0.02, 0.027], [0.165, 0.031], [0.174, 0.024], [0.176, -0.012], [0.165, -0.025], [0.06, -0.029],
    [-0.02, -0.03], [-0.045, -0.024]], 0.047, { bevel: 0.006 }), K.satin, g);
  mesh(profile([[0.03, 0.016], [0.12, 0.018], [0.12, 0.002], [0.03, 0.002]], 0.002, { bevel: 0.0005, smooth: false }), K.gloss, g).position.x = 0.0236;
  mesh(new THREE.BoxGeometry(0.003, 0.011, 0.07), K.steel, g, 0.0238, 0.009, -0.075);
  const handle = mesh(tubeX(0.0042, 0.022), K.steel, g, 0.034, 0.009, -0.098);
  mesh(new THREE.SphereGeometry(0.0055, 12, 10), K.steel, handle, 0.011, 0, 0);
  mesh(new THREE.BoxGeometry(0.002, 0.007, 0.02), K.steel, g, -0.0238, -0.006, -0.03);             // bolt release
  mesh(tubeX(0.0035, 0.052, 12), K.satin, g, 0, -0.03, 0.035);                                       // cross-bolt safety
  // Stock: one moulded piece — comb, pistol grip and the open, adjustable-style butt with its cut-outs.
  const stock = [[-0.04, 0.02], [-0.12, 0.017], [-0.22, 0.019], [-0.33, 0.021], [-0.36, 0.022], [-0.364, -0.02], [-0.36, -0.116],
    [-0.3, -0.112], [-0.2, -0.086], [-0.15, -0.072], [-0.126, -0.104], [-0.1, -0.121], [-0.074, -0.115], [-0.06, -0.082], [-0.048, -0.047], [-0.04, -0.028]];
  mesh(profile(stock, 0.041, {
    bevel: 0.008,
    holes: [[[-0.235, -0.004], [-0.315, 0.002], [-0.318, -0.06], [-0.27, -0.03]], [[-0.225, -0.04], [-0.3, -0.095], [-0.22, -0.078]]],
  }), K.polymer, g);
  mesh(profile([[-0.07, -0.045], [-0.062, -0.08], [-0.075, -0.11], [-0.098, -0.115], [-0.105, -0.08], [-0.09, -0.05]], 0.044, { bevel: 0.004 }), K.grip, g); // grip panel
  mesh(profile([[-0.13, 0.018], [-0.32, 0.022], [-0.322, 0.034], [-0.25, 0.034], [-0.15, 0.031]], 0.036, { bevel: 0.0045 }), K.polymer, g); // cheek riser
  mesh(profile([[-0.358, 0.026], [-0.384, 0.024], [-0.388, -0.05], [-0.384, -0.12], [-0.357, -0.118]], 0.045, { bevel: 0.006 }), K.rubber, g);
  // Trigger guard (a ring with an opening) and a curved trigger blade.
  mesh(profile([[0.032, -0.022], [-0.036, -0.022], [-0.048, -0.036], [-0.02, -0.052], [0.02, -0.047], [0.036, -0.032]], 0.0065,
    { bevel: 0.0012, holes: [[[0.022, -0.028], [-0.03, -0.028], [-0.036, -0.035], [-0.017, -0.044], [0.016, -0.041]]] }), K.polymer, g);
  mesh(profile([[0.005, -0.025], [-0.001, -0.025], [-0.007, -0.034], [-0.005, -0.043], [0.002, -0.037]], 0.004, { bevel: 0.0008 }), K.steel, g);
  // SHOTKAM MODEL OFF (for now): mountShotkam(g, new THREE.Vector3(0, BY, -0.98)); // the barrel camera, near the muzzle
  return g;
}
