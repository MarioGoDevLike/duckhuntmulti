// Studio portraits of each quarry, rendered once from the game's own models for the menu cards.
import * as THREE from 'three';
import { QUARRY } from '../../config/gameplay.js';
import { makeBird, foldWings } from './bird.js';
import { makeMallardModel } from './models.js';
// The chaffinch card is a still, rendered offline from a colour scan of a perched chaffinch ("Pinson des arbres" by
// pattarrian) by art-source/blender/chaffinch_card.py — the scan is far too heavy to load in the game.
import chaffinchCardUrl from '../../assets/images/chaffinch_card.webp?url';

// Returns { [kind]: image URL }; only the chaffinch still if WebGL is unavailable.
export function birdPortraits(w = 360, h = 220) {
  const out = { finch: chaffinchCardUrl };
  let r;
  try {
    r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    r.setSize(w, h, false); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
    const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(28, w / h, 0.01, 50);
    const hemi = new THREE.HemisphereLight(0xfff3e0, 0x4d4834, 2.4); scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffe4c4, 2.8); key.position.set(2, 3, 3); scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 1.6); rim.position.set(-3, 1.5, -2); scene.add(rim);
    for (const kind of Object.keys(QUARRY)) {
      if (out[kind]) continue;
      // The real model makes the better portrait: the standing drake.
      const card = kind === 'duck' ? makeMallardModel() : null;
      const d = card ? { g: card, wings: [] } : makeBird(QUARRY[kind].bird ?? kind, true); foldWings(d);
      d.g.rotation.set(QUARRY[kind].night ? -0.35 : 0.08, -1.0, 0); // on the roost it sits up
      // At night: the bird as the lamp finds it, lit hard from the front out of the dark.
      const dark = !!QUARRY[kind].night;
      hemi.intensity = dark ? 0.12 : 2.4; rim.intensity = dark ? 0.15 : 1.6;
      key.color.set(dark ? 0xfff0d6 : 0xffe4c4); key.intensity = dark ? 5.5 : 2.8; key.position.set(dark ? 0.6 : 2, dark ? 0.4 : 3, 3);
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
