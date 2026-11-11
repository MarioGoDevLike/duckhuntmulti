// Studio portraits of each quarry, rendered once from the game's own models for the menu cards.
import * as THREE from 'three';
import { QUARRY } from '../../config/gameplay.js';
import { makeBird, foldWings, SCAN_FACE } from './bird.js';
import { makeFinchCarcass, makeMallardModel } from './models.js';

// Returns { [kind]: dataURL }; empty if WebGL is unavailable.
export function birdPortraits(w = 360, h = 220) {
  const out = {};
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(w, h, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, w / h, 0.01, 50);
    scene.add(new THREE.HemisphereLight(0xfff3e0, 0x4d4834, 2.4));
    const key = new THREE.DirectionalLight(0xffe4c4, 2.8); key.position.set(2, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 1.6); rim.position.set(-3, 1.5, -2); scene.add(rim);
    for (const kind of Object.keys(QUARRY)) {
      // The real models make the better portraits: the standing drake, and the chaffinch scan turned to the camera.
      const card = kind === 'duck' ? makeMallardModel() : kind === 'finch' ? makeFinchCarcass() : null;
      const d = card ? { g: card, wings: [] } : makeBird(kind, true); foldWings(d);
      if (kind === 'finch' && card) d.g.quaternion.setFromEuler(SCAN_FACE); else d.g.rotation.set(0.08, -1.0, 0);
      scene.add(d.g);
      d.g.updateMatrixWorld(true); d.g.traverse(o => { if (o.isSkinnedMesh) o.computeBoundingBox(); }); // frame the folded pose
      const box = new THREE.Box3().setFromObject(d.g), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length();
      cam.position.set(c.x + size * 0.08, c.y + size * 0.22, c.z + size * 1.05); cam.lookAt(c);
      r.render(scene, cam); out[kind] = r.domElement.toDataURL('image/png'); scene.remove(d.g);
    }
  } catch (e) { console.warn('Bird portraits unavailable', e); }
  r?.dispose(); r?.forceContextLoss();
  return out;
}
