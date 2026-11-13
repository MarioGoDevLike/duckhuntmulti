// How each quarry flies, and how a shot bird falls. Called once per bird per frame by the game.
import * as THREE from 'three';
import { quarryOf, DOVE, WOODCOCK } from '../../config/gameplay.js';
import { rnd, TAU } from '../../core/math.js';
import { groundH } from '../../world/terrain.js';
import { foldWings, poseWings, toCarcass, lay } from './bird.js';

const UP = new THREE.Vector3(0, 1, 0), ahead = new THREE.Vector3();
const FIELD_EDGE = 200; // m from the line; a bird past it, flying on away, has left the field
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
  if (d.kind === 'woodcock') woodcock(d, dt, voice);
  else if (d.kind === 'dove') dove(d, dt, voice);
  else if (d.kind === 'finch') {
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
  return d.landed || d.gone || (Math.hypot(p.x, p.z) > FIELD_EDGE && p.x * d.vel.x + p.z * d.vel.z > 0); // (not one still coming in)
}

/* ---------- Mourning dove ----------
   Fast (13–17 m/s) on steady, quick wingbeats, holding its line with a gentle weave, and every few seconds a jink —
   a swerve, often dropping a little, sometimes lifting. The jinks are drawn when it is
   spawned (game/spawner.js), seeded in a room, so every screen sees the same dodges. The first time it comes within its
   spotting range of a hunter (or, hunting alone, is shot at) it flares: swings hard away from the gun, climbs and
   puts on speed. Birds coming in to feed or drink set their wings and glide down onto the spot, and are gone once
   down in the crop or at the water. Bird state (see spawner): spd, hz, alt, wob, wf, jinks [{ t, yaw, dur, dip }],
   spot, fyaw, fclimb, line (hunters' x along z = 0), land ({ x, z } or null), bank, flare, scare, clock and acc (its fixed
   clock: acc starts at the flight's lag), yawNow/dipNow/glideNow (the last step, for the pose); course (set here). */
const { clamp } = THREE.MathUtils;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
// Dove flight runs on its own fixed clock (clock, acc), so every screen in a room steps it identically whatever its
// frame rate: a flare or a jink caught a frame earlier on one screen would otherwise send its copy somewhere else.
const DOVE_STEP = 1 / 120;
function dove(d, dt, voice) {
  d.acc += dt;
  while (d.acc >= DOVE_STEP && !d.landed) { d.acc -= DOVE_STEP; doveStep(d, DOVE_STEP, voice); }
  // Banked into the turn (left wing down to turn left), eased so a jink rolls it rather than snapping it over.
  d.bank += (clamp(-d.yawNow * 0.5, -1.2, 1.2) - d.bank) * Math.min(1, dt * 9);
  faceAlong(d); d.g.rotateZ(d.bank);
  // Steady beats, quicker as it flares; wings set for the glide in; snapped half shut for a hard drop.
  d.ph += dt * d.hz * TAU * (d.flare && d.clock - d.flare.t < 1.2 ? 1.3 : 1);
  if (d.rig) {
    const r = d.rig; r.fold += ((d.dipNow < -2.5 ? 0.55 : 0) - r.fold) * Math.min(1, dt * 14);
    r.pose(d.glideNow ? 0.12 + 0.04 * Math.sin(d.clock * 9) : Math.sin(d.ph), r.fold);
  } else if (d.glideNow) beat(d, 0.15, 0.03, 0.02);
  else beat(d, 0.15, 0.85, 0.45);
}
function doveStep(d, dt, voice) {
  const p = d.g.position, v = d.vel, t = (d.clock += dt);
  if (d.flare) { // already flared: a shot (alone) only sends it into another jink
    if (d.scare) d.jinks.push({ t, yaw: rnd(-0.4, 0.4), dur: 0.5, dip: rnd(-2, 0.5) });
  } else {
    let near = null, best = Infinity;
    if (p.y < 28) for (const x of d.line) { const r = Math.hypot(p.x - x, p.z); if (r < best) { best = r; near = x; } }
    if (d.scare || best < d.spot) { // swings away from the hunter it saw (+yaw turns left; side < 0: the hunter is on its left)
      const side = Math.sign(v.x * (0 - p.z) - v.z * ((near ?? 0) - p.x)) || 1;
      d.flare = { t, yaw: side * d.fyaw }; d.land = null; d.alt = p.y + d.fclimb;
      voice?.whistle(p);
    }
  }
  d.scare = false;

  // It holds the line of its flyway (course), weaving about it and swinging back onto it after every jink.
  const heading = Math.atan2(v.x, v.z);
  d.course ??= heading;
  let yaw = DOVE.weave * Math.sin(t * d.wf + d.wob), dip = 0, spd = d.spd, glide = false; // never quite straight
  for (const j of d.jinks) if (t >= j.t && t < j.t + j.dur) { yaw += j.yaw / j.dur; dip += j.dip; }
  if (d.flare) {
    const k = t - d.flare.t;
    if (k < 0.7) { yaw += d.flare.yaw / 0.7; dip += 2; } else if (!d.flare.on) { d.flare.on = true; d.course = heading; } // its new line, away from the gun
    spd += DOVE.flare.speed * Math.min(1, k * 2);
  }
  if (!d.land && (!d.flare || d.flare.on)) yaw += clamp(wrap(d.course - heading) * 1.2, -0.9, 0.9);
  if (d.land) { // turning onto the spot, then wings set, gliding down onto it
    const dx = d.land.x - p.x, dz = d.land.z - p.z, dist = Math.hypot(dx, dz), ground = groundH(p.x, p.z);
    yaw += clamp(wrap(Math.atan2(dx, dz) - heading) * 1.6, -1.4, 1.4);
    if (dist < DOVE.landGlide) { glide = true; d.alt = ground + 0.3 + dist * 0.2; spd = Math.min(spd, 7 + dist * 0.18); }
    if (dist < 2.5 || p.y < ground + 0.9) d.landed = true; // down in the crop, or at the water's edge
  }
  v.y += (clamp((d.alt - p.y) * 0.9, -5, 4) + dip - v.y) * Math.min(1, dt * 4);
  v.applyAxisAngle(UP, yaw * dt); holdSpeed(v, spd, 1.5, dt);
  p.addScaledVector(v, dt);
  const floor = groundH(p.x, p.z) + 0.6; if (p.y < floor) { p.y = floor; v.y = Math.max(0, v.y); }
  d.yawNow = yaw; d.dipNow = dip; d.glideNow = glide;
}

/* ---------- Woodcock ----------
   Sits tight, unseen, until the dog has pointed it `hold` s (or a shot frightens it), then bursts out of the cover on
   whirring wings: towers almost straight up to clear the undergrowth, then away low under the canopy, fast, zig-zagging
   between the trunks, and is lost in the wood `away` m out. Bird state (see spawner): hidden, hunter (its hunter's x),
   hold, head (escape heading), tower, spd, alt, zigs [{ t, yaw }] (after the flush), bank, clock, acc, scare, gone.
   Fixed clock, as the dove's, so every screen in a room sees the same zig-zags. */
const WC_STEP = 1 / 120;
function woodcock(d, dt, voice) {
  d.acc += dt;
  while (d.acc >= WC_STEP) { d.acc -= WC_STEP; woodcockStep(d, WC_STEP, voice); }
  if (d.hidden) { foldWings(d); return; }
  faceAlong(d); d.g.rotateZ(d.bank);
  d.ph += dt * (d.vel.y > 3 ? 17 : 13) * TAU; // a fast, whirring beat as it climbs out
  beat(d, 0.25, 0.95, 0.55);
}
function woodcockStep(d, dt, voice) {
  const p = d.g.position, v = d.vel, t = (d.clock += dt), W = WOODCOCK;
  if (d.hidden) {
    if (t < d.hold && !d.scare) return;
    d.hidden = false; d.g.visible = true; d.flushT = t; d.base = p.y;
    v.set(Math.sin(d.head), 0, Math.cos(d.head)).multiplyScalar(1.5).setY(W.climb);
    voice?.flush(p); return;
  }
  const k = t - d.flushT, towering = p.y < d.base + d.tower && k < 1.4;
  let h = d.head; for (const z of d.zigs) if (k >= z.t) h += z.yaw; // each zig swings it the other way
  const hs = towering ? 1.5 : d.spd, e = Math.min(1, dt * (towering ? 4 : 6));
  const turn = wrap(h - Math.atan2(v.x, v.z));
  v.x += (Math.sin(h) * hs - v.x) * e; v.z += (Math.cos(h) * hs - v.z) * e;
  v.y += ((towering ? W.climb : clamp((d.base + d.alt - p.y) * 1.5, -3, 3)) - v.y) * Math.min(1, dt * 6);
  d.bank += (clamp(-turn * 1.4, -1, 1) - d.bank) * Math.min(1, dt * 10);
  p.addScaledVector(v, dt);
  d.gone = Math.hypot(p.x - d.hunter, p.z) > W.away;
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
const VT = { finch: 9, thrush: 12, dove: 13, woodcock: 12, duck: 22 };        // terminal speed of a limp bird, m/s
const KNOCK = { finch: 2.2, thrush: 1.6, dove: 1.4, woodcock: 1.4, duck: 0.5 }; // m/s a close, full pattern adds along the line of the shot
const SPIN = { finch: 1.4, thrush: 1, dove: 1, woodcock: 1, duck: 0.5 };    // light birds are set spinning harder
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
