import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { TAU } from '../../core/math.js';
import { loadModel, prepareModel, findBone } from '../../core/gltf.js';
import labradorModelUrl from '../../assets/models/labrador.glb?url';

/* ---------- Retriever: rigged Labrador ---------- */
// "Labrador Dog" by kenchoo. assets/models/labrador.glb is art-source/models/labrador_dog.glb slimmed for the web (duplicate UV sets and
// tangents dropped, textures re-encoded as JPEG; 9.8 → 5.0 MB). It stands facing +z on y = 0 and carries a 13 s idle
// (breathing, ears, tail, a sniff). It has no run, so the gallop is laid over the idle on the leg bones here.
// Scaled to the procedural dog's size (~0.83 tall), big enough to carry a mallard.
const DOG_SCALE = 0.3;
// [upper bone, lower bone, phase offset, swing, knee/hock fold]: fore pair and hind pair in opposition, the right
// of each pair a little behind the left (a rotary gallop rather than a pronk). Swing + is backward.
const GAIT = [['FrontUpperLegL', 'FrontLowerLegL', 0, 0.55, 0.9], ['FrontUpperLegR', 'FrontLowerLegR', 0.35, 0.55, 0.9],
  ['BackUpperLegL', 'BackLowerLegL', Math.PI, 0.45, 0.7], ['BackUpperLegR', 'BackLowerLegR', Math.PI + 0.35, 0.45, 0.7]];
let labrador = null;
export const dogModelReady = loadModel(labradorModelUrl, 'Labrador').then(gl => {
  if (!gl) return;
  const root = gl.scene; prepareModel(root, THREE.DoubleSide);
  const bone = p => findBone(root, p);
  // Rest pose = the idle's first frame, which is where the axes and the mouth are measured.
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(gl.animations[0]); act.play(); mixer.setTime(0);
  root.updateMatrixWorld(true);
  // Each leg bone swings about the dog's side axis; express that axis in the bone's parent frame once.
  const sideIn = b => new THREE.Vector3(1, 0, 0).applyQuaternion(b.parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  const gait = GAIT.map(([u, l, off, swing, fold]) => { const up = bone(u), lo = bone(l); return { up: up.name, lo: lo.name, upAxis: sideIn(up), loAxis: sideIn(lo), off, swing, fold }; });
  // The jaws: just behind and below the nose tip, as a point in the head bone's frame.
  const head = bone('Head'), mouth = head.worldToLocal(new THREE.Vector3(0, 2.14, 2.3));
  act.stop(); mixer.uncacheRoot(root);
  root.scale.setScalar(DOG_SCALE);
  labrador = { root, clip: gl.animations[0], gait, head: head.name, mouth };
});
// { g, head, mouth, animate(dt, running, t) } — the same shape as the procedural dog, so either can retrieve.
export function makeLabrador() {
  const K = labrador; if (!K) return null;
  const g = new THREE.Group(), m = cloneSkinned(K.root); g.add(m);
  const mixer = new THREE.AnimationMixer(m), idle = mixer.clipAction(K.clip); idle.play();
  const legs = K.gait.map(L => ({ ...L, up: m.getObjectByName(L.up), lo: m.getObjectByName(L.lo), baseUp: new THREE.Quaternion(), baseLo: new THREE.Quaternion() }));
  const q = new THREE.Quaternion(); let ph = 0, run = 0, posed = false;
  return {
    g, head: m.getObjectByName(K.head), mouth: K.mouth.clone(),
    animate(dt, running) {
      // The mixer only rewrites a bone when its animated value changes, so put back the idle pose under last
      // frame's gallop first; otherwise the gallop would pile up on legs the idle holds still.
      if (posed) for (const L of legs) { L.up.quaternion.copy(L.baseUp); L.lo.quaternion.copy(L.baseLo); }
      mixer.update(dt);
      for (const L of legs) { L.baseUp.copy(L.up.quaternion); L.baseLo.copy(L.lo.quaternion); }
      posed = true;
      run += ((running ? 1 : 0) - run) * Math.min(1, dt * 8); // ease into and out of the gallop
      if (run < 0.01) { m.position.y = 0; m.rotation.x = 0; return; }
      ph += dt * TAU * 2.4;
      for (const L of legs) {
        L.up.quaternion.premultiply(q.setFromAxisAngle(L.upAxis, L.swing * Math.sin(ph + L.off) * run));
        L.lo.quaternion.premultiply(q.setFromAxisAngle(L.loAxis, L.fold * Math.max(0, Math.cos(ph + L.off)) * run));
      }
      m.position.y = Math.abs(Math.sin(ph)) * 0.035 * run; // the bound
      m.rotation.x = Math.sin(ph) * 0.05 * run;            // and the rock of the back
    },
  };
}
