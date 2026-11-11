// Feathers, painted skins and colour helpers shared by the procedural birds.
import * as THREE from 'three';
import { rnd, TAU } from '../../core/math.js';
import { mesh } from '../../core/meshes.js';
import { canvasTex } from '../../core/textures.js';

const { clamp } = THREE.MathUtils;

const featherShape = (len, w, tip = 0.82) => {
  const s = new THREE.Shape(), p = [[w * 0.5, len * 0.28], [w * 0.46, len * tip], [0, len], [-w * 0.46, len * tip], [-w * 0.5, len * 0.28], [0, 0]];
  s.moveTo(0, 0); s.splineThru(p.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ShapeGeometry(s, 8);
};
// Along -z (secondaries, tail) and along +x (primaries), lying flat (normal ±y).
export const featherBack = (len, w, tip) => featherShape(len, w, tip).rotateX(-Math.PI / 2);
export const featherOut = (len, w, tip) => featherShape(len, w, tip).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
// A flat panel in the x-z plane from [x, z] points (z toward the head).
export const flat = pts => {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], -pts[0][1]);
  s.splineThru([...pts.slice(1), pts[0]].map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2);
};
export const pm = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, side: THREE.DoubleSide, envMapIntensity: 0.6, ...o });
// A feather with a pale fringe: the fringe is the same feather a touch larger, just beneath it, and one-sided so it
// only shows round the edge from above; from below the dark feather is all you see.
const edgeCache = new Map();
const edgeOnly = m => { if (!edgeCache.has(m)) { const e = m.clone(); e.side = THREE.FrontSide; edgeCache.set(m, e); } return edgeCache.get(m); };
export function fringed(parent, geo, mat, edgeMat, x, y, z, ry, k = 1.12) {
  const f = mesh(geo, mat, parent, x, y, z); f.rotation.y = ry;
  if (edgeMat) { const e = mesh(geo, edgeOnly(edgeMat), parent, x, y - 0.0006, z); e.rotation.y = ry; e.scale.set(k, 1, k); }
  return f;
}
const C = c => new THREE.Color(c);
export const mix = (a, b, t) => C(a).lerp(C(b), clamp(t, 0, 1));

// Painted skin for the lathed body. u runs round the body (0 = belly, 0.5 = back), v from tail (0) to head (1).
// colour(up, t) gives the base plumage; extras paint spots, vermiculation or mottling on top.
export function bodySkin(colour, extras) {
  return canvasTex(512, 256, (g, W, H) => {
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const up = -Math.cos(TAU * x / W), t = 1 - y / H, k = colour(up, t), i = (y * W + x) * 4;
      d[i] = k.r * 255; d[i + 1] = k.g * 255; d[i + 2] = k.b * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 1400; i++) { // overlapping feather tips: soft scallops opening toward the head
      const x = rnd(0, W), y = rnd(0, H), r = rnd(4, 9);
      g.strokeStyle = `rgba(0,0,0,${rnd(0.05, 0.12)})`; g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${rnd(0.03, 0.07)})`; g.beginPath(); g.arc(x, y - 1.2, r, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    }
    extras?.(g, W, H);
  });
}
// Draw on both sides of the seam at u = 0/1 so marks wrap round the belly cleanly.
export const wrapDraw = (W, x, draw) => { draw(x); if (x < 40) draw(x + W); if (x > W - 40) draw(x - W); };
