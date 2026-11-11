import * as THREE from 'three';
import { mesh } from '../../core/meshes.js';
import { flat, pm, mix, bodySkin } from './plumage.js';
import { buildBird } from './buildBird.js';

const { smoothstep } = THREE.MathUtils;

/* ---------- Chaffinch (Fringello) ---------- */
const FINCH = {
  m: { cap: 0x7890b0, face: 0xe0946c, breast: 0xe29a72, belly: 0xf2e2d8, back: 0xa0704c, rump: 0x9aab55 },
  f: { cap: 0x8a8670, face: 0xc2b394, breast: 0xc2b394, belly: 0xe2dccd, back: 0x857d60, rump: 0x9da564 },
};
let finchKit = null;
function finchParts() {
  if (finchKit) return finchKit;
  const skin = P => bodySkin((up, t) => {
    const under = mix(P.belly, P.breast, smoothstep(t, 0.25, 0.62));
    let over = mix(P.rump, P.back, smoothstep(t, 0.22, 0.42));
    over = mix(over, P.cap, smoothstep(t, 0.72, 0.9));                      // grey-blue nape onto the mantle
    return mix(under, over, smoothstep(up, -0.15, 0.45));
  });
  finchKit = { m: skin(FINCH.m), f: skin(FINCH.f), black: pm(0x16161a), white: pm(0xf6f4ee), yellowEdge: pm(0xe8e1b0) };
  return finchKit;
}
export function makeFinch(male) {
  const K = finchParts(), P = male ? FINCH.m : FINCH.f;
  const head = (x, y, z) => {
    let k = mix(P.face, P.cap, smoothstep(y + 0.45 * (0.25 - z), 0.12, 0.42));
    if (male) k = mix(k, 0x161414, smoothstep(z, 0.78, 0.9) * smoothstep(y, -0.05, 0.15) * (1 - smoothstep(y, 0.5, 0.65)));
    return k;
  };
  return buildBird({
    R: 0.042, scale: 1.6, skin: male ? K.m : K.f,
    body: [[0, -1.9], [0.3, -1.7], [0.62, -1.1], [0.9, -0.4], [1, 0.25], [0.9, 0.8], [0.62, 1.25], [0, 1.45]],
    head: { r: 0.5, y: 0.5, z: 1.42, colour: head },          // head about half the body's depth, as on a real finch
    bill: { shape: [[0, -0.1], [0.34, 0.0], [0.3, 0.35], [0.17, 0.75], [0, 0.95]], base: 0x8f9db3, tip: 0x3a3e46, split: 0.55, y: -0.12 },
    tail: { y: 0.15, z: -1.62, len: 1.75, w: 0.36, n: 8, spread: 0.36, fan: 0.4, mat: K.black, outer: K.white, edge: null },
    legs: 0x9b7566,
    wing: {
      x: 0.72, y: 0.62, z: 0.3, drop: 0.55, arm: 1.45, hand: 1.75, chord: 1.55, nSec: 6, nPrim: 7, fan: 0.75,
      coverts: K.black, secondary: K.black, secEdge: K.white, primary: K.black, primEdge: K.yellowEdge,
      patches: (inner, A, ch) => {
        mesh(flat([[0.0, ch * 0.45], [A * 0.62, ch * 0.5], [A * 0.7, ch * 0.18], [0.02 * A, ch * 0.12]]), K.white, inner, 0, 0.0016, 0);   // shoulder patch
        mesh(flat([[0.04 * A, -ch * 0.02], [A * 0.95, -ch * 0.05], [A * 0.95, -ch * 0.17], [0.04 * A, -ch * 0.12]]), K.white, inner, 0, 0.0016, 0); // wing bar
      },
    },
  });
}
