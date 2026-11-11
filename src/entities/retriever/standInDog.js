// Stand-in until the rigged Labrador (labrador.js) has loaded, and the fallback if it can't.
// Yellow Labrador facing +z, standing on y = 0. Legs pivot at the hip and shoulder so they can gallop; the head
// carries a "mouth" point where a retrieved bird is held. Same shape as makeLabrador: { g, head, mouth, animate }.
import * as THREE from 'three';
import { sph, box, part } from '../../core/meshes.js';

export function makeStandInDog() {
  const coat = new THREE.MeshStandardMaterial({ color: 0xd2a35c, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0xa87a3c, roughness: 0.9 });
  const nose = new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.5 });
  const g = new THREE.Group(), cap = (r, len, mat) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 4, 12), mat);
  const body = cap(0.15, 0.42, coat); body.rotation.x = Math.PI / 2; body.position.set(0, 0.5, 0); g.add(body);
  const chest = cap(0.14, 0.12, coat); chest.position.set(0, 0.52, 0.24); g.add(chest);
  const neck = cap(0.085, 0.16, coat); neck.position.set(0, 0.66, 0.33); neck.rotation.x = 0.7; g.add(neck);
  const head = new THREE.Group(); head.position.set(0, 0.78, 0.42); g.add(head);
  part(head, sph, coat, 0.1, 0.095, 0.11, 0, 0, 0);
  part(head, box, coat, 0.085, 0.075, 0.14, 0, -0.03, 0.1);              // muzzle
  part(head, sph, nose, 0.026, 0.022, 0.02, 0, -0.005, 0.175);
  for (const x of [-1, 1]) {
    part(head, sph, nose, 0.012, 0.012, 0.012, x * 0.055, 0.03, 0.08);    // eyes
    const ear = part(head, box, dark, 0.02, 0.11, 0.075, x * 0.095, -0.03, -0.01); ear.rotation.z = x * 0.18;
  }
  const legs = [];
  for (const [x, z] of [[-0.09, 0.22], [0.09, 0.22], [-0.09, -0.2], [0.09, -0.2]]) {
    const hip = new THREE.Group(); hip.position.set(x, 0.48, z); g.add(hip);
    const leg = cap(0.045, 0.36, coat); leg.position.y = -0.24; hip.add(leg); legs.push(hip);
  }
  const tail = new THREE.Group(); tail.position.set(0, 0.56, -0.34); g.add(tail);
  const t = cap(0.035, 0.3, coat); t.position.set(0, 0, -0.17); t.rotation.x = Math.PI / 2 + 0.5; tail.add(t);
  return {
    g, head, mouth: new THREE.Vector3(0, -0.06, 0.2),
    animate(dt, running, t) { // gallop while running; sit (haunches down, tail sweeping) at rest
      const k = running ? Math.sin(t * 14) : 0;
      legs.forEach((l, i) => { l.rotation.x = running ? k * (i < 2 ? 0.7 : -0.7) : (i < 2 ? 0 : -1.25); });
      body.rotation.x = Math.PI / 2 + (running ? 0 : -0.45); body.position.y = running ? 0.5 + Math.abs(k) * 0.04 : 0.4;
      tail.rotation.y = Math.sin(t * (running ? 8 : 3)) * 0.5;
    },
  };
}
