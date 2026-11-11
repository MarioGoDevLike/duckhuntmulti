// How each quarry flies, and how a shot bird falls. Called once per bird per frame by the game.
import * as THREE from 'three';
import { quarryOf } from '../../config/gameplay.js';
import { rnd, TAU } from '../../core/math.js';
import { groundH } from '../../world/terrain.js';
import { foldWings, poseWings, toCarcass, lay } from './bird.js';

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

/* ---------- Shot birds ----------
   How a bird comes down depends on where the pattern took it (bird space: +z toward the head, ±x out along the wings):
   fold  — the core of the pattern on the body: killed in the air. Limp, it carries on along its line, knocked on by
           the shot and set tumbling by the pellets' off-centre push, then drops against air drag, trailing head-first.
   wing  — the pattern centred out on a wing: the broken wing flops, the other beats on for a moment, and the bird
           spirals down, banked toward the broken side.
   tower — a body hit from behind, short of a clean kill (the lungs): it climbs steeply on beating wings, then dies at
           the top and falls.
   glide — struck lightly by the fringe of a long-range pattern: it sets its wings and sails down at a shallow angle,
           to come down well beyond where it was hit (or die on the way). */
const VT = { finch: 9, thrush: 12, duck: 22 };        // terminal speed of a limp bird, m/s
const KNOCK = { finch: 2.2, thrush: 1.6, duck: 0.5 }; // m/s a close, full pattern adds along the line of the shot
const SPIN = { finch: 1.4, thrush: 1, duck: 0.5 };    // light birds are set spinning harder
const Z = new THREE.Vector3(0, 0, 1), loc = new THREE.Vector3(), axis = new THREE.Vector3(), fwd = new THREE.Vector3();
const tq = new THREE.Quaternion(), rq = new THREE.Quaternion(), m4 = new THREE.Matrix4();
const randomAxis = v => v.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)).normalize();

// The moment a bird is shot. hit: { off, dir, r, u, e } from the shot column, or null for a bird another hunter
// dropped (it folds). Returns how it is coming down: 'fold' | 'wing' | 'tower' | 'glide'.
export function startFall(d, hit) {
  const k = d.kind, v = d.vel;
  const f = d.fall = { mode: 'fold', t: 0, w: new THREE.Vector3(), side: 1, rate: 0, until: 0, climb: 0, sink: 0, turn: 0, hs: 0 };
  v.multiplyScalar(0.92); // it stops driving itself on

  if (hit) {
    const { u, e } = hit, blow = (1 - u) * (0.35 + 0.65 * e); // how much of the pattern struck, and how hard
    // The pattern's centre in bird space, in pattern radii. Shot passing above or below the body takes the beating wings.
    loc.copy(hit.off).applyQuaternion(tq.copy(d.g.quaternion).invert()).divideScalar(hit.r);
    const wingward = Math.max(Math.abs(loc.x), 0.7 * Math.abs(loc.y));
    if (!(u < 0.4 && e > 0.3)) { // the core of a pattern that still has its energy kills outright
      if (wingward > 0.45 && wingward > Math.abs(loc.z)) f.mode = 'wing';
      else if (loc.z < -0.3 && e < 0.6 && Math.random() < 0.45) f.mode = 'tower';
      else if (u > 0.6 && e < 0.45) f.mode = 'glide';
    }
    v.addScaledVector(hit.dir, KNOCK[k] * blow);
    // Pellets striking off the centre of mass set it turning about off × dir, hardest for a half-centred pattern.
    axis.crossVectors(hit.off, hit.dir);
    if (axis.lengthSq() < 1e-8) randomAxis(axis); else axis.normalize();
    f.w.copy(axis).multiplyScalar(SPIN[k] * (1.5 + 9 * u * blow)).addScaledVector(randomAxis(fwd), SPIN[k] * rnd(0, 1.5));
    if (f.mode === 'wing') f.side = Math.abs(loc.x) > 0.15 ? Math.sign(loc.x) : Math.random() < 0.5 ? 1 : -1;
  } else f.w.copy(randomAxis(axis)).multiplyScalar(SPIN[k] * rnd(2, 6));

  if (f.mode === 'wing') { f.rate = rnd(1.6, 3) * (k === 'duck' ? 0.7 : 1); f.until = rnd(0.8, 2); f.hs = rnd(4, 6); }
  else if (f.mode === 'tower') { f.until = rnd(0.9, 1.6); f.climb = rnd(5, 8); }
  else if (f.mode === 'glide') { f.until = rnd(4, 7); f.sink = rnd(2, 3.5); f.turn = rnd(-0.35, 0.35); }
  return f.mode;
}

// Turn the bird, over a moment, to face along its velocity, rolled `roll` about its own length.
function steer(g, v, roll, dt) {
  m4.lookAt(fwd.copy(g.position).add(v), g.position, UP); tq.setFromRotationMatrix(m4);
  tq.multiply(rq.setFromAxisAngle(Z, roll));
  g.quaternion.slerp(tq, Math.min(1, dt * 5));
}
// Hold the horizontal speed near `to`, easing at `rate` per second.
function holdSpeed(v, to, rate, dt) {
  const h = Math.hypot(v.x, v.z); if (h < 1e-3) return;
  const s = (h + (to - h) * Math.min(1, rate * dt)) / h; v.x *= s; v.z *= s;
}
// Killed outright (or dying at the end of a tower or a glide): limp from here to the ground.
function die(f, k) { f.mode = 'fold'; f.w.copy(randomAxis(axis)).multiplyScalar(SPIN[k] * rnd(0.5, 2)); }

// A shot bird coming down, one step. True on the step it hits the ground (it is then laid there, as a carcass).
export function fall(d, dt) {
  const g = d.g, p = g.position, v = d.vel, f = d.fall, k = d.kind, t = (f.t += dt);
  const drag = 9.8 / VT[k] ** 2 * v.length(); // quadratic air drag; a limp bird soon reaches its terminal speed
  if (f.mode === 'fold') {
    v.y -= 9.8 * dt; v.multiplyScalar(Math.max(0, 1 - drag * dt));
    // Tumbling from the shot, slowed by the air, while the airflow slowly turns the trailing body head-first.
    const spd = v.length();
    f.w.multiplyScalar(Math.max(0, 1 - 0.9 * dt));
    if (spd > 1) f.w.addScaledVector(axis.crossVectors(fwd.copy(Z).applyQuaternion(g.quaternion), v).divideScalar(spd), 2.5 * Math.min(1, spd / 8) * dt);
    const wl = f.w.length(); if (wl > 1e-5) g.quaternion.premultiply(tq.setFromAxisAngle(axis.copy(f.w).divideScalar(wl), wl * dt));
    // Limp wings, blown up and flapping in the airflow, harder the faster it falls.
    const a = 0.25 * Math.min(1, spd / VT[k]);
    poseWings(d, Math.min(1, 0.72 + a * Math.sin(t * 19)), 0.2, Math.min(1, 0.72 + a * Math.sin(t * 17 + 2)), 0.2);
  } else if (f.mode === 'wing') {
    const beating = t < f.until;
    v.y -= 9.8 * (beating ? 0.45 : 0.6) * dt; v.multiplyScalar(Math.max(0, 1 - drag * dt)); // what lift is left
    v.applyAxisAngle(UP, f.side * f.rate * Math.min(1, t * 2) * dt); // spiralling in toward the broken wing
    holdSpeed(v, f.hs, 1.2, dt);
    steer(g, v, -f.side * (0.9 + 0.15 * Math.sin(t * 7)), dt); // banked, broken side low
    const broken = [0.6 + 0.35 * Math.sin(t * 11), 0.15], good = [beating ? 0.9 * Math.sin(t * TAU * 8) : 0.25 + 0.1 * Math.sin(t * 5), 0];
    if (f.side > 0) poseWings(d, ...broken, ...good); else poseWings(d, ...good, ...broken);
  } else if (f.mode === 'tower') {
    v.y += (f.climb - v.y) * Math.min(1, 2.5 * dt); holdSpeed(v, 0, 1.2, dt); // straight up, losing its way forward
    steer(g, v, 0, dt);
    const s = Math.sin(t * TAU * 13); poseWings(d, s, 0, s, 0);
    if (t >= f.until) die(f, k);
  } else { // glide
    v.y += (-f.sink - v.y) * Math.min(1, 1.5 * dt); v.applyAxisAngle(UP, f.turn * dt); holdSpeed(v, 6, 0.3, dt);
    steer(g, v, -f.turn * 0.8, dt);
    const s = 0.08 + 0.05 * Math.sin(t * 9); poseWings(d, s, 0, s, 0); // wings set, quivering
    if (t >= f.until) die(f, k);
  }
  p.addScaledVector(v, dt);

  const rest = quarryOf(k).rest, h = groundH(p.x, p.z) + rest;
  if (p.y >= h) return false;
  d.down = true; d.life = 0; toCarcass(d);
  if (d.rig) { d.rig.fold = 0.6; d.rig.pose(-0.35, 0.6); } // wings slumped part-closed where it fell
  // Laid along the way it was travelling; a wing-tipped bird on its broken side, any other on either.
  lay(d, h - rest, Math.atan2(v.x, v.z), 1.4 * (f.mode === 'wing' ? -f.side : Math.random() < 0.5 ? 1 : -1));
  return true;
}
