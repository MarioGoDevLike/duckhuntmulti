// A bird in the game: { g, wings, kind, ... } plus, for the loaded thrush, a rig. Everything that changes a
// bird's model or pose regardless of what it is doing (flying, falling, in the bag, in the dog's jaws) lives here.
import * as THREE from 'three';
import { quarryOf } from '../../config/gameplay.js';
import { makeDuck } from './duck.js';
import { makeFinch } from './finch.js';
import { makeThrush } from './thrush.js';
import { makeFinchCarcass, makeMallardModel, makeThrushModel } from './models.js';

// The thrush is the rigged model once it has loaded (d.rig drives its wings); the rest are procedural in flight.
export const makeBird = (kind, male) => ({ ...(kind === 'finch' ? makeFinch(male) : kind === 'thrush' ? makeThrushModel() ?? makeThrush() : makeDuck(male)), kind });

// Wings closed: the arm swings back along the body (a small bird's drops down against the flank) and the hand lies back along it.
export function foldWings(d) {
  if (d.rig) { d.rig.fold = 1; d.rig.pose(0, 1); return; }
  const small = d.kind === 'finch' || d.kind === 'thrush'; // small birds tuck the wings down over the flanks
  for (const [a] of d.wings) {
    // Small birds roll the closed wing onto its edge (about its own length), leading edge up, before swinging it
    // back, and drop it to the flank so it lies against the body; ducks keep it folded flat over the back.
    a.rotation.order = 'ZYX'; a.rotation.set(small ? -1.3 : 0, small ? 1.42 : 1.35, 0); a.position.y = -(d.foldDrop || 0);
    a.scale.z = small ? 0.45 : 1; // feathers stack as the wing closes
  }
}

// Shot: limp, wings half raised as it tumbles.
export function goLimp(d) {
  for (const [a, b] of d.wings) { a.rotation.z = 1.1; b.rotation.z = -0.5; }
  if (d.rig) { d.rig.fold = 0.15; d.rig.pose(0.55, 0.15); }
}

// Once a chaffinch or a duck is down, its procedural model gives way to the real one: the chaffinch scan (already
// lying on its side, so laid flat: lie 0) or the mallard (standing, so laid on its side: lie π/2). The rigged thrush
// needs no swap; it folds its wings. Until a model has loaded (or if it failed) the bird keeps its procedural model.
const CARCASS = { finch: makeFinchCarcass, duck: makeMallardModel };
// Turns the chaffinch scan's upper side toward a viewer looking down -z, head to the left (in the hand, on its card).
export const SCAN_FACE = new THREE.Euler(Math.PI / 2 - 0.35, 0, -Math.PI / 2 - 0.4, 'ZYX');
export function toCarcass(d) {
  if (d.carcass) return;
  const c = CARCASS[d.kind]?.(); if (!c) return;
  d.g.traverse(o => o.geometry?.dispose()); // each procedural bird builds its own geometry; materials are shared kits
  d.g.clear(); c.scale.multiplyScalar(1 / d.g.scale.x); d.g.add(c);
  d.carcass = true; d.wings = []; d.scan = d.kind === 'finch'; d.lie = d.scan ? 0 : Math.PI / 2;
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
