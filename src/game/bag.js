// The bag, laid out on the grass after the hunt: each hunter's birds in rows in front of where they stood, heads
// away, wings folded, in the order they were shot, with a name card; the camera then looks down on it (view).
import * as THREE from 'three';
import { slotX } from '../config/gameplay.js';
import { rnd } from '../core/math.js';
import { labelSprite } from '../core/textures.js';
import { makeBird, toCarcass, foldWings, lay } from '../entities/birds/bird.js';

export function createBag(scene) {
  const group = new THREE.Group(); scene.add(group);
  let view = null;

  function clear() {
    group.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
    group.clear(); view = null;
  }

  // list: [{ by: 'me' | hunter id, name, sub, outcome, slot, count, winner }] · birdsOf: { [by]: [drake?, ...] } in shot order.
  // Returns the rectangle of grass to mow under it and where the dog should sit beside it.
  function layOut(list, Q, birdsOf) {
    clear();
    const { cols: COLS, dx: DX, dz: DZ, front: FRONT } = Q.bag;
    let x0 = Infinity, x1 = -Infinity, depth = DZ;
    for (const e of list) {
      const birds = birdsOf[e.by] || [], cx = slotX(e.slot, e.count), rows = Math.max(1, Math.ceil(birds.length / COLS));
      birds.forEach((drake, i) => {
        const r = i / COLS | 0, inRow = Math.min(COLS, birds.length - r * COLS);
        const d = makeBird(Q.bird ?? Q.kind, drake);
        toCarcass(d); foldWings(d);
        d.g.position.set(cx + (i % COLS - (inRow - 1) / 2) * DX + rnd(-0.03, 0.03), 0, FRONT - r * DZ + rnd(-0.05, 0.05));
        // Ducks lie on their bellies; small birds are laid on their backs, breast up, as in a gamebag.
        lay(d, 0, Math.PI + rnd(-0.08, 0.08), (Q.upturn ? Math.PI : 0) + rnd(-0.35, 0.35));
        group.add(d.g);
      });
      const lines = e.name ? [e.name, e.sub, e.outcome] : birds.length ? [] : ['No birds this time'];
      if (lines.length) {
        const tag = labelSprite(lines.filter(Boolean), e.winner ? '#ffd76a' : '#f1e8d0', e.count > 1 ? 2.2 : 1.6);
        tag.position.set(cx, 0.75, FRONT - rows * DZ - 0.2); group.add(tag);
      }
      x0 = Math.min(x0, cx - COLS * DX / 2); x1 = Math.max(x1, cx + COLS * DX / 2); depth = Math.max(depth, rows * DZ);
    }
    const span = x1 - x0;
    view = { cx: (x0 + x1) / 2, zc: FRONT - depth / 2 + 0.6, h: 1.7 + depth * 0.45 + span * 0.3, z: -0.6 + span * 0.35, span };
    return { mow: [x0 - 1.5, x1 + 1.5, FRONT - depth - 2, 0.6], dog: { x: x1 + 0.9, z: FRONT - 0.3 } };
  }

  return { clear, layOut, get view() { return view; } };
}
