// One builder for every procedural bird: a lathed body wearing a painted, feather-textured skin, a vertex-coloured
// head, a shaped bill, glossy eyes, tucked legs, and wings made of individual feathers (a covert panel and a row of
// secondaries on the arm, fanned primaries on the hand), plus a fanned tail. Bird space: facing +z.
// Returns { g, wings: [[inner, outer], ...], foldDrop } — inner flaps about z and folds about y, outer is the hand.
import * as THREE from 'three';
import { mesh } from '../../core/meshes.js';
import { featherBack, featherOut, flat, pm, fringed, mix } from './plumage.js';

const { smoothstep } = THREE.MathUtils;

export function buildBird(S) {
  const g = new THREE.Group(), r = S.R;
  // Body
  const body = new THREE.LatheGeometry(S.body.map(([rad, h]) => new THREE.Vector2(rad * r, h * r)), 40).rotateX(Math.PI / 2).scale(1, S.flat ?? 0.93, 1);
  mesh(body, new THREE.MeshStandardMaterial({ map: S.skin, roughness: 0.86, envMapIntensity: 0.55 }), g);
  // Head (vertex-coloured), eyes, bill
  const hr = S.head.r * r, head = new THREE.Group(); head.position.set(0, S.head.y * r, S.head.z * r); g.add(head);
  const hg = new THREE.SphereGeometry(hr, 32, 24).scale(1, 1, S.head.sz ?? 1.08), p = hg.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = S.head.colour(p.getX(i) / hr, p.getY(i) / hr, p.getZ(i) / hr); col.set([k.r, k.g, k.b], i * 3); }
  hg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: S.head.gloss ? 0.35 : 0.8, metalness: S.head.gloss ? 0.25 : 0, envMapIntensity: S.head.gloss ? 1.2 : 0.55 }), head);
  const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  for (const sx of [-1, 1]) {
    if (S.eyeRing) mesh(new THREE.TorusGeometry(hr * 0.2, hr * 0.045, 8, 20).rotateY(Math.PI / 2), pm(S.eyeRing), head, sx * hr * 0.72, hr * 0.2, hr * 0.48);
    mesh(new THREE.SphereGeometry(hr * 0.17, 16, 12), eyeM, head, sx * hr * 0.74, hr * 0.2, hr * 0.48);
  }
  const bill = new THREE.LatheGeometry(S.bill.shape.map(([rad, h]) => new THREE.Vector2(rad * hr, h * hr)), 18).rotateX(Math.PI / 2).scale(S.bill.sx ?? 1, S.bill.sy ?? 1, 1);
  const bc = bill.attributes.position, bcol = new Float32Array(bc.count * 3);
  for (let i = 0; i < bc.count; i++) { const k = mix(S.bill.base, S.bill.tip, smoothstep(bc.getZ(i) / hr, S.bill.split, S.bill.split + 0.25)); bcol.set([k.r, k.g, k.b], i * 3); }
  bill.setAttribute('color', new THREE.BufferAttribute(bcol, 3));
  mesh(bill, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, envMapIntensity: 0.8 }), head, 0, S.bill.y * hr, hr * 0.82);
  // Tail: fanned feathers (outer ones may be a different colour), plus optional extras (a drake's curls).
  const tail = new THREE.Group(); tail.position.set(0, S.tail.y * r, S.tail.z * r); tail.rotation.x = S.tail.tilt ?? -0.08; g.add(tail);
  const tg = featherBack(S.tail.len * r, S.tail.w * r, 0.9);
  for (let i = 0; i < S.tail.n; i++) {
    const t = i / (S.tail.n - 1) - 0.5, outer = Math.abs(t) > 0.38;
    fringed(tail, tg, outer && S.tail.outer ? S.tail.outer : S.tail.mat, S.tail.edge, t * S.tail.spread * r, i * 0.0002, 0, -t * (S.tail.fan ?? 0.5));
  }
  S.tail.extra?.(tail, r);
  // Legs, tucked back under the body.
  if (S.legs) {
    const lm = pm(S.legs, { roughness: 0.6, side: THREE.FrontSide });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.18 * r, -0.62 * r, -0.2 * r); leg.rotation.x = -1.25; g.add(leg);
      mesh(new THREE.CylinderGeometry(0.035 * r, 0.03 * r, 0.42 * r, 8).translate(0, -0.21 * r, 0), lm, leg);
      for (const a of [-0.35, 0, 0.35]) {
        const toe = mesh(new THREE.CylinderGeometry(0.018 * r, 0.01 * r, 0.24 * r, 6).translate(0, -0.12 * r, 0), lm, leg, 0, -0.42 * r, 0);
        toe.rotation.set(-1.2, 0, a);
      }
    }
  }
  // Wings
  const wings = [];
  for (const side of [1, -1]) {
    const sh = new THREE.Group(), inner = new THREE.Group(), outer = new THREE.Group();
    sh.scale.x = side; sh.position.set(side * S.wing.x * r, S.wing.y * r, S.wing.z * r);
    const A = S.wing.arm * r, P = S.wing.hand * r, ch = S.wing.chord * r;
    outer.position.x = A;
    // Arm: covert panel (with any patches), and secondaries hanging back from its trailing edge.
    mesh(flat([[0, ch * 0.45], [A * 0.5, ch * 0.55], [A, ch * 0.42], [A, -ch * 0.15], [A * 0.5, -ch * 0.2], [0, -ch * 0.1]]), S.wing.coverts, inner, 0, 0.0008, 0);
    S.wing.patches?.(inner, A, ch);
    const sg = featherBack(ch * 0.85, A / S.wing.nSec * 1.5, 0.86);
    for (let i = 0; i < S.wing.nSec; i++) fringed(inner, sg, S.wing.secondary, S.wing.secEdge, A * (i + 0.5) / S.wing.nSec, -i * 0.0001, -ch * 0.05, 0.02 * i);
    // Hand: primaries fanned from the leading edge back toward the trailing edge.
    const n = S.wing.nPrim, pg = featherOut(P, ch * 0.42, 0.78);
    for (let i = 0; i < n; i++) {
      const a = 0.06 + (i / (n - 1)) * S.wing.fan, len = 1 - i * 0.045;
      const f = fringed(outer, pg, S.wing.primary, S.wing.primEdge, 0, -i * 0.0002, ch * 0.28 - i * ch * 0.04, a);
      f.scale.x = len; f.scale.z = len;
    }
    mesh(flat([[0, ch * 0.42], [P * 0.45, ch * 0.3], [P * 0.4, -ch * 0.05], [0, -ch * 0.15]]), S.wing.handCoverts ?? S.wing.coverts, outer, 0, 0.001, 0);
    S.wing.under?.(inner, A, ch);
    inner.add(outer); sh.add(inner); g.add(sh); wings.push([inner, outer]);
  }
  g.scale.setScalar(S.scale);
  // foldDrop: how far a closed wing sits below its flight hinge, so the coverts lie on the flank, not above the back.
  return { g, wings, foldDrop: (S.wing.drop ?? 0) * r };
}
