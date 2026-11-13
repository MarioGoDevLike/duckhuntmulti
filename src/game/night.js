// The night hunt on the Projector Field. Thrushes pass over the field out of the dark, seen only where the projectors'
// beams (and the lamp) light them. A bird the lamp catches and holds turns and circles the lone olive; one it misses
// passes on and is gone. Every shot frightens them: each one climbs higher, and after enough it leaves. A bird that is hit falls in the dark and counts once its shooter's dog has brought it in.
//
// Every screen flies the same birds: a bird's path follows from the seed, its age and how often it was frightened.
// What changes that is sent to the room as events — emit(ev) applies it here and hands it on (onEvent); the others
// apply(ev) it:  { t: 'hold', id, at } from the lamper's screen (the lamp caught it; it starts circling from at),
// { t: 'spook' } from the screen that fired (every bird in the air climbs), { t: 'found', id } from
// the shooter's screen once its dog has brought the bird in.
import * as THREE from 'three';
import { NIGHT } from '../config/gameplay.js';
import { TAU } from '../core/math.js';
import { makeBird } from '../entities/birds/bird.js';

const C = NIGHT.circle, L = NIGHT.laser;
const v = new THREE.Vector3(), ahead = new THREE.Vector3();

// hooks: { flock, lamp, audio() (the soundscape, or null), onEvent(ev) (to the room), onFound(bird) }.
export function createNight(hooks) {
  const { flock, lamp } = hooks;
  let centre = new THREE.Vector3(), authority = false, arrivals = [], next = 0;
  const found = [];

  /* ---------- a bird's path ---------- */
  // Pass: a straight run across the field, through one of the projectors' beams, and away — unless the lamp catches
  // it. Circle: once held in the lamp, round and round the tree, the radius breathing in and out, at a height that
  // rises with every fright. Follow: while the laser is on, a held bird flies where it points (at about the distance it
  // already is from the lamp); when the laser goes off it circles the tree again from where it is. Out: away, gone.
  function place(d, dt) {
    const n = d.n, t = d.life, p = d.g.position;
    n.alt += (C.alt[0] + n.alt0 + n.level * C.climb - n.alt) * Math.min(1, dt * 0.7);
    if (n.phase === 'in') {
      const u = Math.min(1, t / n.tPass);
      p.lerpVectors(n.from, n.to, u); p.y = n.alt;
      d.vel.subVectors(n.to, n.from).divideScalar(n.tPass);
      if (u >= 1) return true; // never caught in the lamp: gone over
    } else if (n.phase === 'circle') {
      const tau = t - n.tIn, th = n.th0 + n.w * tau, r = n.r + 3 * Math.sin(0.6 * tau + n.ph);
      p.set(centre.x + Math.cos(th) * r, n.alt, centre.z + Math.sin(th) * r);
      d.vel.set(-Math.sin(th) * r * n.w, 0, Math.cos(th) * r * n.w);
      if (n.level >= C.leaveAfter || tau > C.max) { // frightened off, or done looking: away into the dark
        n.phase = 'out'; n.tOut = t;
        d.vel.normalize().multiplyScalar(NIGHT.outSpeed).addScaledVector(v.set(p.x - centre.x, 0, p.z - centre.z).normalize(), 6);
        d.vel.y = NIGHT.outSpeed * 0.5;
      }
    } else if (n.phase === 'follow') {
      const reach = Math.min(L.reach[1], Math.max(L.reach[0], p.distanceTo(lamp.origin)));
      v.copy(lamp.origin).addScaledVector(lamp.dir, reach); v.y = Math.max(v.y, L.floor) + n.level * C.climb; // every fright puts it higher
      const to = v.sub(p), dist = to.length();
      ahead.copy(to).multiplyScalar(Math.min(L.speed, dist * 1.5) / Math.max(dist, 0.01));
      ahead.x += Math.sin(t * 2.3 + n.ph) * 1.5; ahead.y += Math.sin(t * 1.7 + n.ph) * 0.8; // never quite a straight line
      d.vel.lerp(ahead, Math.min(1, dt * L.turn)); p.addScaledVector(d.vel, dt); n.alt = p.y;
      if (n.level >= C.leaveAfter) { n.phase = 'out'; n.tOut = t; d.vel.y = NIGHT.outSpeed * 0.5; d.vel.setLength(NIGHT.outSpeed); }
    } else p.addScaledVector(d.vel, dt);
    return n.phase === 'out' && t - n.tOut > 9;
  }

  // One bird from its arrival record (all of it from the seed, so the same on every screen).
  function spawn(a, lag) {
    const d = makeBird('thrush', true), alt = C.alt[0] + a.alt0;
    // In from far out, over one of the side projectors (through its beam), and on out the far side.
    const from = new THREE.Vector3(centre.x + Math.cos(a.a) * 150, alt, centre.z + Math.sin(a.a) * 150);
    const over = new THREE.Vector3(centre.x + a.side * (19 + a.r * 0.15), alt, centre.z + (a.ph - Math.PI) * 1.5);
    const to = over.clone().addScaledVector(over.clone().sub(from).normalize(), 150);
    d.n = { phase: 'in', from, to, tPass: from.distanceTo(to) / NIGHT.inSpeed, tIn: 0, th0: 0, r: a.r, w: a.w * a.side, ph: a.ph,
      alt0: a.alt0, alt, level: 0, tOut: 0, litT: 0, found: false };
    d.g.position.copy(from);
    // Shot at in the dark (only the projectors on it), most of the pattern goes wide: the lamp makes it a fair shot.
    d.cover = () => (lamp.dazzleAt(d.g.position) > 0.02 ? 0 : NIGHT.dark); d.coverHint = 'Too dark — get the lamp on it';
    flock.add(d, { vel: new THREE.Vector3(), alive: true, down: false, ph: a.ph, life: lag, wob: a.ph }, true, 0);
    hooks.audio()?.alarm(over, 0.5); // its thin call, out of the dark
  }

  /* ---------- events ---------- */
  function apply(ev) {
    if (ev.t === 'spook') { for (const d of flock.birds) if (d.n && d.alive) d.n.level++; return; }
    const d = flock.birds.find(b => b.id === ev.id && b.n); if (!d) return;
    if (ev.t === 'hold' && d.alive && d.n.phase !== 'out' && d.n.phase !== 'dead') { // caught in the lamp (or let off the laser): it circles the tree from here
      const n = d.n, p = d.g.position.fromArray(ev.at);
      n.phase = 'circle'; n.tIn = d.life; n.th0 = Math.atan2(p.z - centre.z, p.x - centre.x);
      n.r = Math.min(C.r[1] + 4, Math.max(C.r[0], Math.hypot(p.x - centre.x, p.z - centre.z)));
      n.alt = p.y; n.alt0 = p.y - C.alt[0] - n.level * C.climb; return;
    }
    if (ev.t === 'found' && !d.n.found) { // counted even if here it is still falling: every screen keeps the same bag
      d.n.found = true; found.push(d.id); hooks.onFound(d); if (!d.retrieved) flock.removeWhere(b => b === d); // the others' copies: picked up
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
      for (const d of flock.birds) { // the laser: every held bird follows it while it is on (each screen steers by the lamper's pose)
        const n = d.n; if (!n || !d.alive) continue;
        if (n.phase === 'circle' && lamp.laser) n.phase = 'follow';
        else if (n.phase === 'follow' && !lamp.laser) {
          apply({ t: 'hold', id: d.id, at: d.g.position.toArray() });
          if (authority) hooks.onEvent?.({ t: 'hold', id: d.id, at: d.g.position.toArray().map(x => +x.toFixed(2)) }); // everyone circles from the same place
        }
      }
      if (!authority) return;
      for (const d of flock.birds) { // the lamper's screen decides when the lamp has caught a passing bird
        const n = d.n; if (!n || !d.alive || n.phase !== 'in') continue;
        n.litT = lamp.dazzleAt(d.g.position) > 0.02 ? n.litT + dt : 0;
        if (n.litT >= NIGHT.holdT) emit({ t: 'hold', id: d.id, at: d.g.position.toArray().map(x => +x.toFixed(2)) });
      }
    },
    // Our dog has brought this bird in (it was ours): into the party's bag, on every screen.
    fetched(d) { if (d.n && !d.n.found) emit({ t: 'found', id: d.id }); },
    get stats() {
      let down = 0, flying = 0;
      for (const d of flock.birds) if (d.n) { if (d.alive) flying++; else if (d.down && !d.n.found) down++; }
      return { found: found.length, down, flying };
    },
  };
}
