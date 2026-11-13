// Ballistics. Each shot is a column travelling at SHOT_SPEED that spreads with range. Closest approach is solved
// against each bird's own velocity over the frame, so a fast crosser is only hit when the shot is placed ahead of it.
// A clean miss close enough to matter reports which way it went, to teach lead. A bird with a cover(from) — one sitting
// in a tree — keeps that share of the pellets off it: the leaves and twigs between it and the gun take them.
// Each shot carries the choke of the barrel it left (see CHOKES): how fast its pattern widens and how far it kills.
import * as THREE from 'three';
import { SHOT_SPEED, SHOT_MAX_RANGE, CHOKES } from '../config/gameplay.js';

const { clamp } = THREE.MathUtils;
const rel = new THREE.Vector3(), rv = new THREE.Vector3();

export function createShotColumn() {
  const shots = [];
  return {
    fire(pos, dir, choke = CHOKES[2]) { shots.push({ pos, from: pos.clone(), dir, choke, dist: 0, hit: false, miss: 1e9, hint: '' }); },
    clear() { shots.length = 0; },
    // onHit(bird, range, hit) when the pattern takes a bird · onMiss(hint) when a shot flies out having only just missed.
    update(dt, birds, Q, onHit, onMiss) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i], reach = Q.reach * s.choke.reach, fade = Q.fade * s.choke.reach, grow = 0.013 * s.choke.spread;
        for (const d of birds) {
          if (!d.alive || d.hidden) continue;
          rel.copy(s.pos).sub(d.g.position); rv.copy(s.dir).multiplyScalar(SHOT_SPEED).sub(d.vel);
          const tt = clamp(-rel.dot(rv) / rv.lengthSq(), 0, dt); rel.addScaledVector(rv, tt);
          const miss = rel.length(), range = s.dist + SHOT_SPEED * tt, r = Q.hitR + range * grow;
          // The pattern is densest at its core: it thins out as though the bird were 20% nearer when centred and 10%
          // further at the fringe (about even over a pattern, so the overall odds at a range are unchanged).
          const thin = range * (0.8 + 0.3 * miss / r);
          if (miss < r && Math.random() < (reach - thin) / fade * (d.cover ? 1 - d.cover(s.from) : 1)) {
            // How the bird was struck, for the way it falls: where the pattern's centre passed it (off, from the bird's
            // centre), along which line, how near the core of the pattern it was (u) and how much energy the pellets kept (e).
            onHit(d, range, { off: rel.clone(), dir: s.dir.clone(), r, u: miss / r, e: clamp(1 - range / reach, 0, 1) }); s.hit = true;
          }
          else if (miss < s.miss) {
            const sp = d.vel.length(), along = sp > 0.5 ? rel.dot(d.vel) / sp : 0; s.miss = miss;
            // On the bird but not taken: the leaves, or a pattern too thin at that range — not a pointing error.
            s.hint = miss < r ? (d.cover ? d.coverHint || 'The leaves took the shot' : 'On it — too far for the pattern') : Math.abs(along) > Math.abs(rel.y) ? (along > 0 ? 'Too far ahead' : 'Behind — lead more') : (rel.y > 0 ? 'Over the top' : 'Underneath');
          }
        }
        s.pos.addScaledVector(s.dir, SHOT_SPEED * dt); s.dist += SHOT_SPEED * dt;
        if (s.dist > SHOT_MAX_RANGE) { if (!s.hit && s.miss < 5) onMiss(s.hint); shots.splice(i, 1); }
      }
    },
  };
}
