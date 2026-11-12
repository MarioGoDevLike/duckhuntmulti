// Flights of quarry. In a room R is seeded, and every screen must draw the same numbers in the same order to
// fly the same birds — so every R() call below is part of the protocol: don't reorder, add or remove them.
// Cosmetic variation that may differ per screen uses rnd() (Math.random) instead.
import * as THREE from 'three';
import { rnd, TAU } from '../core/math.js';
import { makeBird } from '../entities/birds/bird.js';

const UP = new THREE.Vector3(0, 1, 0);

// o: { Q, map, R, flock, lag, facing (yaw most flights favour), voice (soundscape, or null for silent) }.
export function spawnFlight(o) {
  if (o.Q.kind === 'finch') return finches(o);
  if (o.Q.kind === 'thrush') return thrush(o);
  return ducks(o);
}

// Mallards: singles or V formations, mostly crossing, some incoming overhead.
function ducks({ R, flock, lag, facing, voice }) {
  const rr = (a, b) => a + R() * (b - a);
  const speed = rr(13, 27), n = R() < 0.4 ? 1 : 2 + (R() * 4 | 0);
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  if (R() < 0.72) { // crossing shot
    const side = R() < 0.5 ? 1 : -1;
    p.set(-side * 120, rr(5, 20), -rr(14, 50)); v.set(side, rr(-0.03, 0.03), rr(-0.1, 0.1));
  } else {          // incoming, passing overhead
    p.set(rr(-70, 70), rr(10, 24), -170); v.set(rr(-25, 25) - p.x, 0, 190);
  }
  // Birds can come from any side; most favour where the hunter faces (in a room: the way the line faces).
  const turn = R() < 0.6 ? facing + rr(-1.5, 1.5) : rr(0, TAU);
  p.applyAxisAngle(UP, turn); v.applyAxisAngle(UP, turn);
  v.normalize(); const lat = new THREE.Vector3(-v.z, 0, v.x);
  let d;
  for (let i = 0; i < n; i++) { // V formation
    const k = Math.ceil(i / 2); d = makeBird('duck', R() < 0.6);
    d.g.position.copy(p).addScaledVector(v, -k * 1.6).addScaledVector(lat, (i % 2 ? 1 : -1) * k * 1.2); d.g.position.y += rr(-0.4, 0.4);
    flock.add(d, { vel: v.clone().multiplyScalar(speed), alive: true, down: false, ph: rr(0, 6), hz: 5 + speed * 0.14, life: 0, wob: rr(0, 6) }, d.drake, lag);
  }
  voice?.quack(d.g.position, rnd(0.7, 1));
}

// Chaffinches: one big flock of 4–20 at a time, always out of the front of the line (-z), high up, coming in
// on the left, the right or down the middle and passing over or beside the hunters. The flock weaves as one;
// each bird bounds on its own rhythm inside it.
function finches({ R, flock, lag, voice }) {
  const rr = (a, b) => a + R() * (b - a);
  const speed = rr(11, 15), n = 4 + (R() * 17 | 0), lane = rr(-35, 35), alt = rr(15, 30), weave = rr(0, 6);
  const p = new THREE.Vector3(lane, alt, -115);
  const v = new THREE.Vector3(lane * rr(0.1, 0.6) + rr(-6, 6) - lane, 0, 115).normalize(); // passes near the line
  const lat = new THREE.Vector3(-v.z, 0, v.x);
  let d;
  for (let i = 0; i < n; i++) {
    d = makeBird('finch', R() < 0.55);
    d.g.position.copy(p).addScaledVector(v, -rr(0, 12)).addScaledVector(lat, rr(-6, 6)); d.g.position.y += rr(-2.5, 2.5);
    flock.add(d, { vel: v.clone().multiplyScalar(speed * rr(0.95, 1.05)), alive: true, down: false,
      ph: 0, life: 0, wob: rr(0, 1), bhz: rr(1.9, 2.5), weave, alt: d.g.position.y }, d.drake, lag);
  }
  voice?.chirp(d.g.position, 1);
}

// Thrush: one bird at a time out of the woods, fast and direct. Where from depends on the map (config/maps.js).
function thrush(o) { return o.map === 'pineRidge' ? ridgeThrush(o) : rideThrush(o); }

// Oak Wood Ride: most break from the face of either tree wall (just clear of the edge crowns) 10–40 m ahead and dart
// across the ride at canopy height, a 1–2 s chance; some come straight down the ride at the line.
function rideThrush({ R, flock, lag, voice }) {
  const rr = (a, b) => a + R() * (b - a);
  const d = makeBird('thrush', true), p = new THREE.Vector3(), v = new THREE.Vector3();
  if (R() < 0.78) {
    const side = R() < 0.5 ? 1 : -1;
    p.set(side * rr(10, 12), rr(7, 11), -rr(10, 40)); v.set(-side, 0, rr(-0.25, 0.15));
  } else { p.set(rr(-8, 8), rr(8, 12), -rr(70, 90)); v.set(rr(-0.08, 0.08), 0, 1); }
  d.g.position.copy(p);
  flock.add(d, { vel: v.normalize().multiplyScalar(rr(15, 20)), alive: true, down: false, ph: 0, life: 0, wob: rr(0, 1), alt: rr(7, 12) }, true, lag);
  voice?.tsip(p);
}

// Pine Ridge Pass: rises out of the valley canopy 65–85 m ahead and climbs toward the saddle, higher and faster,
// passing left, right or overhead.
function ridgeThrush({ R, flock, lag, voice }) {
  const rr = (a, b) => a + R() * (b - a);
  const d = makeBird('thrush', true), p = new THREE.Vector3(rr(-50, 50), rr(-10, -5), -rr(65, 85)); // just over the valley canopy
  const v = new THREE.Vector3(rr(-12, 12) - p.x * 0.3, 0, 75).normalize();
  d.g.position.copy(p);
  flock.add(d, { vel: v.multiplyScalar(rr(18, 23)), alive: true, down: false, ph: 0, life: 0, wob: rr(0, 1), alt: rr(8, 18) }, true, lag);
  voice?.tsip(p);
}
