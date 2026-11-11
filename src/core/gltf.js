// Loading the Sketchfab models. Each resolves to the glTF, or to null if it fails — callers then keep their
// procedural stand-in, so a missing file never breaks the game.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
export const loadModel = (url, what) => new Promise(done => loader.load(url, gl => { adoptSpecGloss(gl); done(gl); }, undefined, e => {
  console.warn(`${what} model unavailable; using the procedural stand-in`, e); done(null);
}));

// Older exports keep their colours in KHR_materials_pbrSpecularGlossiness, which three.js no longer reads, so those
// models load plain white. Carry the diffuse colour and glossiness over to the standard material.
function adoptSpecGloss(gl) {
  const defs = gl.parser.json.materials || [];
  gl.scene.traverse(o => {
    if (!o.isMesh) return;
    const idx = gl.parser.associations.get(o.material)?.materials ?? defs.findIndex(d => d.name === o.material.name);
    const sg = defs[idx]?.extensions?.KHR_materials_pbrSpecularGlossiness;
    if (!sg) return;
    const [r, g, b] = sg.diffuseFactor ?? [1, 1, 1];
    o.material.color.setRGB(r, g, b); // glTF factors are linear, as is three's working colour space
    o.material.roughness = 1 - (sg.glossinessFactor ?? 1); o.material.metalness = 0;
  });
}

// Common material and culling setup for a loaded scene.
export const prepareModel = (root, side = THREE.FrontSide) => root.traverse(o => {
  if (!o.isMesh) return;
  o.material.envMapIntensity = 0.5; o.material.side = side;
  if (o.isSkinnedMesh) o.frustumCulled = false; // limbs sweep far outside the bind-pose bounds
});

// First bone whose name starts with prefix.
export function findBone(root, prefix) {
  let f = null; root.traverse(o => { if (!f && o.isBone && o.name.startsWith(prefix)) f = o; }); return f;
}
