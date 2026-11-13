/* Loaded bird models (Sketchfab, CC-BY-4.0; credited in the menu)
   Each loads once in the background; until it arrives, or if it fails, the procedural bird stands in.
   Clones share geometry and textures, so a sky or a pile full of them costs little. */
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadModel, prepareModel, findBone } from '../../core/gltf.js';
import chaffinchScanUrl from '../../assets/models/chaffinch.glb?url';
import thrushModelUrl from '../../assets/models/thrush_3D.glb?url';
import mallardModelUrl from '../../assets/models/duck_3d.glb?url';
import doveFlightUrl from '../../assets/models/mourning_dove_-_in_flight.glb?url';
import dovePerchedUrl from '../../assets/models/mourning_dove.glb?url';
import woodcockScanUrl from '../../assets/models/woodcock.glb?url';

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

/* ---------- Thrush and mourning dove: rigged, fly ---------- */
// "Swainson's Thrush - in Flight" and "Mourning Dove - in Flight" by osuecampus: skinned birds on the same rig, each
// with a wingbeat clip. Three poses are sampled from the clip — wings up, spread, down — and the wings are driven by
// blending between them, plus a folded pose built here for closed-wing dips and birds on the ground. keys: the clip
// times of those three poses (the thrush's, set by hand), or 'auto' to find the top and bottom of the stroke from the
// wingtip's height (the dove's clip beats three times a loop). Bird space as makeThrush: facing +z, centred on the body.
// fit: { scale, at } places the model by hand (the thrush: ~0.43 long, ~0.66 across the spread wings);
//      { span } scales it to that wingspan and centres it on its spread pose. shade (optional): × its colour.
const WING_BONES = ['wingLength01', 'wingLength02', 'wingLength03'];
const DOVE_SPAN = 0.72; // m across the dove's spread wings
const loadFlyer = (url, what, fit) => loadModel(url, what).then(gl => {
  if (!gl) return null;
  const root = gl.scene; prepareModel(root, THREE.DoubleSide); root.updateMatrixWorld(true);
  if (fit.shade) root.traverse(o => { if (o.isMesh) { o.material.color.multiplyScalar(fit.shade); o.material.envMapIntensity = 0.2; } });
  const bones = ['r', 'l'].flatMap(s => WING_BONES.map(n => findBone(root, `${n}_${s}_`)));
  if (bones.some(b => !b)) { console.warn(`${what} model has an unexpected rig; using the procedural stand-in`); return null; }
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(gl.animations[0]); act.play();
  const sample = t => { mixer.setTime(t); return bones.map(b => b.quaternion.clone()); };
  let keys = fit.keys;
  if (keys === 'auto') { // the wingtip's height over the shoulder through one loop: highest is up, lowest down, level between
    const tip = findBone(root, 'wingLength03_r_'), sh = findBone(root, 'shoulder_r_'), a = new THREE.Vector3(), b = new THREE.Vector3();
    const hs = [];
    for (let t = 0; t < gl.animations[0].duration; t += 1 / 96) {
      mixer.setTime(t); root.updateMatrixWorld(true); hs.push([t, tip.getWorldPosition(a).y - sh.getWorldPosition(b).y]);
    }
    const up = hs.reduce((m, h) => (h[1] > m[1] ? h : m)), down = hs.reduce((m, h) => (h[1] < m[1] ? h : m));
    const [t0, t1] = [up[0], down[0]].sort((x, y) => x - y);
    const mid = hs.filter(h => h[0] > t0 && h[0] < t1).reduce((m, h) => (Math.abs(h[1]) < Math.abs(m[1]) ? h : m), up);
    keys = [up[0], mid[0], down[0]];
  }
  const UP = sample(keys[0]), MID = sample(keys[1]), DOWN = sample(keys[2]);
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
  if (fit.span) { // measured on the spread pose: the skinned vertices as the bones place them
    root.updateMatrixWorld(true); root.traverse(o => o.isSkinnedMesh && o.skeleton.update());
    const box = new THREE.Box3().setFromObject(root, true), c = box.getCenter(new THREE.Vector3()), k = fit.span / (box.max.x - box.min.x);
    root.scale.setScalar(k); root.position.copy(c).multiplyScalar(-k);
    // The raised wings lift the box above the body: drop the body (between the face and the tail) onto the origin.
    root.updateMatrixWorld(true);
    const y = n => findBone(root, n).getWorldPosition(new THREE.Vector3()).y;
    root.position.y -= (y('face_') + y('tail02_r_')) / 2;
  } else { root.scale.setScalar(fit.scale); root.position.set(...fit.at).multiplyScalar(fit.scale); }
  // Which of the model's wings lies on the bird's +x side, so one wing can be posed on its own (a shot bird with one
  // wing broken).
  root.updateMatrixWorld(true);
  const rIsPlusX = findBone(root, 'wingLength03_r_').getWorldPosition(new THREE.Vector3()).x > 0;
  return { root, UP, MID, DOWN, FOLD, FOLD_SPAN, names: bones.map(b => b.name), plusX: bones.map(b => b.name.includes('_r_') === rIsPlusX) };
});
let thrushRig = null, doveRig = null;
// The thrush model stands its body ~1.8 units up and forward of its origin: centred by hand.
const thrushReady = loadFlyer(thrushModelUrl, 'Thrush', { keys: [0, 0.25, 0.5], scale: 0.185, at: [0, -0.33, -0.1] }).then(K => { thrushRig = K; });
// The dove drawn well over life size (a real one spans ~0.45 m), as the thrush is: at 30 m a life-size dove was a
// speck on screen, where in the field it reads as a good-sized bird. The perched dove matches it. Darkened: its pale grey-buff, lit from behind the hunter, all but vanished into a hazy sky, where a real dove
// reads as a dark shape.
const doveReady = loadFlyer(doveFlightUrl, 'Mourning dove', { keys: 'auto', span: DOVE_SPAN, shade: 0.5 }).then(K => { doveRig = K; });

// { g, wings: [], rig } — rig.pose(stroke, fold): stroke −1 (wings down) … 0 (spread) … 1 (up); fold 0 (open) … 1 (closed).
// rig.pose(stroke, fold, stroke2, fold2) poses the bird's +x wing with the first pair and its −x wing with the second.
function makeFlyer(K) {
  if (!K) return null;
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
export const makeThrushModel = () => makeFlyer(thrushRig);
export const makeDoveModel = () => makeFlyer(doveRig);

/* ---------- Mourning dove: perched, downed birds and the menu card ---------- */
// "Mourning Dove" by osuecampus: a perched dove (its head-turn clip is not used). On the ground it is laid on its
// side or back like the other small birds, wings closed as they are when perched. Scaled to the flying dove's length.
let dovePerched = null;
const dovePerchedReady = loadModel(dovePerchedUrl, 'Perched dove').then(gl => {
  if (!gl) return;
  const root = gl.scene; prepareModel(root, THREE.DoubleSide);
  root.updateMatrixWorld(true); root.traverse(o => o.isSkinnedMesh && o.skeleton.update());
  const box = new THREE.Box3().setFromObject(root, true), c = box.getCenter(new THREE.Vector3()), k = DOVE_SPAN * 0.66 / (box.max.z - box.min.z); // as long as the flying dove
  root.scale.setScalar(k); root.position.copy(c).multiplyScalar(-k);
  const g = new THREE.Group(); g.add(root); dovePerched = g;
});
export const makeDoveCarcass = () => (dovePerched ? cloneSkinned(dovePerched) : null);
/* ---------- Woodcock: scanned specimen, birds on the ground, downed birds and the menu card ---------- */
// "American Woodcock" by RISD Nature Lab, cut to 24k triangles by art-source/blender/woodcock.py: standing, facing +z,
// centred on its bounding box, 0.5 long bill to tail. No rig, so flying woodcock stay procedural. The scan's texture is
// dark (a museum skin under studio light): brightened toward the live bird's dead-leaf rufous.
let woodcockScan = null;
const woodcockReady = loadModel(woodcockScanUrl, 'Woodcock').then(gl => {
  if (!gl) return;
  prepareModel(gl.scene);
  gl.scene.traverse(o => { if (o.isMesh) { o.material.color.setRGB(1.75, 1.55, 1.35); o.material.envMapIntensity = 0.35; } });
  const g = new THREE.Group(); g.add(gl.scene); woodcockScan = g;
});
export const makeWoodcockModel = () => woodcockScan?.clone() ?? null;
// Resolves once every model has loaded or given up; the menu re-renders its bird cards then.
export const birdModelsReady = Promise.all([chaffinchReady, mallardReady, thrushReady, doveReady, dovePerchedReady, woodcockReady]);
