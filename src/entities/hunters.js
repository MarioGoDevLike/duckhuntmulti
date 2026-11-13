// The other hunters in a room: a figure in the line that turns and raises its gun as they look around, and flashes
// when they fire. The figure is assets/models/hunter.glb (built by art-source/blender/hunter.py: camo jacket and
// trousers, cap with a blaze band, cartridge belt, game bag, over/under mounted). Its "Arms" node pivots at the
// shoulder pocket and carries the gun; "Muzzle" marks the muzzle. Until it loads, or if it fails, a box figure stands in.
import * as THREE from 'three';
import { EYE, PITCH_MIN, PITCH_MAX, slotX } from '../config/gameplay.js';
import { sph, box, lambert, part } from '../core/meshes.js';
import { labelSprite } from '../core/textures.js';
import { loadModel, prepareModel } from '../core/gltf.js';
import hunterUrl from '../assets/models/hunter.glb?url';

const { clamp } = THREE.MathUtils;
const HM = { jacket: lambert(0x4b5a36), pants: lambert(0x3b3a30), skin: lambert(0xc99a76), cap: lambert(0xc0621c) };
const metal = new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.7, roughness: 0.4, envMapIntensity: 0.5 });
const wood = new THREE.MeshStandardMaterial({ color: 0x5a3216, roughness: 0.55, envMapIntensity: 0.4 });

let model = null;
const modelReady = loadModel(hunterUrl, 'Hunter').then(gl => {
  if (!gl) return;
  prepareModel(gl.scene);
  model = gl.scene;
});

function figure(name, flashMat) {
  const g = model.clone(), arms = g.getObjectByName('Arms'), muzzle = g.getObjectByName('Muzzle'), gun = g.getObjectByName('OverUnderShotgun');
  const fl = new THREE.Sprite(flashMat); fl.scale.setScalar(0.9); fl.visible = false; muzzle.add(fl);
  const tag = labelSprite([name]); tag.position.y = 2.05; g.add(tag);
  // The lamp, for a hunter who carries it instead of the gun: held where the hands are, along the line the gun would point.
  const along = muzzle.position.clone().sub(gun.position).normalize();
  const lampProp = new THREE.Group(), black = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.065, 0.24, 16), black);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.068, 16), new THREE.MeshBasicMaterial({ color: 0xfff4dc }));
  lens.position.y = 0.121; lens.rotation.x = -Math.PI / 2;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.13), black); grip.position.set(0, -0.02, -0.09);
  lampProp.add(body, lens, grip);
  lampProp.position.copy(gun.position).addScaledVector(along, 0.42); lampProp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), along);
  lampProp.visible = false; arms.add(lampProp);
  return { g, arms, fl, gun, lampProp };
}
// Show the hunter with the lamp, or with the gun.
function carry(h, lamp) {
  if (h.carriesLamp === lamp) return;
  h.carriesLamp = lamp;
  if (h.gun) h.gun.visible = !lamp;
  if (h.lampProp) h.lampProp.visible = lamp;
}

function standIn(name, flashMat) {
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
  return { g, arms, fl };
}

const makeHunter = (name, flashMat) =>
  ({ ...(model ? figure : standIn)(name, flashMat), name, model: !!model, flT: 0, yaw: 0, pitch: 0, shots: 0 });

// The figures stand in `line`, a group the game moves with the party at night (by day it stays at the origin).
// A point light flashes at a figure's muzzle as it fires, so a shot in the dark lights the trees for an instant.
export function createHunters(scene, flashMat) {
  const peers = new Map(), at = new THREE.Vector3(), line = new THREE.Group(); scene.add(line);
  const flashLight = new THREE.PointLight(0xffc27a, 0, 30, 2); line.add(flashLight);
  let gap = 5;
  // Hunters who joined before the model loaded get it now, in the same place and pose.
  modelReady.then(() => {
    if (!model) return;
    for (const [id, h] of peers) {
      if (h.model) continue;
      const m = makeHunter(h.name, flashMat);
      m.g.position.copy(h.g.position); m.g.rotation.copy(h.g.rotation); m.arms.rotation.x = h.arms.rotation.x;
      Object.assign(m, { yaw: h.yaw, pitch: h.pitch, shots: h.shots, flT: h.flT });
      line.remove(h.g); line.add(m.g); peers.set(id, m);
    }
  });
  return {
    line,
    setGap(g) { gap = g; },
    // A hunter's eye, in the world, and where they are looking (eased): for the lamp in another hunter's hand.
    eyeOf(id, out) { const h = peers.get(id); if (!h) return null; out.set(h.g.position.x, EYE, h.g.position.z); line.localToWorld(out); return { yaw: h.g.rotation.y, pitch: h.arms.rotation.x }; },
    // list: [{ id, name, slot, yaw, pitch, shots }] · count: hunters in the line · onShot(world position) for each new shot.
    sync(list, count, onShot) {
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        let h = peers.get(p.id);
        if (!h) { h = makeHunter(p.name, flashMat); h.shots = p.shots || 0; h.g.position.set(slotX(p.slot, count, gap), 0, 0); line.add(h.g); peers.set(p.id, h); }
        carry(h, !!p.holdsLamp);
        h.g.position.x = slotX(p.slot, count, gap);
        h.yaw = p.yaw || 0; h.pitch = clamp(p.pitch || 0, PITCH_MIN, PITCH_MAX);
        if ((p.shots || 0) > h.shots) { h.flT = 0.06; flashLight.position.set(h.g.position.x, EYE, h.g.position.z - 0.8); onShot(line.localToWorld(at.copy(h.g.position).setY(EYE))); }
        h.shots = p.shots || 0;
      }
      for (const [id, h] of peers) if (!seen.has(id)) { line.remove(h.g); peers.delete(id); }
    },
    update(dt) { // ease toward the latest pose; poses arrive about twice a second
      for (const h of peers.values()) {
        const k = Math.min(1, dt * 6);
        h.g.rotation.y += (h.yaw - h.g.rotation.y) * k; h.arms.rotation.x += (h.pitch - h.arms.rotation.x) * k;
        h.fl.visible = (h.flT -= dt) > 0;
      }
      let lit = 0; for (const h of peers.values()) lit = Math.max(lit, h.flT);
      flashLight.intensity = lit > 0 ? 60 : 0;
    },
    clear() { peers.forEach(h => line.remove(h.g)); peers.clear(); line.position.set(0, 0, 0); line.rotation.set(0, 0, 0); gap = 5; },
  };
}
