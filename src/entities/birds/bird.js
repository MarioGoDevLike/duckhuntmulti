// A bird in the game: { g, wings, kind, ... } plus, for the loaded thrush, a rig. Everything that changes a
// bird's model or pose regardless of what it is doing (flying, falling, in the bag, in the dog's jaws) lives here.
import * as THREE from 'three';
import { quarryOf } from '../../config/gameplay.js';
import { makeDuck } from './duck.js';
import { makeFinch } from './finch.js';
import { makeThrush } from './thrush.js';
import { makeWoodcock } from './woodcock.js';
import { makeFinchCarcass, makeMallardModel, makeThrushModel, makeDoveModel, makeDoveCarcass, makeWoodcockModel } from './models.js';

// The thrush and the dove are rigged models once loaded (d.rig drives their wings); the rest are procedural in flight.
// Until the dove has loaded (or if it fails) a procedural thrush, a little larger, stands in for it.
const doveStandIn = () => { const d = makeThrush(); d.g.scale.multiplyScalar(1.1); return d; };
// Procedural birds are built once per sex and cloned: clones share geometry and materials (see toCarcass).
const built = new Map();
const shared = (kind, build) => male => {
  const k = kind + !!male;
  if (!built.has(k)) built.set(k, build(male));
  const t = built.get(k), g = t.g.clone();
  return { g, wings: t.wings.map((_, i) => [g.getObjectByName(`wi${i}`), g.getObjectByName(`wo${i}`)]), foldDrop: t.foldDrop, shared: true };
};
const MAKE = {
  finch: shared('finch', makeFinch),
  thrush: () => makeThrushModel() ?? makeThrush(),
  dove: () => makeDoveModel() ?? doveStandIn(),
  woodcock: shared('woodcock', makeWoodcock),
};
export const makeBird = (kind, male) => ({ ...(MAKE[kind] ?? makeDuck)(male), kind });

// Wings closed: the arm swings back along the body (a small bird's drops down against the flank) and the hand lies back along it.
export function foldWings(d) {
  if (d.rig) { d.rig.fold = 1; d.rig.pose(0, 1); return; }
  for (const [a] of d.wings) foldWing(d, a);
}
function foldWing(d, a) {
  const small = d.kind !== 'duck'; // small birds tuck the wings down over the flanks
  // Small birds roll the closed wing onto its edge (about its own length), leading edge up, before swinging it
  // back, and drop it to the flank so it lies against the body; ducks keep it folded flat over the back.
  a.rotation.order = 'ZYX'; a.rotation.set(small ? -1.3 : 0, small ? 1.42 : 1.35, 0); a.position.y = -(d.foldDrop || 0);
  a.scale.z = small ? 0.45 : 1; // feathers stack as the wing closes
}

// Each wing on its own, for a shot bird: stroke −1 (down) … 0 (spread level) … 1 (raised), fold 0 (open) … 1 (closed).
// The first pair is the wing on the bird's +x side, the second the −x wing. A procedural wing opens or closes outright;
// an open one's hand droops as the arm is raised, as a limp wing does in the airflow.
export function poseWings(d, sx, fx, s2, f2) {
  if (d.rig) { d.rig.fold = Math.max(fx, f2); d.rig.pose(sx, fx, s2, f2); return; }
  const duck = d.kind === 'duck', base = duck ? 0.12 : 0.15, amp = duck ? 0.62 : 0.85, hand = duck ? 0.5 : 0.45;
  d.wings.forEach(([a, b], i) => {
    const s = i ? s2 : sx, f = i ? f2 : fx; // wings[0] is the +x wing (see buildBird)
    if (f > 0.5) { foldWing(d, a); return; }
    a.position.y = 0; a.scale.z = 1; a.rotation.set(0, 0, base + amp * s);
    b.rotation.set(0, 0, hand * s * 0.5 - 0.9 * Math.max(0, s - 0.4));
  });
}

// Once a chaffinch, a duck, a dove or a woodcock (the standing scan, laid on its side) is down, its flying model gives way to the real one: the chaffinch scan (already
// lying on its side, so laid flat: lie 0), the mallard (standing, so laid on its side: lie π/2) or the perched dove
// (wings closed; laid on its side or back as it falls, like the rigged thrush). The thrush needs no swap; it folds its
// wings. Until a model has loaded (or if it failed) the bird keeps its flying model.
const CARCASS = { finch: makeFinchCarcass, duck: makeMallardModel, dove: makeDoveCarcass, woodcock: makeWoodcockModel };
const LIE = { finch: 0, duck: Math.PI / 2, woodcock: Math.PI / 2 }; // a model that only lies one way (the woodcock scan stands: on its side)
// Turns the chaffinch scan's upper side toward a viewer looking down -z, head to the left (in the hand, on its card).
export const SCAN_FACE = new THREE.Euler(Math.PI / 2 - 0.35, 0, -Math.PI / 2 - 0.4, 'ZYX');
export function toCarcass(d) {
  if (d.carcass) return;
  const c = CARCASS[d.kind]?.(); if (!c) return;
  if (!d.rig && !d.shared) d.g.traverse(o => o.geometry?.dispose()); // shared clones (and rigged ones) keep their geometry
  d.g.clear(); c.scale.multiplyScalar(1 / d.g.scale.x); d.g.add(c);
  d.carcass = true; d.wings = []; d.rig = null; d.scan = d.kind === 'finch'; d.lie = LIE[d.kind];
}

// Rest a downed bird on the ground (ground height y0) heading `yaw`, rolled `roll` onto a side or its back (a model
// with its own way of lying overrides that). Procedural birds sit up by their `rest`; models on their lowest point.
const restBox = new THREE.Box3(), tmpV = new THREE.Vector3();
export function lay(d, y0, yaw, roll) {
  const g = d.g; g.rotation.set(0, yaw, d.lie ?? roll);
  if (!d.carcass && !d.rig) { g.position.y = y0 + quarryOf(d.kind).rest; return; }
  g.position.y = 0; g.updateMatrixWorld(true);
  g.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); }); // the cached bounds are of an earlier pose
  const parentY = g.parent ? g.parent.getWorldPosition(tmpV).y : 0;
  g.position.y = y0 - (restBox.setFromObject(g, true).min.y - parentY);
}
