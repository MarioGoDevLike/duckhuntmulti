import * as THREE from 'three';
import { mesh } from '../../core/meshes.js';
import { flat, pm, mix, bodySkin, wrapDraw } from './plumage.js';
import { buildBird } from './buildBird.js';

const { smoothstep } = THREE.MathUtils;

/* ---------- Eurasian woodcock (Beccaccia), in flight ----------
   Plump and short-tailed, with broad rounded wings and the long straight bill; dead-leaf plumage: rufous and grey-buff,
   barred dark across the back and finely across the buff underparts. On the ground and in the hand the scanned woodcock
   (models.js) takes over. */
let kit = null;
function parts() {
  if (kit) return kit;
  const rufous = 0x8a5a34, grey = 0x9a8466, buff = 0xc9a978, dark = '#2c1d12';
  const skin = bodySkin((up, t) => {
    const under = mix(buff, 0xb69467, smoothstep(t, 0.4, 0.8));
    return mix(under, mix(rufous, grey, 0.35 + 0.3 * Math.sin(t * 9)), smoothstep(up, -0.1, 0.35));
  }, (g, W, H) => {
    g.strokeStyle = dark; g.globalAlpha = 0.55;
    for (let y = 2; y < H; y += 3.2) { // fine wavy bars all round
      g.lineWidth = 0.7 + Math.random() * 0.9; g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, y + Math.sin(x * 0.3 + y) * 1.2);
      g.stroke();
    }
    g.globalAlpha = 0.8; g.fillStyle = dark;
    for (let i = 0; i < 90; i++) { // heavy dark chevrons over the back
      const y = Math.random() * H * 0.9, w = 3 + Math.random() * 5;
      wrapDraw(W, (0.5 + (Math.random() - 0.5) * 0.4) * W, x => g.fillRect(x - w / 2, y, w, 2 + Math.random() * 2));
    }
    g.globalAlpha = 1;
  });
  kit = { skin, rufous: pm(0x84552f), dark: pm(0x4a3220), edge: pm(0xb08a5a), bar: pm(0x2f2015) };
  return kit;
}
export function makeWoodcock() {
  const K = parts();
  const head = (x, y, z) => {
    let k = mix(0xcfb48a, 0x8a6a48, smoothstep(y, 0.05, 0.5));                     // buff face, browner crown
    const crown = smoothstep(y, 0.35, 0.6) * smoothstep(-z, -0.4, 0.4);             // black bars across the crown
    k = mix(k, 0x241810, crown * (Math.sin(z * 9) > 0 ? 0.9 : 0));
    return mix(k, 0x3a271a, smoothstep(z, 0.2, 0.5) * smoothstep(0.12, 0, Math.abs(y + 0.05)) * 0.8); // dark line, bill to eye
  };
  return buildBird({
    R: 0.05, scale: 1.55, skin: K.skin, flat: 0.88,
    body: [[0, -1.75], [0.35, -1.6], [0.72, -1.1], [0.97, -0.4], [1, 0.25], [0.9, 0.85], [0.6, 1.25], [0, 1.4]],
    head: { r: 0.52, y: 0.5, z: 1.4, sz: 1.12, colour: head },
    bill: { shape: [[0, -0.1], [0.2, 0.0], [0.15, 1.2], [0.1, 2.6], [0.05, 3.3], [0, 3.4]], base: 0xa88a6a, tip: 0x3a2c22, split: 1.6, y: -0.18, sy: 0.9 },
    tail: { y: 0.15, z: -1.5, len: 1.3, w: 0.45, n: 10, spread: 0.38, fan: 0.35, mat: K.dark, edge: K.edge },
    legs: 0xb09a86,
    wing: {
      x: 0.72, y: 0.6, z: 0.25, drop: 0.5, arm: 1.55, hand: 1.6, chord: 2.0, nSec: 8, nPrim: 9, fan: 0.95,
      coverts: K.rufous, secondary: K.rufous, secEdge: K.edge, primary: K.dark, primEdge: K.rufous,
      patches: (inner, A, ch) => { // dark bars across the arm
        for (let i = 0; i < 5; i++) mesh(flat([[0, 0.012], [A, 0.012], [A, -0.012], [0, -0.012]]), K.bar, inner, 0, 0.0016, ch * (0.35 - i * 0.12));
      },
    },
  });
}
