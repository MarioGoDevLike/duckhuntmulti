// Detailed models for the guns and the quarry.
//
// Guns are built from side profiles traced from reference photos: each part is a closed outline in the
// (forward, up) plane, extruded across its width and bevelled, so stocks, grips and receivers have real
// silhouettes and rounded edges. Gun space: barrels run along -z, the rib is on +y, the shooter's eye is at +z.
//
// Birds share one builder: a lathed body wearing a painted, feather-textured skin, a vertex-coloured head,
// a shaped bill, glossy eyes, tucked legs, and wings made of individual feathers (a covert panel and a row of
// secondaries on the arm, fanned primaries on the hand), plus a fanned tail. Bird space: facing +z.
// Every bird returns { g, wings: [[inner, outer], ...] } — inner flaps about z and folds about y, outer is the hand.
//
// Where a real model exists the game uses it instead (see "Loaded bird models"): the thrush is a rigged model
// that flies, a downed chaffinch is a photogrammetry scan, and a downed mallard is a sculpted model.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import chaffinchScanUrl from './assets/chaffinch.glb?url';
import thrushModelUrl from './assets/thrush_3D.glb?url';
import mallardModelUrl from './assets/duck_3d.glb?url';
import labradorModelUrl from './assets/labrador.glb?url';

const TAU = Math.PI * 2;
const { clamp, smoothstep, lerp } = THREE.MathUtils;
const rnd = (a, b) => a + Math.random() * (b - a);
const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent?.add(m); return m; };

/* ======================================================================================================
   Shared surfaces
   ====================================================================================================== */
const canvasTex = (w, h, paint, { repeat = 1, srgb = true } = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
};
// Fine stipple for synthetic stocks: read as a bump map, it gives the grippy moulded texture.
const stipple = () => canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2600; i++) { const v = rnd(60, 200) | 0; g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd(0, w), rnd(0, h), 1.6, 1.6); }
}, { repeat: 26, srgb: false });
// Laminated wood: thin dyed veneers in black and greys, cut at a slant so they show as wavy, flowing bands.
const laminate = () => canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#242424'; g.fillRect(0, 0, w, h);
  for (let y = -60; y < h + 60; y += rnd(2, 7)) {
    const l = Math.random() < 0.7 ? rnd(6, 24) : rnd(30, 46), a = rnd(6, 22), f = rnd(0.006, 0.02), p = rnd(0, 6);
    g.strokeStyle = `hsl(36,5%,${l}%)`; g.lineWidth = rnd(1.2, 4.5); g.beginPath();
    for (let x = 0; x <= w; x += 6) g.lineTo(x, y + Math.sin(x * f + p) * a + Math.sin(x * f * 3.1 + p) * a * 0.25);
    g.stroke();
  }
}, { repeat: 4 });

let gunMats = null;
function mats() {
  if (gunMats) return gunMats;
  const bump = stipple();
  gunMats = {
    blued: new THREE.MeshPhysicalMaterial({ color: 0x0c0d10, metalness: 0.92, roughness: 0.26, clearcoat: 0.7, clearcoatRoughness: 0.18, envMapIntensity: 1.1 }),
    satin: new THREE.MeshPhysicalMaterial({ color: 0x141518, metalness: 0.85, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4, envMapIntensity: 0.9 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, metalness: 0.7, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2 }),
    steel: new THREE.MeshStandardMaterial({ color: 0xc9ccd2, metalness: 1, roughness: 0.22, envMapIntensity: 1.2 }),
    polymer: new THREE.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.8, metalness: 0.02, bumpMap: bump, bumpScale: 0.6, envMapIntensity: 0.45 }),
    grip: new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.95, metalness: 0, bumpMap: bump, bumpScale: 1.6, envMapIntensity: 0.3 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x111112, roughness: 0.96, envMapIntensity: 0.25 }),
    wood: new THREE.MeshPhysicalMaterial({ map: laminate(), roughness: 0.42, clearcoat: 0.65, clearcoatRoughness: 0.22, envMapIntensity: 0.8 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe0281c, emissive: 0x7a0c06, roughness: 0.35 }),
    green: new THREE.MeshStandardMaterial({ color: 0x2b9a44, metalness: 0.5, roughness: 0.3 }),
    fibreRed: new THREE.MeshStandardMaterial({ color: 0xff3b1f, emissive: 0xff2a10, emissiveIntensity: 0.9, roughness: 0.3 }),
    fibreWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xdfe8d0, emissiveIntensity: 0.5, roughness: 0.3 }),
  };
  return gunMats;
}

// Side-profile solid. pts: [forward, up] (forward = toward the muzzle = -z). Extruded `width` across x and
// bevelled; smooth outlines go through a Catmull-Rom spline, so a few points give a flowing shape.
function profile(pts, width, { bevel = 0.004, smooth = true, holes = [], seg = 4 } = {}) {
  const outline = (path, p) => {
    const v = p.map(([f, y]) => new THREE.Vector2(f, y));
    path.moveTo(v[0].x, v[0].y);
    if (smooth) path.splineThru([...v.slice(1), v[0]]); else { v.slice(1).forEach(q => path.lineTo(q.x, q.y)); path.lineTo(v[0].x, v[0].y); }
  };
  const shape = new THREE.Shape(); outline(shape, pts);
  for (const h of holes) { const p = new THREE.Path(); outline(p, h); shape.holes.push(p); }
  const d = Math.max(0.0004, width - 2 * bevel);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: seg, curveSegments: 14 });
  return geo.translate(0, 0, -d / 2).rotateY(Math.PI / 2);
}
// Round bar along z: rRear at the breech end, rFront at the muzzle end.
const tube = (rRear, rFront, len, seg = 28) => new THREE.CylinderGeometry(rRear, rFront, len, seg, 1).rotateX(Math.PI / 2);
const tubeX = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
const ring = (g, r, w, z, y, mat) => mesh(tube(r, r, w), mat, g, 0, y, z);
// Knurled band: a few thin raised rings.
function knurl(g, r, z0, z1, y, mat, n = 4) { for (let i = 0; i < n; i++) ring(g, r, 0.0015, lerp(z0, z1, (i + 0.5) / n), y, mat); }

/* ======================================================================================================
   Semi-auto — black synthetic waterfowl gun (after the A400-style reference photos)
   ====================================================================================================== */
export function makeSemiAuto() {
  const K = mats(), g = new THREE.Group(), BY = 0.018;           // barrel axis height
  // Barrel: tapered, with an extended, knurled choke.
  mesh(tube(0.0118, 0.0101, 0.69), K.blued, g, 0, BY, -0.585);
  mesh(tube(0.0119, 0.0119, 0.036), K.satin, g, 0, BY, -0.946);
  knurl(g, 0.0123, -0.94, -0.962, BY, K.satin);
  // Vented rib: a thin plate standing on posts, fibre-optic bead at the muzzle, a small mid bead.
  mesh(profile([[0.24, 0.0335], [0.93, 0.0335], [0.93, 0.0362], [0.24, 0.0362]], 0.0075, { bevel: 0.0008, smooth: false }), K.blued, g);
  for (let z = -0.27; z > -0.92; z -= 0.055) mesh(new THREE.BoxGeometry(0.0035, 0.0055, 0.008), K.blued, g, 0, 0.031, z);
  mesh(new THREE.BoxGeometry(0.006, 0.006, 0.014), K.satin, g, 0, 0.039, -0.918);
  mesh(new THREE.SphereGeometry(0.0028, 12, 10), K.fibreRed, g, 0, 0.0405, -0.913);
  mesh(new THREE.SphereGeometry(0.0016, 8, 6), K.steel, g, 0, 0.0375, -0.58);
  // Magazine tube and its knurled cap.
  mesh(tube(0.0105, 0.0105, 0.46), K.blued, g, 0, -0.0095, -0.4);
  mesh(tube(0.0138, 0.0128, 0.034), K.polymer, g, 0, -0.0095, -0.645);
  knurl(g, 0.0141, -0.634, -0.656, -0.0095, K.polymer, 5);
  // Forend: long and rounded, with stippled grip panels on both sides.
  mesh(profile([[0.165, 0.004], [0.3, 0.006], [0.47, 0.004], [0.515, -0.002], [0.522, -0.016], [0.51, -0.03], [0.46, -0.036],
    [0.3, -0.039], [0.18, -0.036], [0.165, -0.018]], 0.054, { bevel: 0.013 }), K.polymer, g);
  for (const x of [-1, 1]) {
    const p = mesh(profile([[0.21, -0.002], [0.45, -0.002], [0.46, -0.026], [0.22, -0.03]], 0.004, { bevel: 0.0012, smooth: false }), K.grip, g);
    p.position.x = x * 0.0268;
  }
  // Receiver: flat-topped, sloping slightly to the rear; ejection port with bolt and cocking handle on the right.
  mesh(profile([[-0.045, 0.019], [0.02, 0.027], [0.165, 0.031], [0.174, 0.024], [0.176, -0.012], [0.165, -0.025], [0.06, -0.029],
    [-0.02, -0.03], [-0.045, -0.024]], 0.047, { bevel: 0.006 }), K.satin, g);
  mesh(profile([[0.03, 0.016], [0.12, 0.018], [0.12, 0.002], [0.03, 0.002]], 0.002, { bevel: 0.0005, smooth: false }), K.gloss, g).position.x = 0.0236;
  mesh(new THREE.BoxGeometry(0.003, 0.011, 0.07), K.steel, g, 0.0238, 0.009, -0.075);
  const handle = mesh(tubeX(0.0042, 0.022), K.steel, g, 0.034, 0.009, -0.098);
  mesh(new THREE.SphereGeometry(0.0055, 12, 10), K.steel, handle, 0.011, 0, 0);
  mesh(new THREE.BoxGeometry(0.002, 0.007, 0.02), K.steel, g, -0.0238, -0.006, -0.03);             // bolt release
  mesh(tubeX(0.0035, 0.052, 12), K.satin, g, 0, -0.03, 0.035);                                       // cross-bolt safety
  // Stock: one moulded piece — comb, pistol grip and the open, adjustable-style butt with its cut-outs.
  const stock = [[-0.04, 0.02], [-0.12, 0.017], [-0.22, 0.019], [-0.33, 0.021], [-0.36, 0.022], [-0.364, -0.02], [-0.36, -0.116],
    [-0.3, -0.112], [-0.2, -0.086], [-0.15, -0.072], [-0.126, -0.104], [-0.1, -0.121], [-0.074, -0.115], [-0.06, -0.082], [-0.048, -0.047], [-0.04, -0.028]];
  mesh(profile(stock, 0.041, {
    bevel: 0.008,
    holes: [[[-0.235, -0.004], [-0.315, 0.002], [-0.318, -0.06], [-0.27, -0.03]], [[-0.225, -0.04], [-0.3, -0.095], [-0.22, -0.078]]],
  }), K.polymer, g);
  mesh(profile([[-0.07, -0.045], [-0.062, -0.08], [-0.075, -0.11], [-0.098, -0.115], [-0.105, -0.08], [-0.09, -0.05]], 0.044, { bevel: 0.004 }), K.grip, g); // grip panel
  mesh(profile([[-0.13, 0.018], [-0.32, 0.022], [-0.322, 0.034], [-0.25, 0.034], [-0.15, 0.031]], 0.036, { bevel: 0.0045 }), K.polymer, g); // cheek riser
  mesh(profile([[-0.358, 0.026], [-0.384, 0.024], [-0.388, -0.05], [-0.384, -0.12], [-0.357, -0.118]], 0.045, { bevel: 0.006 }), K.rubber, g);
  // Trigger guard (a ring with an opening) and a curved trigger blade.
  mesh(profile([[0.032, -0.022], [-0.036, -0.022], [-0.048, -0.036], [-0.02, -0.052], [0.02, -0.047], [0.036, -0.032]], 0.0065,
    { bevel: 0.0012, holes: [[[0.022, -0.028], [-0.03, -0.028], [-0.036, -0.035], [-0.017, -0.044], [0.016, -0.041]]] }), K.polymer, g);
  mesh(profile([[0.005, -0.025], [-0.001, -0.025], [-0.007, -0.034], [-0.005, -0.043], [0.002, -0.037]], 0.004, { bevel: 0.0008 }), K.steel, g);
  return g;
}

/* ======================================================================================================
   Over-under — sporting gun in black/grey laminate (after the DT11-style reference photos)
   ====================================================================================================== */
export const OU_BARRELS = [-0.0055, 0.018];   // bottom and top barrel heights
export function makeOverUnder() {
  const K = mats(), g = new THREE.Group();
  for (const y of OU_BARRELS) {
    mesh(tube(0.0113, 0.0099, 0.745), K.blued, g, 0, y, -0.53);
    mesh(tube(0.0121, 0.0121, 0.03), K.steel, g, 0, y, -0.917);                 // extended choke
    ring(g, 0.0124, 0.005, -0.905, y, K.green);                                  // coloured choke band
    knurl(g, 0.0125, -0.92, -0.93, y, K.steel, 3);
  }
  // Monoblock joining the barrels to the action.
  mesh(profile([[0.152, 0.031], [0.2, 0.031], [0.2, -0.018], [0.152, -0.018]], 0.034, { bevel: 0.004, smooth: false }), K.blued, g);
  // Vented side ribs between the barrels, and a tall vented top rib with a white bead.
  for (let z = -0.25; z > -0.89; z -= 0.05) mesh(new THREE.BoxGeometry(0.02, 0.006, 0.036), K.blued, g, 0, 0.0063, z);
  mesh(profile([[0.2, 0.0345], [0.915, 0.0345], [0.915, 0.0372], [0.2, 0.0372]], 0.008, { bevel: 0.0008, smooth: false }), K.blued, g);
  for (let z = -0.23; z > -0.9; z -= 0.05) mesh(new THREE.BoxGeometry(0.0035, 0.006, 0.007), K.blued, g, 0, 0.0315, z);
  mesh(new THREE.SphereGeometry(0.0029, 12, 10), K.fibreWhite, g, 0, 0.0398, -0.905);
  // Action: deep, with raised side panels outlined in silver, the red badge, hinge pin and top lever.
  mesh(profile([[-0.035, 0.026], [0.0, 0.031], [0.152, 0.031], [0.158, 0.022], [0.158, -0.022], [0.142, -0.034], [0.03, -0.035],
    [-0.035, -0.021]], 0.044, { bevel: 0.0045 }), K.satin, g);
  const panel = [[0.012, 0.021], [0.142, 0.021], [0.145, -0.02], [0.13, -0.027], [0.06, -0.029], [0.012, -0.019]];
  mesh(profile(panel, 0.0462, { bevel: 0.0006 }), K.steel, g);
  mesh(profile(panel.map(([f, y]) => [lerp(0.077, f, 0.94), lerp(-0.004, y, 0.9)]), 0.0478, { bevel: 0.0008 }), K.gloss, g);
  for (const x of [-1, 1]) {
    mesh(new THREE.BoxGeometry(0.0012, 0.005, 0.016), K.red, g, x * 0.0242, 0.012, -0.118);
    mesh(new THREE.BoxGeometry(0.001, 0.0012, 0.05), K.steel, g, x * 0.0242, -0.004, -0.08).rotation.x = -0.55;
  }
  mesh(tubeX(0.0062, 0.0475), K.steel, g, 0, -0.019, -0.148);                                         // hinge pin
  mesh(profile([[-0.036, 0.031], [0.012, 0.031], [0.004, 0.0372], [-0.03, 0.0372]], 0.013, { bevel: 0.0015 }), K.satin, g); // top lever
  mesh(new THREE.BoxGeometry(0.008, 0.004, 0.012), K.steel, g, 0, 0.0285, 0.05);                      // safety / selector
  // Forend: long schnabel in laminate, with its iron against the action.
  mesh(profile([[0.165, 0.004], [0.3, 0.006], [0.44, 0.005], [0.472, 0.002], [0.466, -0.014], [0.44, -0.028], [0.3, -0.032],
    [0.175, -0.031], [0.164, -0.016]], 0.05, { bevel: 0.01 }), K.wood, g);
  mesh(profile([[0.158, 0.0], [0.168, 0.0], [0.168, -0.03], [0.158, -0.03]], 0.044, { bevel: 0.003, smooth: false }), K.satin, g);
  // Stock: laminate, pistol grip with palm swell, straight butt; adjustable comb riding on two steel posts.
  const stock = [[-0.035, 0.022], [-0.06, 0.013], [-0.14, 0.011], [-0.34, 0.012], [-0.36, 0.016], [-0.366, -0.02], [-0.36, -0.127],
    [-0.3, -0.117], [-0.2, -0.089], [-0.15, -0.073], [-0.125, -0.105], [-0.1, -0.122], [-0.074, -0.116], [-0.058, -0.08], [-0.045, -0.05], [-0.036, -0.03]];
  mesh(profile(stock, 0.043, { bevel: 0.009 }), K.wood, g);
  mesh(profile([[-0.13, 0.018], [-0.335, 0.021], [-0.335, 0.037], [-0.25, 0.037], [-0.15, 0.033], [-0.133, 0.027]], 0.036, { bevel: 0.0055 }), K.wood, g);
  for (const z of [0.17, 0.3]) mesh(new THREE.CylinderGeometry(0.0028, 0.0028, 0.012, 10), K.steel, g, 0, 0.017, z);
  mesh(profile([[-0.36, 0.019], [-0.386, 0.017], [-0.39, -0.05], [-0.386, -0.13], [-0.358, -0.128]], 0.046, { bevel: 0.006 }), K.rubber, g);
  mesh(profile([[-0.082, -0.112], [-0.104, -0.12], [-0.11, -0.124], [-0.088, -0.122]], 0.03, { bevel: 0.003 }), K.satin, g); // grip cap
  // Round trigger guard and a single blade trigger.
  const guard = mesh(new THREE.TorusGeometry(0.019, 0.0028, 10, 32).rotateY(Math.PI / 2), K.satin, g, 0, -0.033, -0.03);
  guard.scale.set(1, 0.85, 1.15);
  mesh(profile([[0.004, -0.026], [-0.004, -0.026], [-0.01, -0.036], [-0.007, -0.046], [0.0, -0.039]], 0.004, { bevel: 0.0008 }), K.steel, g);
  return g;
}

/* ======================================================================================================
   Birds
   ====================================================================================================== */
const featherShape = (len, w, tip = 0.82) => {
  const s = new THREE.Shape(), p = [[w * 0.5, len * 0.28], [w * 0.46, len * tip], [0, len], [-w * 0.46, len * tip], [-w * 0.5, len * 0.28], [0, 0]];
  s.moveTo(0, 0); s.splineThru(p.map(([x, y]) => new THREE.Vector2(x, y)));
  return new THREE.ShapeGeometry(s, 8);
};
// Along -z (secondaries, tail) and along +x (primaries), lying flat (normal ±y).
const featherBack = (len, w, tip) => featherShape(len, w, tip).rotateX(-Math.PI / 2);
const featherOut = (len, w, tip) => featherShape(len, w, tip).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2);
// A flat panel in the x-z plane from [x, z] points (z toward the head).
const flat = pts => {
  const s = new THREE.Shape(); s.moveTo(pts[0][0], -pts[0][1]);
  s.splineThru([...pts.slice(1), pts[0]].map(([x, z]) => new THREE.Vector2(x, -z)));
  return new THREE.ShapeGeometry(s, 10).rotateX(-Math.PI / 2);
};
const pm = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.82, side: THREE.DoubleSide, envMapIntensity: 0.6, ...o });
// A feather with a pale fringe: the fringe is the same feather a touch larger, just beneath it, and one-sided so it
// only shows round the edge from above; from below the dark feather is all you see.
const edgeCache = new Map();
const edgeOnly = m => { if (!edgeCache.has(m)) { const e = m.clone(); e.side = THREE.FrontSide; edgeCache.set(m, e); } return edgeCache.get(m); };
function fringed(parent, geo, mat, edgeMat, x, y, z, ry, k = 1.12) {
  const f = mesh(geo, mat, parent, x, y, z); f.rotation.y = ry;
  if (edgeMat) { const e = mesh(geo, edgeOnly(edgeMat), parent, x, y - 0.0006, z); e.rotation.y = ry; e.scale.set(k, 1, k); }
  return f;
}
const C = c => new THREE.Color(c);
const mix = (a, b, t) => C(a).lerp(C(b), clamp(t, 0, 1));

// Painted skin for the lathed body. u runs round the body (0 = belly, 0.5 = back), v from tail (0) to head (1).
// colour(up, t) gives the base plumage; extras paint spots, vermiculation or mottling on top.
function bodySkin(colour, extras) {
  return canvasTex(512, 256, (g, W, H) => {
    const img = g.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const up = -Math.cos(TAU * x / W), t = 1 - y / H, k = colour(up, t), i = (y * W + x) * 4;
      d[i] = k.r * 255; d[i + 1] = k.g * 255; d[i + 2] = k.b * 255; d[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    for (let i = 0; i < 1400; i++) { // overlapping feather tips: soft scallops opening toward the head
      const x = rnd(0, W), y = rnd(0, H), r = rnd(4, 9);
      g.strokeStyle = `rgba(0,0,0,${rnd(0.05, 0.12)})`; g.lineWidth = 1.2;
      g.beginPath(); g.arc(x, y, r, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      g.strokeStyle = `rgba(255,255,255,${rnd(0.03, 0.07)})`; g.beginPath(); g.arc(x, y - 1.2, r, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    }
    extras?.(g, W, H);
  });
}
// Draw on both sides of the seam at u = 0/1 so marks wrap round the belly cleanly.
const wrapDraw = (W, x, draw) => { draw(x); if (x < 40) draw(x + W); if (x > W - 40) draw(x - W); };

function buildBird(S) {
  const g = new THREE.Group(), r = S.R;
  // Body
  const body = new THREE.LatheGeometry(S.body.map(([rad, h]) => new THREE.Vector2(rad * r, h * r)), 40).rotateX(Math.PI / 2).scale(1, S.flat ?? 0.93, 1);
  mesh(body, new THREE.MeshStandardMaterial({ map: S.skin, roughness: 0.86, envMapIntensity: 0.55 }), g);
  // Head (vertex-coloured), eyes, bill
  const hr = S.head.r * r, head = new THREE.Group(); head.position.set(0, S.head.y * r, S.head.z * r); g.add(head);
  const hg = new THREE.SphereGeometry(hr, 32, 24).scale(1, 1, S.head.sz ?? 1.08), p = hg.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = S.head.colour(p.getX(i) / hr, p.getY(i) / hr, p.getZ(i) / hr); col.set([k.r, k.g, k.b], i * 3); }
  hg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  mesh(hg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: S.head.gloss ? 0.35 : 0.8, metalness: S.head.gloss ? 0.25 : 0, envMapIntensity: S.head.gloss ? 1.2 : 0.55 }), head);
  const eyeM = new THREE.MeshPhysicalMaterial({ color: 0x050505, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.02 });
  for (const sx of [-1, 1]) {
    if (S.eyeRing) mesh(new THREE.TorusGeometry(hr * 0.2, hr * 0.045, 8, 20).rotateY(Math.PI / 2), pm(S.eyeRing), head, sx * hr * 0.72, hr * 0.2, hr * 0.48);
    mesh(new THREE.SphereGeometry(hr * 0.17, 16, 12), eyeM, head, sx * hr * 0.74, hr * 0.2, hr * 0.48);
  }
  const bill = new THREE.LatheGeometry(S.bill.shape.map(([rad, h]) => new THREE.Vector2(rad * hr, h * hr)), 18).rotateX(Math.PI / 2).scale(S.bill.sx ?? 1, S.bill.sy ?? 1, 1);
  const bc = bill.attributes.position, bcol = new Float32Array(bc.count * 3);
  for (let i = 0; i < bc.count; i++) { const k = mix(S.bill.base, S.bill.tip, smoothstep(bc.getZ(i) / hr, S.bill.split, S.bill.split + 0.25)); bcol.set([k.r, k.g, k.b], i * 3); }
  bill.setAttribute('color', new THREE.BufferAttribute(bcol, 3));
  mesh(bill, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, envMapIntensity: 0.8 }), head, 0, S.bill.y * hr, hr * 0.82);
  // Tail: fanned feathers (outer ones may be a different colour), plus optional extras (a drake's curls).
  const tail = new THREE.Group(); tail.position.set(0, S.tail.y * r, S.tail.z * r); tail.rotation.x = S.tail.tilt ?? -0.08; g.add(tail);
  const tg = featherBack(S.tail.len * r, S.tail.w * r, 0.9);
  for (let i = 0; i < S.tail.n; i++) {
    const t = i / (S.tail.n - 1) - 0.5, outer = Math.abs(t) > 0.38;
    fringed(tail, tg, outer && S.tail.outer ? S.tail.outer : S.tail.mat, S.tail.edge, t * S.tail.spread * r, i * 0.0002, 0, -t * (S.tail.fan ?? 0.5));
  }
  S.tail.extra?.(tail, r);
  // Legs, tucked back under the body.
  if (S.legs) {
    const lm = pm(S.legs, { roughness: 0.6, side: THREE.FrontSide });
    for (const sx of [-1, 1]) {
      const leg = new THREE.Group(); leg.position.set(sx * 0.18 * r, -0.62 * r, -0.2 * r); leg.rotation.x = -1.25; g.add(leg);
      mesh(new THREE.CylinderGeometry(0.035 * r, 0.03 * r, 0.42 * r, 8).translate(0, -0.21 * r, 0), lm, leg);
      for (const a of [-0.35, 0, 0.35]) {
        const toe = mesh(new THREE.CylinderGeometry(0.018 * r, 0.01 * r, 0.24 * r, 6).translate(0, -0.12 * r, 0), lm, leg, 0, -0.42 * r, 0);
        toe.rotation.set(-1.2, 0, a);
      }
    }
  }
  // Wings
  const wings = [];
  for (const side of [1, -1]) {
    const sh = new THREE.Group(), inner = new THREE.Group(), outer = new THREE.Group();
    sh.scale.x = side; sh.position.set(side * S.wing.x * r, S.wing.y * r, S.wing.z * r);
    const A = S.wing.arm * r, P = S.wing.hand * r, ch = S.wing.chord * r;
    outer.position.x = A;
    // Arm: covert panel (with any patches), and secondaries hanging back from its trailing edge.
    mesh(flat([[0, ch * 0.45], [A * 0.5, ch * 0.55], [A, ch * 0.42], [A, -ch * 0.15], [A * 0.5, -ch * 0.2], [0, -ch * 0.1]]), S.wing.coverts, inner, 0, 0.0008, 0);
    S.wing.patches?.(inner, A, ch);
    const sg = featherBack(ch * 0.85, A / S.wing.nSec * 1.5, 0.86);
    for (let i = 0; i < S.wing.nSec; i++) fringed(inner, sg, S.wing.secondary, S.wing.secEdge, A * (i + 0.5) / S.wing.nSec, -i * 0.0001, -ch * 0.05, 0.02 * i);
    // Hand: primaries fanned from the leading edge back toward the trailing edge.
    const n = S.wing.nPrim, pg = featherOut(P, ch * 0.42, 0.78);
    for (let i = 0; i < n; i++) {
      const a = 0.06 + (i / (n - 1)) * S.wing.fan, len = 1 - i * 0.045;
      const f = fringed(outer, pg, S.wing.primary, S.wing.primEdge, 0, -i * 0.0002, ch * 0.28 - i * ch * 0.04, a);
      f.scale.x = len; f.scale.z = len;
    }
    mesh(flat([[0, ch * 0.42], [P * 0.45, ch * 0.3], [P * 0.4, -ch * 0.05], [0, -ch * 0.15]]), S.wing.handCoverts ?? S.wing.coverts, outer, 0, 0.001, 0);
    S.wing.under?.(inner, A, ch);
    inner.add(outer); sh.add(inner); g.add(sh); wings.push([inner, outer]);
  }
  g.scale.setScalar(S.scale);
  // foldDrop: how far a closed wing sits below its flight hinge, so the coverts lie on the flank, not above the back.
  return { g, wings, foldDrop: (S.wing.drop ?? 0) * r };
}

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

/* ======================================================================================================
   Loaded bird models (Sketchfab, CC-BY-4.0; credited in the menu)
   Each loads once in the background; until it arrives, or if it fails, the procedural bird stands in.
   Clones share geometry and textures, so a sky or a pile full of them costs little.
   ====================================================================================================== */
const gltf = new GLTFLoader();
const loadModel = (url, what) => new Promise(done => gltf.load(url, done, undefined, e => {
  console.warn(`${what} model unavailable; using the procedural bird`, e); done(null);
}));
const finish = (root, side = THREE.FrontSide) => root.traverse(o => {
  if (!o.isMesh) return;
  o.material.envMapIntensity = 0.5; o.material.side = side;
  if (o.isSkinnedMesh) o.frustumCulled = false; // the wings sweep far outside the bind-pose bounds
});

/* ---------- Chaffinch: photogrammetry scan, downed birds only ---------- */
// "Dead Chaffinch" by b-unicycling, a scan of a male lying on bark mulch. assets/chaffinch.glb is the bird cut out
// of that scan (dead_chaffinch.glb): ground removed, underside sealed, texture cut to 2048². Bird space: lying on
// its side, head toward +z, resting on y = 0, ~0.38 long like makeFinch. No rig, so flying chaffinches stay procedural.
let chaffinchScan = null;
const chaffinchReady = loadModel(chaffinchScanUrl, 'Chaffinch').then(gl => { if (gl) { finish(gl.scene, THREE.DoubleSide); chaffinchScan = gl.scene; } });
export const makeFinchCarcass = () => chaffinchScan?.clone() ?? null;

/* ---------- Mallard: sculpted drake, downed birds and the menu card ---------- */
// "Realistic Mallard Duck - Game Ready Asset" by 3Dima. A standing drake facing +z, centred on the origin, 1.0 long;
// scaled to the procedural duck's 0.96. Static (no rig), so flying ducks stay procedural; on the ground it is laid on
// its side — on its belly the upright neck would read as a live, sitting duck.
let mallard = null;
const mallardReady = loadModel(mallardModelUrl, 'Mallard').then(gl => {
  if (!gl) return;
  finish(gl.scene); const g = new THREE.Group(); gl.scene.scale.setScalar(0.96); g.add(gl.scene); mallard = g;
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
  const root = gl.scene; finish(root, THREE.DoubleSide); root.updateMatrixWorld(true);
  const bones = ['r', 'l'].flatMap(s => WING_BONES.map(n => findBone(root, `${n}_${s}`)));
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(gl.animations[0]); act.play();
  const sample = t => { mixer.setTime(t); return bones.map(b => b.quaternion.clone()); };
  const UP = sample(0), MID = sample(0.25), DOWN = sample(0.5);
  act.stop(); mixer.uncacheRoot(root);
  // Folded: from the spread pose, collapse each wing's span toward the body (the feathers already trail to the tail),
  // sweep the tips in and drape the wing down over the flank. Rotations about the model's own axes; tuned by eye.
  bones.forEach((b, i) => b.quaternion.copy(MID[i]));
  const FOLD_SPAN = 0.18;
  for (const [s, sg] of [['r', 1], ['l', -1]]) {
    const w = findBone(root, `wingLength01_${s}`);
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
  thrushRig = { root, UP, MID, DOWN, FOLD, FOLD_SPAN, names: bones.map(b => b.name) };
});
function findBone(root, prefix) { let f = null; root.traverse(o => { if (!f && o.isBone && o.name.startsWith(prefix + '_')) f = o; }); return f; }
// { g, wings: [], rig } — rig.pose(stroke, fold): stroke −1 (wings down) … 0 (spread) … 1 (up); fold 0 (open) … 1 (closed).
export function makeThrushModel() {
  const K = thrushRig; if (!K) return null;
  const g = new THREE.Group(), m = cloneSkinned(K.root); g.add(m);
  const bones = K.names.map(n => m.getObjectByName(n)), roots = bones.filter(b => b.name.startsWith('wingLength01'));
  const rig = {
    fold: 0,
    pose(stroke, fold) {
      const to = stroke >= 0 ? K.UP : K.DOWN, t = Math.abs(stroke);
      bones.forEach((b, i) => b.quaternion.slerpQuaternions(K.MID[i], to[i], t).slerp(K.FOLD[i], fold));
      for (const r of roots) r.scale.set(1, 1 + (K.FOLD_SPAN - 1) * fold, 1);
    },
  };
  rig.pose(0, 1);
  return { g, wings: [], rig };
}
// Resolves once every model has loaded or given up; the menu re-renders its bird cards then.
export const birdModelsReady = Promise.all([chaffinchReady, mallardReady, thrushReady]);

/* ---------- Retriever: rigged Labrador ---------- */
// "Labrador Dog" by kenchoo. assets/labrador.glb is labrador_dog.glb slimmed for the web (duplicate UV sets and
// tangents dropped, textures re-encoded as JPEG; 9.8 → 5.0 MB). It stands facing +z on y = 0 and carries a 13 s idle
// (breathing, ears, tail, a sniff). It has no run, so the gallop is laid over the idle on the leg bones here.
// Scaled to the procedural dog's size (~0.83 tall), big enough to carry a mallard.
const DOG_SCALE = 0.3, TAU2 = Math.PI * 2;
// [upper bone, lower bone, phase offset, swing, knee/hock fold]: fore pair and hind pair in opposition, the right
// of each pair a little behind the left (a rotary gallop rather than a pronk). Swing + is backward.
const GAIT = [['FrontUpperLegL', 'FrontLowerLegL', 0, 0.55, 0.9], ['FrontUpperLegR', 'FrontLowerLegR', 0.35, 0.55, 0.9],
  ['BackUpperLegL', 'BackLowerLegL', Math.PI, 0.45, 0.7], ['BackUpperLegR', 'BackLowerLegR', Math.PI + 0.35, 0.45, 0.7]];
let labrador = null;
export const dogModelReady = loadModel(labradorModelUrl, 'Labrador').then(gl => {
  if (!gl) return;
  const root = gl.scene; finish(root, THREE.DoubleSide);
  const bone = p => { let f = null; root.traverse(o => { if (!f && o.isBone && o.name.startsWith(p)) f = o; }); return f; };
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
      ph += dt * TAU2 * 2.4;
      for (const L of legs) {
        L.up.quaternion.premultiply(q.setFromAxisAngle(L.upAxis, L.swing * Math.sin(ph + L.off) * run));
        L.lo.quaternion.premultiply(q.setFromAxisAngle(L.loAxis, L.fold * Math.max(0, Math.cos(ph + L.off)) * run));
      }
      m.position.y = Math.abs(Math.sin(ph)) * 0.035 * run; // the bound
      m.rotation.x = Math.sin(ph) * 0.05 * run;            // and the rock of the back
    },
  };
}

/* ---------- Song thrush (Summan) ---------- */
let thrushKit = null;
function thrushParts() {
  if (thrushKit) return thrushKit;
  const back = 0x7c5f43, buff = 0xead39c, belly = 0xf6f1e6, spot = '#3a2716';
  const skin = bodySkin((up, t) => {
    const under = mix(belly, buff, smoothstep(t, 0.35, 0.72) * 0.85 + smoothstep(up, -0.7, -0.15) * 0.5);   // buff breast and flanks, white belly
    return mix(under, back, smoothstep(up, -0.05, 0.42));
  }, (g, W, H) => {
    g.fillStyle = spot;
    for (let i = 0; i < 260; i++) {                            // arrowhead spots in loose rows over breast and flanks
      const v = 0.28 + Math.pow(Math.random(), 0.75) * 0.6, u = (Math.random() < 0.5 ? -1 : 1) * Math.random() * 0.26 * (0.4 + v * 0.7);
      const r = 2 + v * 3.2, y = (1 - v) * H;
      wrapDraw(W, ((u + 1) % 1) * W, x => {
        g.beginPath(); g.ellipse(x, y, r * 0.8, r, 0, 0, TAU); g.fill();
        g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.4); g.lineTo(x, y - r * 2.2); g.lineTo(x + r * 0.6, y - r * 0.4); g.fill();
      });
    }
  });
  thrushKit = { skin, brown: pm(0x6e5238), dark: pm(0x523b27), buffEdge: pm(0xc9a26b), buffTip: pm(0xe2c28a), underwing: pm(0xd8903e) };
  return thrushKit;
}
export function makeThrush() {
  const K = thrushParts();
  const head = (x, y, z) => {
    let k = mix(0xeedcb4, 0x7c5f43, smoothstep(y + 0.3 * (0.3 - z), 0.0, 0.38));                       // pale face, brown crown
    k = mix(k, 0x8a6a4a, smoothstep(Math.abs(x), 0.55, 0.8) * smoothstep(-y, -0.35, 0.1) * smoothstep(z, -0.5, 0.2) * 0.7); // ear coverts
    return mix(k, 0x3e2b1c, smoothstep(z, 0.15, 0.35) * smoothstep(-y, 0.18, 0.32) * (1 - smoothstep(-y, 0.45, 0.6)) * smoothstep(Math.abs(x), 0.3, 0.6)); // moustache
  };
  return buildBird({
    R: 0.046, scale: 1.5, skin: K.skin, eyeRing: 0xeedfba,
    body: [[0, -2.15], [0.3, -1.95], [0.65, -1.35], [0.93, -0.55], [1, 0.15], [0.93, 0.75], [0.66, 1.22], [0, 1.45]],
    head: { r: 0.47, y: 0.48, z: 1.42, colour: head },
    bill: { shape: [[0, -0.1], [0.24, 0.0], [0.22, 0.45], [0.12, 0.9], [0, 1.1]], base: 0xd9a33c, tip: 0x2b231c, split: 0.4, y: -0.1, sy: 0.85 },
    tail: { y: 0.12, z: -1.85, len: 2.0, w: 0.42, n: 8, spread: 0.32, fan: 0.3, mat: K.brown, edge: null },
    legs: 0xdca08a,
    wing: {
      x: 0.75, y: 0.64, z: 0.3, drop: 0.55, arm: 1.6, hand: 1.95, chord: 1.65, nSec: 7, nPrim: 8, fan: 0.7,
      coverts: K.brown, secondary: K.brown, secEdge: K.buffEdge, primary: K.dark, primEdge: K.buffEdge,
      patches: (inner, A, ch) => {                                                    // buff-tipped greater coverts
        for (let i = 0; i < 6; i++) mesh(new THREE.CircleGeometry(ch * 0.05, 8).rotateX(-Math.PI / 2), K.buffTip, inner, A * (i + 0.6) / 6.5, 0.0017, -ch * 0.08);
      },
      under: (inner, A, ch) => mesh(flat([[0, ch * 0.4], [A, ch * 0.35], [A, -ch * 0.1], [0, -ch * 0.1]]), K.underwing, inner, 0, -0.0012, 0), // orange-buff underwing
    },
  });
}

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
