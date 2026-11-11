// A puff of feathers where a bird is hit, drifting down and fading out.
import * as THREE from 'three';
import { rnd } from '../core/math.js';

const N = 26, LIFE = 2.2; // feathers per burst, seconds
const mat = new THREE.PointsMaterial({ color: 0xe8e2d4, size: 0.07, transparent: true, opacity: 0.9 });

export function createFeatherBursts(scene) {
  const live = [];
  return {
    spawn(p) {
      const pos = new Float32Array(N * 3), vel = [];
      for (let i = 0; i < N; i++) { pos.set([p.x, p.y, p.z], i * 3); vel.push(new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1.5), rnd(-1, 1)).multiplyScalar(rnd(0.5, 3))); }
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts); live.push({ pts, vel, life: LIFE });
    },
    update(dt) {
      for (let i = live.length - 1; i >= 0; i--) {
        const b = live[i], a = b.pts.geometry.attributes.position;
        b.vel.forEach((v, j) => { v.multiplyScalar(1 - 2 * dt); v.y -= 1.2 * dt; a.setXYZ(j, a.getX(j) + v.x * dt, a.getY(j) + v.y * dt, a.getZ(j) + v.z * dt); });
        a.needsUpdate = true;
        if ((b.life -= dt) <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); live.splice(i, 1); }
      }
    },
  };
}
