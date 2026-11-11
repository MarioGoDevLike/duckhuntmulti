// The other hunters in a room: a simple figure in the line that turns and raises its gun as they look around,
// and flashes when they fire.
import * as THREE from 'three';
import { EYE, PITCH_MIN, PITCH_MAX, slotX } from '../config/gameplay.js';
import { sph, box, lambert, part } from '../core/meshes.js';
import { labelSprite } from '../core/textures.js';

const { clamp } = THREE.MathUtils;
const HM = { jacket: lambert(0x4b5a36), pants: lambert(0x3b3a30), skin: lambert(0xc99a76), cap: lambert(0xc0621c) };
const metal = new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.7, roughness: 0.4, envMapIntensity: 0.5 });
const wood = new THREE.MeshStandardMaterial({ color: 0x5a3216, roughness: 0.55, envMapIntensity: 0.4 });

function makeHunter(name, flashMat) {
  const g = new THREE.Group(), arms = new THREE.Group();
  part(g, box, HM.pants, 0.3, 0.8, 0.22, 0, 0.4, 0);
  part(g, box, HM.jacket, 0.44, 0.62, 0.27, 0, 1.11, 0);
  part(g, sph, HM.skin, 0.1, 0.12, 0.1, 0, 1.56, 0);
  part(g, box, HM.cap, 0.21, 0.07, 0.23, 0, 1.66, 0.01);
  part(g, box, HM.cap, 0.19, 0.015, 0.1, 0, 1.63, -0.14);
  arms.position.set(0.1, 1.4, -0.05); g.add(arms);
  part(arms, box, HM.jacket, 0.1, 0.1, 0.42, -0.06, -0.06, -0.2);
  part(arms, box, metal, 0.035, 0.04, 1.05, 0, 0, -0.45);
  part(arms, box, wood, 0.045, 0.07, 0.3, 0, -0.03, 0.12);
  const fl = new THREE.Sprite(flashMat); fl.scale.setScalar(0.9); fl.position.set(0, 0, -1.02); fl.visible = false; arms.add(fl);
  const tag = labelSprite([name]); tag.position.y = 2.05; g.add(tag);
  return { g, arms, fl, flT: 0, yaw: 0, pitch: 0, shots: 0 };
}

export function createHunters(scene, flashMat) {
  const peers = new Map(), at = new THREE.Vector3();
  return {
    // list: [{ id, name, slot, yaw, pitch, shots }] · count: hunters in the line · onShot(position) for each new shot.
    sync(list, count, onShot) {
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        let h = peers.get(p.id);
        if (!h) { h = makeHunter(p.name, flashMat); h.shots = p.shots || 0; h.g.position.set(slotX(p.slot, count), 0, 0); scene.add(h.g); peers.set(p.id, h); }
        h.yaw = p.yaw || 0; h.pitch = clamp(p.pitch || 0, PITCH_MIN, PITCH_MAX);
        if ((p.shots || 0) > h.shots) { h.flT = 0.06; onShot(at.copy(h.g.position).setY(EYE)); }
        h.shots = p.shots || 0;
      }
      for (const [id, h] of peers) if (!seen.has(id)) { scene.remove(h.g); peers.delete(id); }
    },
    update(dt) { // ease toward the latest pose; poses arrive about twice a second
      for (const h of peers.values()) {
        const k = Math.min(1, dt * 6);
        h.g.rotation.y += (h.yaw - h.g.rotation.y) * k; h.arms.rotation.x += (h.pitch - h.arms.rotation.x) * k;
        h.fl.visible = (h.flT -= dt) > 0;
      }
    },
    clear() { peers.forEach(h => scene.remove(h.g)); peers.clear(); },
  };
}
