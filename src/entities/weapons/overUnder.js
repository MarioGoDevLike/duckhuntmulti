import * as THREE from 'three';
import { mesh } from '../../core/meshes.js';
import { mountShotkam } from './shotkam.js';
import { mats, profile, tube, tubeX, ring, knurl } from './gunKit.js';

const { lerp } = THREE.MathUtils;

/* ======================================================================================================
   Over-under — sporting gun in black/grey laminate (after the DT11-style reference photos)
   ====================================================================================================== */
export const OU_BARRELS = [-0.0055, 0.018];   // bottom and top barrel heights
export function makeOverUnder() {
  const K = mats(), g = new THREE.Group();
  for (const y of OU_BARRELS) {
    mesh(tube(0.0113, 0.0099, 0.745), K.blued, g, 0, y, -0.53);
    mesh(tube(0.0121, 0.0121, 0.03), K.steel, g, 0, y, -0.917);                 // extended choke
    ring(g, 0.0124, 0.005, -0.905, y, K.green);                                  // coloured choke band
    knurl(g, 0.0125, -0.92, -0.93, y, K.steel, 3);
  }
  // Monoblock joining the barrels to the action.
  mesh(profile([[0.152, 0.031], [0.2, 0.031], [0.2, -0.018], [0.152, -0.018]], 0.034, { bevel: 0.004, smooth: false }), K.blued, g);
  // Vented side ribs between the barrels, and a tall vented top rib with a white bead.
  for (let z = -0.25; z > -0.89; z -= 0.05) mesh(new THREE.BoxGeometry(0.02, 0.006, 0.036), K.blued, g, 0, 0.0063, z);
  mesh(profile([[0.2, 0.0345], [0.915, 0.0345], [0.915, 0.0372], [0.2, 0.0372]], 0.008, { bevel: 0.0008, smooth: false }), K.blued, g);
  for (let z = -0.23; z > -0.9; z -= 0.05) mesh(new THREE.BoxGeometry(0.0035, 0.006, 0.007), K.blued, g, 0, 0.0315, z);
  mesh(new THREE.SphereGeometry(0.0029, 12, 10), K.fibreWhite, g, 0, 0.0398, -0.905);
  // Action: deep, with raised side panels outlined in silver, the red badge, hinge pin and top lever.
  mesh(profile([[-0.035, 0.026], [0.0, 0.031], [0.152, 0.031], [0.158, 0.022], [0.158, -0.022], [0.142, -0.034], [0.03, -0.035],
    [-0.035, -0.021]], 0.044, { bevel: 0.0045 }), K.satin, g);
  const panel = [[0.012, 0.021], [0.142, 0.021], [0.145, -0.02], [0.13, -0.027], [0.06, -0.029], [0.012, -0.019]];
  mesh(profile(panel, 0.0462, { bevel: 0.0006 }), K.steel, g);
  mesh(profile(panel.map(([f, y]) => [lerp(0.077, f, 0.94), lerp(-0.004, y, 0.9)]), 0.0478, { bevel: 0.0008 }), K.gloss, g);
  for (const x of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.0012, 0.005, 0.016), K.red, g, x * 0.0242, 0.012, -0.118);
    mesh(new THREE.BoxGeometry(0.001, 0.0012, 0.05), K.steel, g, x * 0.0242, -0.004, -0.08).rotation.x = -0.55;
  }
  mesh(tubeX(0.0062, 0.0475), K.steel, g, 0, -0.019, -0.148);                                         // hinge pin
  mesh(profile([[-0.036, 0.031], [0.012, 0.031], [0.004, 0.0372], [-0.03, 0.0372]], 0.013, { bevel: 0.0015 }), K.satin, g); // top lever
  mesh(new THREE.BoxGeometry(0.008, 0.004, 0.012), K.steel, g, 0, 0.0285, 0.05);                      // safety / selector
  // Forend: long schnabel in laminate, with its iron against the action.
  mesh(profile([[0.165, 0.004], [0.3, 0.006], [0.44, 0.005], [0.472, 0.002], [0.466, -0.014], [0.44, -0.028], [0.3, -0.032],
    [0.175, -0.031], [0.164, -0.016]], 0.05, { bevel: 0.01 }), K.wood, g);
  mesh(profile([[0.158, 0.0], [0.168, 0.0], [0.168, -0.03], [0.158, -0.03]], 0.044, { bevel: 0.003, smooth: false }), K.satin, g);
  // Stock: laminate, pistol grip with palm swell, straight butt; adjustable comb riding on two steel posts.
  const stock = [[-0.035, 0.022], [-0.06, 0.013], [-0.14, 0.011], [-0.34, 0.012], [-0.36, 0.016], [-0.366, -0.02], [-0.36, -0.127],
    [-0.3, -0.117], [-0.2, -0.089], [-0.15, -0.073], [-0.125, -0.105], [-0.1, -0.122], [-0.074, -0.116], [-0.058, -0.08], [-0.045, -0.05], [-0.036, -0.03]];
  mesh(profile(stock, 0.043, { bevel: 0.009 }), K.wood, g);
  mesh(profile([[-0.13, 0.018], [-0.335, 0.021], [-0.335, 0.037], [-0.25, 0.037], [-0.15, 0.033], [-0.133, 0.027]], 0.036, { bevel: 0.0055 }), K.wood, g);
  for (const z of [0.17, 0.3]) mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.012, 10), K.steel, g, 0, 0.017, z);
  mesh(profile([[-0.36, 0.019], [-0.386, 0.017], [-0.39, -0.05], [-0.386, -0.13], [-0.358, -0.128]], 0.046, { bevel: 0.006 }), K.rubber, g);
  mesh(profile([[-0.082, -0.112], [-0.104, -0.12], [-0.11, -0.124], [-0.088, -0.122]], 0.03, { bevel: 0.003 }), K.satin, g); // grip cap
  // Round trigger guard and a single blade trigger.
  const guard = mesh(new THREE.TorusGeometry(0.019, 0.0028, 10, 32).rotateY(Math.PI / 2), K.satin, g, 0, -0.033, -0.03);
  guard.scale.set(1, 0.85, 1.15);
  mesh(profile([[0.004, -0.026], [-0.004, -0.026], [-0.01, -0.036], [-0.007, -0.046], [0.0, -0.039]], 0.004, { bevel: 0.0008 }), K.steel, g);
  mountShotkam(g, new THREE.Vector3(0, OU_BARRELS[1], -0.98)); // the barrel camera, under the bottom barrel
  return g;
}
