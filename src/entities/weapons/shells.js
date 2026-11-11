// 12-gauge shells — a red plastic hull on a brass head — for the hands to load, and the spent hulls thrown clear of
// the gun. Shell space: along z, the crimped nose toward -z (it goes into the gun nose first), the brass rim at +z,
// centred on the shell's middle. Geometry and materials are shared by every shell.
import * as THREE from 'three';
import { rnd } from '../../core/math.js';

const LEN = 0.07, R = 0.0105, HEAD = 0.016; // a 70 mm 12-bore
const hullGeo = new THREE.CylinderGeometry(R, R, LEN - HEAD, 16).rotateX(Math.PI / 2).translate(0, 0, -HEAD / 2);
const headGeo = new THREE.CylinderGeometry(R * 1.02, R * 1.02, HEAD, 16).rotateX(Math.PI / 2).translate(0, 0, LEN / 2 - HEAD / 2);
const rimGeo = new THREE.CylinderGeometry(R * 1.12, R * 1.12, 0.0015, 16).rotateX(Math.PI / 2).translate(0, 0, LEN / 2 - 0.00075);
const hullMat = new THREE.MeshStandardMaterial({ color: 0xa3201a, roughness: 0.55, envMapIntensity: 0.6 });
const brassMat = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3, envMapIntensity: 1 });

export const SHELL_LEN = LEN;

export function makeShell() {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(hullGeo, hullMat), new THREE.Mesh(headGeo, brassMat), new THREE.Mesh(rimGeo, brassMat));
  return g;
}

// Spent hulls in flight, simulated in `parent`'s space (the camera, so they tumble past the shooter's view): gravity,
// spin, gone after a second. A fixed pool, so ejecting never allocates mid-hunt.
export function createSpentHulls(parent, size = 6) {
  const pool = Array.from({ length: size }, () => {
    const s = makeShell(); s.visible = false; parent.add(s);
    return { s, v: new THREE.Vector3(), w: new THREE.Vector3(), t: 0 };
  });
  let next = 0;
  return {
    // pos, vel in parent space; quat: the shell's starting orientation in parent space (default: lying across the view).
    eject(pos, vel, quat) {
      const h = pool[next++ % size];
      h.s.position.copy(pos); if (quat) h.s.quaternion.copy(quat); else h.s.rotation.set(0, Math.PI / 2, 0);
      h.v.copy(vel); h.w.set(rnd(-14, 14), rnd(-6, 6), rnd(8, 22)); h.t = 1;
    },
    update(dt, visible) {
      for (const h of pool) {
        if (h.t <= 0) { h.s.visible = false; continue; }
        h.t -= dt; h.v.y -= 9.8 * dt; h.s.position.addScaledVector(h.v, dt);
        h.s.rotateX(h.w.x * dt); h.s.rotateY(h.w.y * dt); h.s.rotateZ(h.w.z * dt);
        h.s.visible = visible && h.t > 0;
      }
    },
  };
}
