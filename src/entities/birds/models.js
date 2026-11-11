/* Loaded bird models (Sketchfab, CC-BY-4.0; credited in the menu)
   Each loads once in the background; until it arrives, or if it fails, the procedural bird stands in.
   Clones share geometry and textures, so a sky or a pile full of them costs little. */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadModel, prepareModel, findBone } from '../../core/gltf.js';
import chaffinchScanUrl from '../../assets/models/chaffinch.glb?url';
import thrushModelUrl from '../../assets/models/thrush_3D.glb?url';
import mallardModelUrl from '../../assets/models/duck_3d.glb?url';

/* ---------- Chaffinch: photogrammetry scan, downed birds only ---------- */
// "Dead Chaffinch" by b-unicycling, a scan of a male lying on bark mulch. assets/models/chaffinch.glb is the bird cut
// out of that scan (art-source/models/dead_chaffinch.glb): ground removed, underside sealed, texture cut to 2048². Bird space: lying on
// its side, head toward +z, resting on y = 0, ~0.38 long like makeFinch. No rig, so flying chaffinches stay procedural.
let chaffinchScan = null;
const chaffinchReady = loadModel(chaffinchScanUrl, 'Chaffinch').then(gl => { if (gl) { prepareModel(gl.scene, THREE.DoubleSide); chaffinchScan = gl.scene; } });
export const makeFinchCarcass = () => chaffinchScan?.clone() ?? null;

/* ---------- Mallard: sculpted drake, downed birds and the menu card ---------- */
// "Realistic Mallard Duck - Game Ready Asset" by 3Dima. A standing drake facing +z, centred on the origin, 1.0 long;
// scaled to the procedural duck's 0.96. Static (no rig), so flying ducks stay procedural; on the ground it is laid on
// its side — on its belly the upright neck would read as a live, sitting duck.
let mallard = null;
const mallardReady = loadModel(mallardModelUrl, 'Mallard').then(gl => {
  if (!gl) return;
  prepareModel(gl.scene); const g = new THREE.Group(); gl.scene.scale.setScalar(0.96); g.add(gl.scene); mallard = g;
});
export const makeMallardModel = () => mallard?.clone() ?? null;

/* ---------- Thrush: rigged, flies ---------- */
// "Swainson's Thrush - in Flight" by osuecampus: a skinned thrush with a wingbeat clip. The clip is keyed as four
// held poses (stop-motion when played), so three of them are sampled — wings up, spread, down — and the wings are
// driven by blending between them, plus a folded pose built here for closed-wing dips and birds on the ground.
// Bird space as makeThrush: facing +z, centred on the body, ~0.43 long and ~0.66 across the spread wings.
const THRUSH_SCALE = 0.185, WING_BONES = ['wingLength01', 'wingLength02', 'wingLength03'];
let thrushRig = null;
const thrushReady = loadModel(thrushModelUrl, 'Thrush').then(gl => {
  if (!gl) return;
  const root = gl.scene; prepareModel(root, THREE.DoubleSide); root.updateMatrixWorld(true);
  const bones = ['r', 'l'].flatMap(s => WING_BONES.map(n => findBone(root, `${n}_${s}_`)));
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(gl.animations[0]); act.play();
  const sample = t => { mixer.setTime(t); return bones.map(b => b.quaternion.clone()); };
  const UP = sample(0), MID = sample(0.25), DOWN = sample(0.5);
  act.stop(); mixer.uncacheRoot(root);
  // Folded: from the spread pose, collapse each wing's span toward the body (the feathers already trail to the tail),
  // sweep the tips in and drape the wing down over the flank. Rotations about the model's own axes; tuned by eye.
  bones.forEach((b, i) => b.quaternion.copy(MID[i]));
  const FOLD_SPAN = 0.18;
  for (const [s, sg] of [['r', 1], ['l', -1]]) {
    const w = findBone(root, `wingLength01_${s}_`);
    for (const [axis, ang] of [[[0, 1, 0], -0.4 * sg], [[0, 0, 1], -0.85 * sg], [[1, 0, 0], 0.15]]) {
      root.updateMatrixWorld(true);
      const pw = w.parent.getWorldQuaternion(new THREE.Quaternion());
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...axis), ang);
      w.quaternion.premultiply(pw.clone().invert().multiply(q).multiply(pw));
    }
  }
  const FOLD = bones.map(b => b.quaternion.clone());
  bones.forEach((b, i) => b.quaternion.copy(MID[i]));
  // Centre the body on the origin (the model stands its body ~1.8 units up and forward of it).
  root.scale.setScalar(THRUSH_SCALE); root.position.set(0, -0.33 * THRUSH_SCALE, -0.1 * THRUSH_SCALE);
  // Which of the model's wings lies on the bird's +x side, so one wing can be posed on its own (a shot bird with one
  // wing broken).
  root.updateMatrixWorld(true);
  const rIsPlusX = findBone(root, 'wingLength03_r_').getWorldPosition(new THREE.Vector3()).x > 0;
  thrushRig = { root, UP, MID, DOWN, FOLD, FOLD_SPAN, names: bones.map(b => b.name), plusX: bones.map(b => b.name.includes('_r_') === rIsPlusX) };
});
// { g, wings: [], rig } — rig.pose(stroke, fold): stroke −1 (wings down) … 0 (spread) … 1 (up); fold 0 (open) … 1 (closed).
// rig.pose(stroke, fold, stroke2, fold2) poses the bird's +x wing with the first pair and its −x wing with the second.
export function makeThrushModel() {
  const K = thrushRig; if (!K) return null;
  const g = new THREE.Group(), m = cloneSkinned(K.root); g.add(m);
  const bones = K.names.map(n => m.getObjectByName(n));
  const rig = {
    fold: 0,
    pose(stroke, fold, stroke2 = stroke, fold2 = fold) {
      bones.forEach((b, i) => {
        const s = K.plusX[i] ? stroke : stroke2, f = K.plusX[i] ? fold : fold2;
        b.quaternion.slerpQuaternions(K.MID[i], (s >= 0 ? K.UP : K.DOWN)[i], Math.abs(s)).slerp(K.FOLD[i], f);
        if (b.name.startsWith('wingLength01')) b.scale.set(1, 1 + (K.FOLD_SPAN - 1) * f, 1);
      });
    },
  };
  rig.pose(0, 1);
  return { g, wings: [], rig };
}
// Resolves once every model has loaded or given up; the menu re-renders its bird cards then.
export const birdModelsReady = Promise.all([chaffinchReady, mallardReady, thrushReady]);
