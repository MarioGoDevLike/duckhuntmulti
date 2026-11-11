import * as THREE from 'three';
import { TAU } from '../../core/math.js';
import { mesh } from '../../core/meshes.js';
import { flat, pm, mix, bodySkin, wrapDraw } from './plumage.js';
import { buildBird } from './buildBird.js';

const { smoothstep } = THREE.MathUtils;

/* ---------- Song thrush (Summan) ---------- */
let thrushKit = null;
function thrushParts() {
  if (thrushKit) return thrushKit;
  const back = 0x7c5f43, buff = 0xead39c, belly = 0xf6f1e6, spot = '#3a2716';
  const skin = bodySkin((up, t) => {
    const under = mix(belly, buff, smoothstep(t, 0.35, 0.72) * 0.85 + smoothstep(up, -0.7, -0.15) * 0.5);   // buff breast and flanks, white belly
    return mix(under, back, smoothstep(up, -0.05, 0.42));
  }, (g, W, H) => {
    g.fillStyle = spot;
    for (let i = 0; i < 260; i++) {                            // arrowhead spots in loose rows over breast and flanks
      const v = 0.28 + Math.pow(Math.random(), 0.75) * 0.6, u = (Math.random() < 0.5 ? -1 : 1) * Math.random() * 0.26 * (0.4 + v * 0.7);
      const r = 2 + v * 3.2, y = (1 - v) * H;
      wrapDraw(W, ((u + 1) % 1) * W, x => {
        g.beginPath(); g.ellipse(x, y, r * 0.8, r, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.4); g.lineTo(x, y - r * 2.2); g.lineTo(x + r * 0.6, y - r * 0.4); g.fill();
      });
    }
  });
  thrushKit = { skin, brown: pm(0x6e5238), dark: pm(0x523b27), buffEdge: pm(0xc9a26b), buffTip: pm(0xe2c28a), underwing: pm(0xd8903e) };
  return thrushKit;
}
export function makeThrush() {
  const K = thrushParts();
  const head = (x, y, z) => {
    let k = mix(0xeedcb4, 0x7c5f43, smoothstep(y + 0.3 * (0.3 - z), 0.0, 0.38));                       // pale face, brown crown
    k = mix(k, 0x8a6a4a, smoothstep(Math.abs(x), 0.55, 0.8) * smoothstep(-y, -0.35, 0.1) * smoothstep(z, -0.5, 0.2) * 0.7); // ear coverts
    return mix(k, 0x3e2b1c, smoothstep(z, 0.15, 0.35) * smoothstep(-y, 0.18, 0.32) * (1 - smoothstep(-y, 0.45, 0.6)) * smoothstep(Math.abs(x), 0.3, 0.6)); // moustache
  };
  return buildBird({
    R: 0.046, scale: 1.5, skin: K.skin, eyeRing: 0xeedfba,
    body: [[0, -2.15], [0.3, -1.95], [0.65, -1.35], [0.93, -0.55], [1, 0.15], [0.93, 0.75], [0.66, 1.22], [0, 1.45]],
    head: { r: 0.47, y: 0.48, z: 1.42, colour: head },
    bill: { shape: [[0, -0.1], [0.24, 0.0], [0.22, 0.45], [0.12, 0.9], [0, 1.1]], base: 0xd9a33c, tip: 0x2b231c, split: 0.4, y: -0.1, sy: 0.85 },
    tail: { y: 0.12, z: -1.85, len: 2.0, w: 0.42, n: 8, spread: 0.32, fan: 0.3, mat: K.brown, edge: null },
    legs: 0xdca08a,
    wing: {
      x: 0.75, y: 0.64, z: 0.3, drop: 0.55, arm: 1.6, hand: 1.95, chord: 1.65, nSec: 7, nPrim: 8, fan: 0.7,
      coverts: K.brown, secondary: K.brown, secEdge: K.buffEdge, primary: K.dark, primEdge: K.buffEdge,
      patches: (inner, A, ch) => {                                                    // buff-tipped greater coverts
        for (let i = 0; i < 6; i++) mesh(new THREE.CircleGeometry(ch * 0.05, 8).rotateX(-Math.PI / 2), K.buffTip, inner, A * (i + 0.6) / 6.5, 0.0017, -ch * 0.08);
      },
      under: (inner, A, ch) => mesh(flat([[0, ch * 0.4], [A, ch * 0.35], [A, -ch * 0.1], [0, -ch * 0.1]]), K.underwing, inner, 0, -0.0012, 0), // orange-buff underwing
    },
  });
}
