// How each quarry flies, and how a shot bird falls. Called once per bird per frame by the game.
import * as THREE from 'three';
import { quarryOf } from '../../config/gameplay.js';
import { rnd, TAU } from '../../core/math.js';
import { groundH } from '../../world/terrain.js';
import { foldWings, toCarcass, lay } from './bird.js';

const UP = new THREE.Vector3(0, 1, 0), ahead = new THREE.Vector3();
const FIELD_EDGE = 200; // m from the line; a bird past it has left the field
const faceAlong = d => d.g.lookAt(ahead.copy(d.g.position).add(d.vel));

// One wingbeat pose for the procedural small birds: arm about `base` ± `amp`, the hand lagging behind it.
function beat(d, base, amp, hand) {
  for (const [a, b] of d.wings) {
    a.position.y = 0; a.scale.z = 1; a.rotation.set(0, 0, base + amp * Math.sin(d.ph)); b.rotation.set(0, 0, hand * Math.sin(d.ph - 1.1));
  }
}

// A live bird, one step. voice: the soundscape while a hunt is on (birds call), else null. True once it has left the field.
export function fly(d, dt, voice) {
  const p = d.g.position;
  if (d.kind === 'finch') {
    // Bounding flight: a burst of quick wingbeats lifts the bird, then it tucks its wings and drops in an arc.
    // The heading weaves from side to side so the flock never flies a straight line.
    const flap = (d.life * d.bhz + d.wob) % 1 < 0.42;
    d.vel.y += ((flap ? 15 : -11) + (d.alt - p.y) * 1.2 - d.vel.y * 0.8) * dt;
    d.vel.applyAxisAngle(UP, Math.sin(d.life * 1.3 + d.weave) * 0.35 * dt);
    p.addScaledVector(d.vel, dt); faceAlong(d);
    d.ph += dt * 17 * TAU;
    if (flap) beat(d, 0.1, 0.9, 0.5); else foldWings(d);
    if (voice && Math.random() < dt * 0.12) voice.chirp(p, rnd(0.5, 1));
  } else if (d.kind === 'thrush') {
    // Fast, direct flight: long runs of quick wingbeats broken by brief closed-wing dips; climbs out of the trees.
    const flap = (d.life * 1.7 + d.wob) % 1 < 0.78;
    d.vel.y += ((flap ? 3 : -7) + (d.alt - p.y) * 1.1 - d.vel.y * 0.9) * dt;
    p.addScaledVector(d.vel, dt); faceAlong(d);
    d.ph += dt * 13 * TAU;
    if (d.rig) { // ease the wings shut for a dip and open again, rather than snapping
      const r = d.rig; r.fold += ((flap ? 0 : 1) - r.fold) * Math.min(1, dt * 16);
      r.pose(Math.sin(d.ph), r.fold);
    } else if (flap) beat(d, 0.15, 0.85, 0.45);
    else foldWings(d);
  } else {
    // Ducks: steady wingbeats, a gentle wander in height, holding between 4 and 30 m.
    d.vel.y += (Math.sin(d.life * 1.1 + d.wob) * 0.9 + (p.y < 4 ? 2 : p.y > 30 ? -2 : 0)) * dt;
    p.addScaledVector(d.vel, dt); faceAlong(d); d.g.rotateZ(Math.sin(d.life * 0.9 + d.wob) * 0.12);
    d.ph += dt * d.hz * TAU;
    for (const [a, b] of d.wings) { a.rotation.z = 0.12 + 0.62 * Math.sin(d.ph); b.rotation.z = 0.5 * Math.sin(d.ph - 1.1); }
    if (voice && Math.random() < dt * 0.05) voice.quack(p, rnd(0.5, 0.9)); // the flock keeps talking
  }
  return Math.hypot(p.x, p.z) > FIELD_EDGE;
}

// A shot bird tumbling down, one step. True on the step it hits the ground (it is then laid there, as a carcass).
export function fall(d, dt) {
  const g = d.g, p = g.position;
  d.vel.y -= 9.8 * dt; d.vel.multiplyScalar(1 - 0.5 * dt); p.addScaledVector(d.vel, dt);
  g.rotateX(d.spin * dt); g.rotateZ(d.spin * 0.6 * dt);
  const rest = quarryOf(d.kind).rest, h = groundH(p.x, p.z) + rest;
  if (p.y >= h) return false;
  d.down = true; d.life = 0; toCarcass(d);
  if (d.rig) { d.rig.fold = 0.6; d.rig.pose(-0.35, 0.6); } // wings slumped part-closed where it fell
  lay(d, h - rest, rnd(0, 6), 1.4);
  return true;
}
