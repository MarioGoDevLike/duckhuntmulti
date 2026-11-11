// Ballistics. Each shot is a column travelling at SHOT_SPEED that spreads with range. Closest approach is solved
// against each bird's own velocity over the frame, so a fast crosser is only hit when the shot is placed ahead of it.
// A clean miss close enough to matter reports which way it went, to teach lead.
import * as THREE from 'three';
import { SHOT_SPEED, SHOT_MAX_RANGE } from '../config/gameplay.js';

const { clamp } = THREE.MathUtils;
const rel = new THREE.Vector3(), rv = new THREE.Vector3();

export function createShotColumn() {
  const shots = [];
  return {
    fire(pos, dir) { shots.push({ pos, dir, dist: 0, hit: false, miss: 1e9, hint: '' }); },
    clear() { shots.length = 0; },
    // onHit(bird, range) when the pattern takes a bird · onMiss(hint) when a shot flies out having only just missed.
    update(dt, birds, Q, onHit, onMiss) {
      for (let i = shots.length - 1; i >= 0; i--) {
        const s = shots[i];
        for (const d of birds) {
          if (!d.alive) continue;
          rel.copy(s.pos).sub(d.g.position); rv.copy(s.dir).multiplyScalar(SHOT_SPEED).sub(d.vel);
          const tt = clamp(-rel.dot(rv) / rv.lengthSq(), 0, dt); rel.addScaledVector(rv, tt);
          const miss = rel.length(), range = s.dist + SHOT_SPEED * tt;
          if (miss < Q.hitR + range * 0.013 && Math.random() < (Q.reach - range) / Q.fade) { onHit(d, range); s.hit = true; }
          else if (miss < s.miss) {
            const along = rel.dot(d.vel) / d.vel.length(); s.miss = miss;
            s.hint = Math.abs(along) > Math.abs(rel.y) ? (along > 0 ? 'Too far ahead' : 'Behind — lead more') : (rel.y > 0 ? 'Over the top' : 'Underneath');
          }
        }
        s.pos.addScaledVector(s.dir, SHOT_SPEED * dt); s.dist += SHOT_SPEED * dt;
        if (s.dist > SHOT_MAX_RANGE) { if (!s.hit && s.miss < 5) onMiss(s.hint); shots.splice(i, 1); }
      }
    },
  };
}
