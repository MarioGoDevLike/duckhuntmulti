// Studio side-on shots of each shotgun, rendered from the very guns in the hunter's hands (the loaded model once it
// has arrived, the procedural gun until then or if it failed), so the menu card always shows the gun you get.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { makeSemiAuto } from './semiAuto.js';
import { makeOverUnder } from './overUnder.js';
import { semiAutoModelReady } from './semiAutoModel.js';
import { overUnderModelReady } from './overUnderModel.js';

// Resolves to { semi, double }: each gun's loaded spec, or null where the procedural gun stands in.
export const gunModelsReady = Promise.all([semiAutoModelReady, overUnderModelReady]).then(([semi, double]) => ({ semi, double }));

const PROCEDURAL = { semi: makeSemiAuto, double: makeOverUnder };

// models: as gunModelsReady resolves (omit for the procedural guns). Returns { semi, double } image data URLs, sized
// for the menu's wide gun strip; empty if WebGL is unavailable.
export function gunPortraits(models = {}, w = 720, h = 200) {
  const out = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(w, h, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.85;
    const scene = new THREE.Scene();
    // Something for the steel to reflect; kept dim so the finishes read as they do out in the field, not studio-bright.
    const pm = new THREE.PMREMGenerator(r); scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture; pm.dispose();
    scene.environmentIntensity = 0.45;
    const key = new THREE.DirectionalLight(0xfff1dc, 2.2); key.position.set(1, 3, 4); scene.add(key);
    const rim = new THREE.DirectionalLight(0xd6e4ff, 1.4); rim.position.set(-2, 1, -3); scene.add(rim);
    const cam = new THREE.PerspectiveCamera(16, w / h, 0.05, 50);
    for (const kind of Object.keys(PROCEDURAL)) {
      const gun = models[kind] ? cloneSkinned(models[kind].gun) : PROCEDURAL[kind]();
      // Gun space has the barrels along -z: turn it so the muzzle points right and its right side faces the camera.
      const holder = new THREE.Group(); holder.rotation.set(0, -Math.PI / 2, 0.035); holder.add(gun); scene.add(holder);
      holder.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(holder, true), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
      // Fit the gun's length to the frame with a little margin, seen from slightly above.
      const fit = Math.max(size.x / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect), size.y / (2 * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)))) * 1.08;
      cam.position.set(c.x, c.y + fit * 0.06, c.z + fit); cam.lookAt(c);
      r.render(scene, cam); out[kind] = r.domElement.toDataURL('image/png');
      scene.remove(holder);
    }
  } catch (e) { console.warn('Gun portraits unavailable', e); }
  r?.dispose(); r?.forceContextLoss();
  return out;
}
