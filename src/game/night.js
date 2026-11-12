// The night hunt on the Projector Field. Thrushes come in out of the dark to the lone olive and circle it, seen only
// where the projectors' beams (and the lamp) light them. Every shot frightens them: each one climbs higher, and after
// enough it leaves. A bird that is hit falls in the dark and counts only once the lamp has found it on the ground.
//
// Every screen flies the same birds: a bird's path follows from the seed, its age and how often it was frightened.
// What changes that is sent to the room as events — emit(ev) applies it here and hands it on (onEvent); the others
// apply(ev) it:  { t: 'spook' } from the screen that fired (every bird in the air climbs), { t: 'found', id } from
// the lamper's screen (the authority on finding birds).
import * as THREE from 'three';
import { NIGHT } from '../config/gameplay.js';
import { TAU } from '../core/math.js';
import { makeBird } from '../entities/birds/bird.js';

const C = NIGHT.circle;
const v = new THREE.Vector3(), ahead = new THREE.Vector3();

// hooks: { flock, lamp, audio() (the soundscape, or null), onEvent(ev) (to the room), onFound(bird) }.
export function createNight(hooks) {
  const { flock, lamp } = hooks;
  let centre = new THREE.Vector3(), authority = false, arrivals = [], next = 0;
  const found = [];

  /* ---------- a bird's path ---------- */
  // In: a straight run from far out in the dark to its place on the circle. Circle: round the tree, the radius
  // breathing in and out, at a height that rises with every fright. Out: away and up, gone.
  function place(d, dt) {
    const n = d.n, t = d.life, p = d.g.position;
    n.alt += (C.alt[0] + n.alt0 + n.level * C.climb - n.alt) * Math.min(1, dt * 0.7);
    if (n.phase === 'in') {
      const u = Math.min(1, t / n.tIn);
      p.lerpVectors(n.from, n.entry, u); p.y += (n.alt - n.entry.y) * u;
      d.vel.subVectors(n.entry, n.from).divideScalar(n.tIn);
      if (u >= 1) n.phase = 'circle';
    } else if (n.phase === 'circle') {
      const tau = t - n.tIn, th = n.th0 + n.w * tau, r = n.r + 3 * Math.sin(0.6 * tau + n.ph);
      p.set(centre.x + Math.cos(th) * r, n.alt, centre.z + Math.sin(th) * r);
      d.vel.set(-Math.sin(th) * r * n.w, 0, Math.cos(th) * r * n.w);
      if (n.level >= C.leaveAfter || tau > C.max) { // frightened off, or done looking: away into the dark
        n.phase = 'out'; n.tOut = t;
        d.vel.normalize().multiplyScalar(NIGHT.outSpeed).addScaledVector(v.set(p.x - centre.x, 0, p.z - centre.z).normalize(), 6);
        d.vel.y = NIGHT.outSpeed * 0.5;
      }
    } else p.addScaledVector(d.vel, dt);
    return n.phase === 'out' && t - n.tOut > 9;
  }

  // One bird from its arrival record (all of it from the seed, so the same on every screen).
  function spawn(a, lag) {
    const d = makeBird('thrush', true), r = a.r, th0 = a.a + a.side * 0.6;
    const entry = new THREE.Vector3(centre.x + Math.cos(th0) * r, C.alt[0] + a.alt0, centre.z + Math.sin(th0) * r);
    const from = new THREE.Vector3(centre.x + Math.cos(a.a) * 150, entry.y + 18, centre.z + Math.sin(a.a) * 150);
    d.n = { phase: 'in', from, entry, tIn: from.distanceTo(entry) / NIGHT.inSpeed, th0, r, w: a.w * a.side, ph: a.ph,
      alt0: a.alt0, alt: entry.y, level: 0, tOut: 0, found: false, findT: 0 };
    d.g.position.copy(from);
    flock.add(d, { vel: new THREE.Vector3(), alive: true, down: false, ph: a.ph, life: lag, wob: a.ph }, true, 0);
    hooks.audio()?.alarm(entry, 0.5); // its thin call, out of the dark
  }

  /* ---------- events ---------- */
  function apply(ev) {
    if (ev.t === 'spook') { for (const d of flock.birds) if (d.n && d.alive) d.n.level++; return; }
    const d = flock.birds.find(b => b.id === ev.id && b.n); if (!d) return;
    if (ev.t === 'found' && !d.n.found) { // counted even if here it is still falling: every screen keeps the same bag
      d.n.found = true; found.push(d.id); hooks.onFound(d); flock.removeWhere(b => b === d);
    }
  }
  const emit = ev => { apply(ev); hooks.onEvent?.(ev); };

  return {
    found, apply,
    // map: the night map (its tree is the centre the birds circle) · R: the round's seed · isAuthority: the lamper's screen.
    start(map, R, isAuthority) {
      centre.set(map.tree.x, 0, map.tree.z); authority = isAuthority; found.length = 0; next = 0;
      // Every R() call below is part of the room's protocol: same order on every screen.
      arrivals = [];
      for (let at = NIGHT.first; at < NIGHT.time - NIGHT.dawn; at += NIGHT.arrivals[0] + R() * (NIGHT.arrivals[1] - NIGHT.arrivals[0])) {
        const n = R() < 0.25 ? 2 : 1, a = R() * TAU;
        for (let i = 0; i < n; i++) arrivals.push({ at: at + i * 1.2, a: a + i * 0.15, side: R() < 0.5 ? 1 : -1,
          r: C.r[0] + R() * (C.r[1] - C.r[0]), alt0: R() * (C.alt[1] - C.alt[0]), w: C.w[0] + R() * (C.w[1] - C.w[0]), ph: R() * TAU });
      }
    },
    // A live night bird, one step: its place on its path, its wings. True once it has gone.
    step(d, dt) {
      const gone = place(d, dt);
      d.g.lookAt(ahead.copy(d.g.position).add(d.vel));
      d.ph += dt * 13 * TAU;
      const glide = d.n.phase === 'circle' && (d.life * 0.6 + d.wob) % 1 < 0.35; // circling, it sets its wings now and then
      if (d.rig) { const r = d.rig; r.fold += ((glide ? 0 : (d.life * 1.7) % 1 < 0.8 ? 0 : 1) - r.fold) * Math.min(1, dt * 14); r.pose(glide ? 0.1 : Math.sin(d.ph), r.fold); }
      return gone;
    },
    // We fired: every bird in the air takes fright and climbs (sent to the room).
    spook() { emit({ t: 'spook' }); },
    killed(d) { if (d.n) d.n.phase = 'dead'; },
    update(dt, elapsed) {
      while (next < arrivals.length && elapsed >= arrivals[next].at) { const a = arrivals[next++]; spawn(a, elapsed - a.at); }
      if (!authority) return;
      for (const d of flock.birds) { // the lamp held on a downed bird finds it
        const n = d.n; if (!n || d.alive || !d.down || n.found) continue;
        const near = d.g.position.distanceTo(lamp.origin) < NIGHT.findR && lamp.dazzleAt(d.g.position) > 0.02;
        n.findT = near ? n.findT + dt : Math.max(0, n.findT - dt);
        if (n.findT >= NIGHT.findT) emit({ t: 'found', id: d.id });
      }
    },
    get stats() {
      let down = 0, flying = 0;
      for (const d of flock.birds) if (d.n) { if (d.alive) flying++; else if (d.down && !d.n.found) down++; }
      return { found: found.length, down, flying };
    },
  };
}
