import * as THREE from 'three';
import { rnd, TAU } from '../../core/math.js';
import { mesh } from '../../core/meshes.js';
import { flat, pm, mix, bodySkin } from './plumage.js';
import { buildBird } from './buildBird.js';

const { smoothstep } = THREE.MathUtils;

/* ---------- Mallard ---------- */
let duckKit = null;
function duckParts() {
  if (duckKit) return duckKit;
  const drake = bodySkin((up, t) => {
    let k = mix(0xbcb8ad, 0x5a2d1f, smoothstep(t, 0.6, 0.72) * (1 - smoothstep(up, 0.2, 0.6)));       // grey flanks, chestnut breast
    k = mix(k, 0x6f6658, smoothstep(up, 0.35, 0.7) * smoothstep(t, 0.25, 0.4));                      // grey-brown back
    return mix(k, 0x121214, 1 - smoothstep(t, 0.12, 0.22));                                          // black stern
  }, (g, W, H) => {
    g.strokeStyle = 'rgba(40,38,34,.18)'; g.lineWidth = 0.8;                                         // fine vermiculation on the flanks
    for (let y = H * 0.25; y < H * 0.75; y += 2.2) { g.beginPath(); for (let x = 0; x <= W; x += 8) g.lineTo(x, y + Math.sin(x * 0.3 + y) * 0.8); g.stroke(); }
  });
  const hen = bodySkin((up, t) => mix(0xc9a57a, 0x8a6a48, smoothstep(up, -0.4, 0.6)), (g, W, H) => {
    for (let i = 0; i < 900; i++) {                                                                  // dark-centred, buff-edged feathers
      const x = rnd(0, W), y = rnd(0, H), r = rnd(3, 6);
      g.fillStyle = `rgba(60,40,24,${rnd(0.35, 0.6)})`; g.beginPath(); g.ellipse(x, y, r * 0.7, r, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(232,206,160,.35)'; g.beginPath(); g.ellipse(x, y, r * 0.95, r * 1.25, 0, 0, TAU); g.stroke();
    }
  });
  duckKit = {
    drake, hen, grey: pm(0x8d8a82), brown: pm(0x7a5c3e), dark: pm(0x3a3631), white: pm(0xf3f1ea),
    spec: pm(0x2e48b8, { roughness: 0.3, metalness: 0.4 }), black: pm(0x111113),
  };
  return duckKit;
}
export function makeDuck(drake) {
  const K = duckParts();
  const head = drake
    ? (x, y) => mix(0x0e5a34, 0xf4f2ea, smoothstep(-y, 0.72, 0.8) * (1 - smoothstep(-y, 0.88, 0.95)))   // glossy green, white collar
    : (x, y, z) => mix(0xb8946a, 0x5e4630, smoothstep(y, 0.15, 0.45) + smoothstep(z, 0.25, 0.4) * (1 - smoothstep(Math.abs(y - 0.18), 0.0, 0.12)) * 0.8); // dark crown and eye-stripe
  const b = buildBird({
    R: 0.1, scale: 1.4, skin: drake ? K.drake : K.hen, flat: 0.86,
    body: [[0, -2.7], [0.35, -2.4], [0.75, -1.7], [0.97, -0.7], [1, 0.4], [0.9, 1.25], [0.62, 1.75], [0, 2.0]],
    head: { r: 0.4, y: 0.66, z: 2.42, sz: 1.2, gloss: drake, colour: head },
    bill: { shape: [[0, -0.1], [0.36, 0.0], [0.4, 0.5], [0.36, 1.05], [0.2, 1.25], [0, 1.28]], base: drake ? 0xe0c62e : 0xc98a3a, tip: drake ? 0xd6bd2a : 0x4a3a2a,
            split: 1.0, y: -0.15, sy: 0.38, sx: 1.05 },
    tail: { y: 0.1, z: -2.55, len: 1.2, w: 0.42, n: 10, spread: 0.7, fan: 0.6, mat: drake ? K.white : K.brown, edge: null,
            extra: drake ? (tail, r) => { for (const sx of [-1, 1]) mesh(new THREE.TorusGeometry(0.1 * r, 0.03 * r, 6, 14, Math.PI * 1.4), K.black, tail, sx * 0.05 * r, 0.22 * r, -0.1 * r).rotation.y = Math.PI / 2; } : null },
    legs: null,
    wing: {
      x: 0.8, y: 0.45, z: 0.25, arm: 2.0, hand: 2.6, chord: 1.6, nSec: 8, nPrim: 9, fan: 0.6,
      coverts: drake ? K.grey : K.brown, secondary: drake ? K.grey : K.brown, secEdge: null, primary: K.dark, primEdge: null,
      patches: (inner, A, ch) => {                                                    // blue speculum between white bars
        mesh(flat([[0.1 * A, -ch * 0.02], [0.95 * A, -ch * 0.04], [0.95 * A, -ch * 0.3], [0.1 * A, -ch * 0.28]]), K.white, inner, 0, 0.0017, 0);
        mesh(flat([[0.12 * A, -ch * 0.06], [0.93 * A, -ch * 0.08], [0.93 * A, -ch * 0.26], [0.12 * A, -ch * 0.24]]), K.spec, inner, 0, 0.0025, 0);
      },
    },
  });
  return { ...b, drake };
}
