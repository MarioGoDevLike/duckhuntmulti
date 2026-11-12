// The hunting grounds (see config/maps.js). Each builder returns
//   { group, height(x, z), water (level or null), light, grass(x, z, h) → blades grow here?, grassScale, grassTint?, reachable(p) }
// and a night map also: dawn (the light at first light, blended in by the environment), fade(k) (the night sky going as
// it gets light) and tree: { x, z } (what the birds come in to).
// height must stay flat (0) round the hunters' line, which runs along x near the origin, facing −z.
// light: { sun: [polar°, azimuth°], sky: [turbidity, rayleigh, mie, mieG], hemi: [sky, ground, intensity], sunColor, sunI, fog: [color, density],
//          exposure?, moon?: [polar°, azimuth°] — at night the directional light is the moon, not the (set) sun }
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rnd, TAU, mulberry } from '../core/math.js';
import { canvasTex } from '../core/textures.js';
import { TOUCH } from '../config/platform.js';
import { makeBeam, aimBeam } from '../core/beam.js';
import { hills } from './terrain.js';
import { loadModel } from '../core/gltf.js';
import oakUrl from '../assets/models/oak.glb?url';
import nightSkyUrl from '../assets/images/night_sky.webp?url';

const { smoothstep } = THREE.MathUtils;
const m = new THREE.Object3D(), col = new THREE.Color();
const lambert = c => new THREE.MeshLambertMaterial(c === undefined ? {} : { color: c });

// Shared shapes.
const TRUNK = new THREE.CylinderGeometry(0.3, 0.45, 8, 6).translate(0, 4, 0);
const OAK = new THREE.IcosahedronGeometry(4.2, 1).scale(1.1, 0.9, 1.1).translate(0, 10, 0);
const PINE = new THREE.ConeGeometry(2.6, 11, 7).translate(0, 8, 0);
const PINE_TRUNK = new THREE.CylinderGeometry(0.22, 0.32, 4, 5).translate(0, 2, 0);
const REED = new THREE.ConeGeometry(0.04, 2, 3).translate(0, 1, 0);

function ground(group, tex, height, colorAt) {
  const geo = new THREE.PlaneGeometry(3000, 3000, 220, 220).rotateX(-Math.PI / 2), p = geo.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = height(x, z); p.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(z * 0.04) * 2) * Math.cos(z * 0.06);
    col.setHSL(...colorAt(x, z, h, n)); c.set([col.r, col.g, col.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); geo.computeVertexNormals();
  group.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: tex, vertexColors: true })));
}

// Instanced copies of one or more geometries placed together (a trunk and its crown). place(i) gives
// { x, z, y?, s, sy?, rx?, rz?, hsl? } or null to skip; hsl colours the last geometry.
function plant(group, height, parts, n, place) {
  const spots = [];
  for (let i = 0; i < n; i++) { const s = place(i); if (s) spots.push(s); }
  const meshes = parts.map(([geo, mat]) => new THREE.InstancedMesh(geo, mat, spots.length));
  spots.forEach((s, i) => {
    m.position.set(s.x, s.y ?? height(s.x, s.z), s.z); m.rotation.set(s.rx || 0, rnd(0, TAU), s.rz || 0);
    m.scale.set(s.s, s.s * (s.sy ?? 1), s.s); m.updateMatrix();
    meshes.forEach(me => me.setMatrixAt(i, m.matrix));
    if (s.hsl) meshes[meshes.length - 1].setColorAt(i, col.setHSL(...s.hsl));
  });
  group.add(...meshes);
  return meshes;
}
const oaks = (group, height, n, place) => plant(group, height, [[TRUNK, lambert(0x4a3f33)], [OAK, lambert()]], n, i => {
  const s = place(i); return s && { s: rnd(0.85, 1.25), sy: rnd(0.9, 1.1), hsl: [rnd(0.24, 0.3), rnd(0.3, 0.42), rnd(0.17, 0.27)], ...s };
});
const pines = (group, height, n, place) => plant(group, height, [[PINE_TRUNK, lambert(0x4d3a2a)], [PINE, lambert()]], n, i => {
  const s = place(i); return s && { s: rnd(0.8, 1.3), sy: rnd(0.9, 1.2), hsl: [rnd(0.3, 0.36), rnd(0.3, 0.45), rnd(0.12, 0.2)], ...s };
});
// Distant woodland on the horizon, between r0 and r1 m out, in clumps.
const horizon = (group, height, n, r0, r1, keep = () => true) => oaks(group, height, n, () => {
  const r = rnd(r0, r1), a = rnd(0, TAU), x = Math.cos(a) * r, z = Math.sin(a) * r;
  return Math.sin(x * 0.02) + Math.cos(z * 0.017 + 1) > 0.1 && keep(x, z) ? { x, z } : null;
});

/* ---------- Reed Lake: mallards at dawn ---------- */
function lake(tex) {
  const group = new THREE.Group(), LEVEL = -0.4, CZ = -58, RX = 85, RZ = 50;
  const e = (x, z) => (x / RX) ** 2 + ((z - CZ) / RZ) ** 2; // < 1 inside the lake
  const height = (x, z) => hills(x, z) - 2.6 * (1 - smoothstep(e(x, z), 0.6, 1.15))
    + 2.9 * (1 - smoothstep(Math.hypot(x + 30, z + 55), 3, 8)); // the reed island
  ground(group, tex, height, (x, z, h, n) => (h < -0.15 ? [0.1, 0.25, 0.3 + n * 0.08] : [0.15, 0.25, 0.62 + n * 0.3]));

  const water = new THREE.Mesh(new THREE.PlaneGeometry(260, 160).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x31505a, roughness: 0.1, metalness: 0.85 }));
  water.position.set(0, LEVEL, CZ); group.add(water);

  const reed = (x, z, tall) => ({ x, z, s: 1, sy: tall * rnd(0.7, 1.15), rx: rnd(-0.12, 0.12), rz: rnd(-0.12, 0.12), hsl: [rnd(0.12, 0.17), rnd(0.35, 0.5), rnd(0.32, 0.48)] });
  plant(group, height, [[REED, lambert()]], 4200, i => {
    if (i < 500) return reed(rnd(-13, 13), -5.4 + rnd(-0.35, 0.35), 0.55); // the blind in front of the line
    if (i < 700) { const a = rnd(0, TAU), r = rnd(2, 6); return reed(-30 + Math.cos(a) * r, -55 + Math.sin(a) * r, 1); }
    const a = rnd(0, TAU), k = Math.sqrt(rnd(0.88, 1.08)), x = Math.cos(a) * RX * k, z = CZ + Math.sin(a) * RZ * k;
    return z > -22 && Math.abs(x) < 16 ? null : reed(x, z, 1); // keep the water in front of the line open
  });

  // Willows and poplars on the far bank, the woods beyond.
  oaks(group, height, 260, () => {
    const a = rnd(0, TAU), k = Math.sqrt(rnd(1.25, 3)), x = Math.cos(a) * RX * k, z = CZ + Math.sin(a) * RZ * k;
    return z < -25 ? { x, z } : null;
  });
  plant(group, height, [[new THREE.ConeGeometry(1.5, 15, 6).translate(0, 7.5, 0), lambert()]], 70, () => {
    const a = rnd(Math.PI * 1.1, Math.PI * 1.9), k = Math.sqrt(rnd(1.2, 1.6));
    return { x: Math.cos(a) * RX * k, z: CZ + Math.sin(a) * RZ * k, s: rnd(0.8, 1.2), hsl: [rnd(0.22, 0.27), 0.35, rnd(0.2, 0.28)] };
  });
  horizon(group, height, 900, 170, 560, (x, z) => e(x, z) > 2.2);

  { // a short jetty out into the water to the right of the line
    const wood = lambert(0x6b5038), deck = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 13), wood);
    deck.position.set(9, 0.12, -10.5); group.add(deck);
    for (let i = 0; i < 6; i++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 6), wood);
      post.position.set(9 + (i % 2 ? 0.7 : -0.7), -0.6, -5 - (i >> 1) * 5.5); group.add(post);
    }
  }
  return {
    group, height, water: LEVEL, grass: (x, z, h) => h > -0.25, grassScale: 1, reachable: () => true,
    light: { sun: [87, 135], sky: [10, 3, 0.008, 0.9], hemi: [0xbfd0ea, 0x5d5a48, 1.3], sunColor: 0xffb488, sunI: 2.6, fog: [0xb9bfc4, 0.0045] },
  };
}

/* ---------- Oak Wood Ride: thrush crossing a ride through the woods ---------- */
// The Blender oaks (art-source/blender/oak.py → assets/models/oak.glb): two shapes, each [[wood, bark], [leaves, leaf]]
// for plant(). Crowns are clumps of alpha-cut leaf sprays with sky between them, so a thrush crossing in front of or
// between the trees stays in sight. null if the model can't be loaded (the simple oaks stay).
const oakShapes = loadModel(oakUrl, 'Oak').then(gl => {
  if (!gl) return null;
  gl.scene.updateMatrixWorld(true);
  const part = n => { const o = gl.scene.getObjectByName(n); return o?.isMesh ? o : null; };
  const shapes = ['OakA', 'OakB'].map(k => [part(`${k}_Wood`), part(`${k}_Leaves`)]);
  if (shapes.flat().some(o => !o)) { console.warn('Oak model incomplete; using the simple oaks'); return null; }
  const [wood, leaves] = shapes[0];
  const bark = lambert(wood.material.color);
  const leaf = new THREE.MeshLambertMaterial({ map: leaves.material.map, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: !!leaves.geometry.attributes.color });
  // The cards' normals point out of the crown (oak.py); keep them on the back faces too, rather than flipping them.
  leaf.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n\tnormal *= faceDirection;'); };
  return shapes.map(([w, l]) => [[w.geometry.clone().applyMatrix4(w.matrixWorld), bark], [l.geometry.clone().applyMatrix4(l.matrixWorld), leaf]]);
});
// Swap a stand of simple oaks (plant()'s meshes) for the Blender oaks, tree for tree, once they load.
function upgradeOaks(group, stand) {
  oakShapes.then(shapes => {
    if (!shapes) return;
    const mat = new THREE.Matrix4(), n = stand[0].count;
    shapes.forEach((parts, k) => {
      const idx = []; for (let i = k; i < n; i += shapes.length) idx.push(i);
      const meshes = parts.map(([geo, material]) => new THREE.InstancedMesh(geo, material, idx.length));
      idx.forEach((i, j) => {
        stand[0].getMatrixAt(i, mat); meshes.forEach(me => me.setMatrixAt(j, mat));
        meshes[1].setColorAt(j, col.setHSL(rnd(0.18, 0.3), rnd(0.2, 0.4), rnd(0.82, 0.96))); // a tint over the leaf texture
      });
      group.add(...meshes);
    });
    group.remove(...stand); stand.forEach(me => me.dispose());
  });
}

const RIDE = 13; // half-width of the ride that birds can be retrieved from
function oakRide(tex) {
  const group = new THREE.Group();
  const height = (x, z) => hills(x, z) + 0.6 * Math.sin(x * 0.08) * Math.cos(z * 0.07) * smoothstep(Math.abs(x), 14, 30);
  ground(group, tex, height, (x, z, h, n) => (Math.abs(x) > 15 ? [0.09, 0.3, 0.26 + n * 0.1] : [0.17, 0.3, 0.5 + n * 0.25]));
  // Rows DZ m apart along the ride, columns DX m apart going into the wood: spaced out enough to hold the frame rate.
  const ROWS = 48, COLS = 10, NEAR = 3, DZ = 8, DX = 7.5; // the NEAR columns each side of the ride get the Blender oaks; the wood behind stays simple
  const spot = (i, cols, c0) => {
    const side = i & 1 ? 1 : -1, j = i >> 1;
    return { x: side * (16.5 + (c0 + j % cols) * DX + rnd(-2, 2)), z: -320 + (j / cols | 0) * DZ + rnd(-2, 2) };
  };
  upgradeOaks(group, oaks(group, height, ROWS * NEAR * 2 + 30, i => i < ROWS * NEAR * 2 ? spot(i, NEAR, 0)
    : { x: rnd(-15, 15), z: rnd(48, 75) })); // the wood closes the ride behind the line
  oaks(group, height, ROWS * (COLS - NEAR) * 2, i => spot(i, COLS - NEAR, NEAR));
  const log = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.42, 7, 8), lambert(0x564736));
  log.rotation.set(0, 0.4, Math.PI / 2); log.position.set(-9, 0.35, -28); group.add(log);
  return {
    group, height, water: null, grass: () => true, grassScale: 1, reachable: p => Math.abs(p.x) < RIDE,
    light: { sun: [50, 200], sky: [20, 1, 0.02, 0.6], hemi: [0xc8d0c8, 0x4a4a38, 2.0], sunColor: 0xe8e8e0, sunI: 1.1, fog: [0x9aa396, 0.01] },
  };
}

/* ---------- Pine Ridge Pass: thrush rising from the valley over a saddle ---------- */
function pineRidge(tex) {
  const group = new THREE.Group();
  const height = (x, z) => hills(x, z) * 0.5
    - 34 * smoothstep(-z, 35, 95)                                                 // the valley ahead
    + 70 * smoothstep(-z, 260, 480)                                               // the far ridge
    + 20 * smoothstep(Math.abs(x), 45, 130) * (1 - 0.5 * smoothstep(-z, 35, 95))  // the pine slopes either side
    - 12 * smoothstep(z, 30, 160);                                                // falling away behind
  const saddle = (x, z) => (x / 48) ** 2 + ((z + 5) / 38) ** 2 < 1;
  ground(group, tex, height, (x, z, h, n) => (saddle(x, z) ? [0.16, 0.3, 0.55 + n * 0.25] : [0.08, 0.3, 0.33 + n * 0.12]));
  const SPOTS = [[-26, -14], [24, -20], [-31, 9], [29, 12], [-18, -30], [36, -2]], G = 75;
  pines(group, height, G * 90 + SPOTS.length, i => {
    if (i < SPOTS.length) return { x: SPOTS[i][0], z: SPOTS[i][1] };
    const j = i - SPOTS.length, x = -260 + (j % G) * 7 + rnd(-2.5, 2.5), z = -420 + (j / G | 0) * 7 + rnd(-2.5, 2.5);
    return saddle(x, z) || (z < -30 && z > -55 && Math.abs(x) < 70) ? null : { x, z }; // open brow: the view over the valley
  });
  return {
    group, height, water: null, grass: () => true, grassScale: 0.9, reachable: p => p.z > -40 && Math.abs(p.x) < 45,
    light: { sun: [81, 55], sky: [6, 2.5, 0.005, 0.88], hemi: [0xd8cdb8, 0x5a5038, 1.4], sunColor: 0xffb35a, sunI: 3.4, fog: [0xb8c2d0, 0.0032] },
  };
}

/* ---------- Stubble Clearing: chaffinch flocks off the hedgerow ---------- */
function clearing(tex) {
  const group = new THREE.Group(), height = hills;
  ground(group, tex, height, (x, z, h, n) => [0.12, 0.35, 0.6 + 0.12 * Math.sin(z * 0.7) + n * 0.15]); // mown rows
  const hedge = x => -110 + Math.sin(x * 0.03) * 3;
  plant(group, height, [[new THREE.IcosahedronGeometry(2.2, 1).scale(1.3, 1, 1).translate(0, 1.8, 0), lambert()]], 240, i => {
    const x = -260 + i * 2.2 + rnd(-0.6, 0.6); return { x, z: hedge(x) + rnd(-1, 1), s: rnd(0.8, 1.3), hsl: [rnd(0.2, 0.28), 0.35, rnd(0.16, 0.24)] };
  });
  oaks(group, height, 26, () => { const x = rnd(-250, 250); return { x, z: hedge(x) - rnd(1, 4) }; });
  // The lone oak.
  plant(group, height, [[TRUNK, lambert(0x4a3f33)], [OAK, lambert()]], 5, i => ({
    x: 55 + (i ? rnd(-3, 3) : 0), z: -48 + (i ? rnd(-3, 3) : 0), s: i ? rnd(1.1, 1.4) : 1.6, sy: i ? 1 : 0.9, hsl: [0.27, 0.38, rnd(0.18, 0.24)],
  }));
  horizon(group, height, 900, 320, 650);
  // A low hide of cut branches across the front of the line.
  plant(group, height, [[new THREE.CylinderGeometry(0.03, 0.05, 1.3, 4).translate(0, 0.65, 0), lambert()]], 220, () => ({
    x: rnd(-13, 13), z: -6.2 + rnd(-0.3, 0.3), s: 1, sy: rnd(0.6, 1), rx: rnd(-0.35, 0.35), rz: rnd(-0.35, 0.35), hsl: [rnd(0.07, 0.12), 0.35, rnd(0.2, 0.32)],
  }));
  return {
    group, height, water: null, grass: () => true, grassScale: 0.45, grassTint: 0xf5d98e, reachable: () => true, // golden stubble
    light: { sun: [52, 175], sky: [4, 1.4, 0.004, 0.8], hemi: [0xd6e2ff, 0x8a7a50, 1.7], sunColor: 0xfff0d8, sunI: 3.0, fog: [0xd8d2bf, 0.0022] },
  };
}

/* ---------- Projector Field: thrushes at night over a lone olive ----------
   An open field with one old olive in the middle, a projector at its foot lighting the crown, and two more either side of
   it throwing beams up into the sky: thrushes coming in to the tree show up as they cross the beams. The hunters stand
   well back from it all, at the origin. The tree is laid out from a fixed seed, the same on every screen. */
const TREE = { x: 0, z: -34 };
const fieldHeight = (x, z) => hills(x, z) + 0.35 * Math.sin(x * 0.07) * Math.cos(z * 0.05) * smoothstep(Math.hypot(x, z), 8, 40)
  + 110 * smoothstep(z, 380, 820); // a ridge behind the hunters, where the village is
const glowTex = () => canvasTex(128, 128, (g, W) => {
  const r = g.createRadialGradient(W / 2, W / 2, 0, W / 2, W / 2, W / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,245,225,.55)'); r.addColorStop(1, 'rgba(255,240,210,0)');
  g.fillStyle = r; g.fillRect(0, 0, W, W);
});

// A projector on the ground: a black lamp head on a short stand, its lens glowing, its light and visible beam along dir.
function projector(group, glow, x, z, dir, { angle, cd, range, color, haze }) {
  const y = fieldHeight(x, z), black = lambert(0x1b1c1d), UP = new THREE.Vector3(0, 1, 0);
  const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.5, 8), black); stand.position.set(x, y + 0.25, z);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.5, 18), black);
  head.position.set(x, y + 0.6, z); head.quaternion.setFromUnitVectors(UP, dir);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.27, 24), new THREE.MeshBasicMaterial({ color: 0xfff7e6 }));
  lens.position.y = 0.251; lens.rotation.x = -Math.PI / 2; head.add(lens);
  const o = head.position.clone().addScaledVector(dir, 0.3);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.position.copy(o); halo.scale.setScalar(1.6);
  const light = new THREE.SpotLight(color, cd, range, angle, 0.35, 2);
  light.position.copy(o); light.target.position.copy(o).addScaledVector(dir, 10);
  const beam = makeBeam(color, haze); aimBeam(beam, o, dir, range * 0.85, angle);
  group.add(stand, head, halo, light, light.target, beam);
}

// Olive leaves and trunk, for the tree in the field.
// Olive leaves: narrow, dark green above and silvery below, in sprays along twigs, on a transparent ground.
function leafTexture() {
  const t = canvasTex(256, 256, (g, W, H) => {
    const R = mulberry(3);
    for (let twig = 0; twig < 7; twig++) {
      const a0 = R() * TAU, len = 60 + R() * 60, x0 = W / 2 + Math.cos(a0) * 20, y0 = H / 2 + Math.sin(a0) * 20;
      const x1 = x0 + Math.cos(a0) * len, y1 = y0 + Math.sin(a0) * len;
      g.strokeStyle = '#4b4030'; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      for (let i = 0; i < 10; i++) {
        const f = i / 10, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f, a = a0 + (i % 2 ? 1 : -1) * (0.5 + R() * 0.5);
        const silver = R() < 0.35;
        g.fillStyle = silver ? `hsl(${80 + R() * 20},${12 + R() * 10}%,${62 + R() * 12}%)` : `hsl(${75 + R() * 20},${22 + R() * 15}%,${24 + R() * 14}%)`;
        g.save(); g.translate(x, y); g.rotate(a); g.beginPath(); g.ellipse(14, 0, 15, 3.4, 0, 0, TAU); g.fill(); g.restore();
      }
    }
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
// An old olive: a short, thick, twisted bole with limbs reaching up and out to the crown.
function oliveTrunk() {
  const R = mulberry(11), parts = [];
  const bole = new THREE.CylinderGeometry(0.3, 0.55, 1.8, 9, 6).translate(0, 0.9, 0), p = bole.attributes.position;
  for (let i = 0; i < p.count; i++) { // gnarled: ridges and hollows that twist up the bole
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.28 * Math.sin(a * 3 + y * 2.2) + 0.12 * Math.sin(a * 7 - y * 4);
    p.setXYZ(i, x * k, y, z * k);
  }
  bole.computeVertexNormals(); parts.push(bole);
  // Limbs: each in two crooked lengths, thinning, the second bent back up toward the light.
  const e = new THREE.Euler(), up = new THREE.Vector3();
  const limb = (from, r0, r1, len, lean, a) => {
    const seg = new THREE.CylinderGeometry(r1, r0, len, 8).translate(0, len / 2, 0).rotateZ(lean).rotateY(a).translate(from.x, from.y, from.z);
    parts.push(seg);
    return from.clone().add(up.set(0, len, 0).applyEuler(e.set(0, 0, lean)).applyAxisAngle(new THREE.Vector3(0, 1, 0), a));
  };
  for (let i = 0; i < 4; i++) {
    const a = i * TAU / 4 + R() * 0.8, lean = 0.55 + R() * 0.4;
    const elbow = limb(new THREE.Vector3(0, 1.55, 0), 0.19, 0.12, 0.8 + R() * 0.4, lean, a);
    limb(elbow, 0.12, 0.05, 0.9 + R() * 0.6, lean - 0.45 - R() * 0.3, a + (R() - 0.5) * 0.8);
  }
  return mergeGeometries(parts);
}

function field(tex) {
  const group = new THREE.Group(), height = fieldHeight, R = mulberry(20241112);
  const rr = (a, b) => a + R() * (b - a);
  ground(group, tex, height, (x, z, h, n) => [0.13 + n * 0.03, 0.3, 0.3 + n * 0.12]); // dry grass, darker in the hollows
  horizon(group, height, 900, 220, 620);

  { // the olive: old and broad, its crown of leafy sprays wide enough to roost a flock
    const s = 2.1, y = height(TREE.x, TREE.z), cy = y + 3.2 * s, rad = 2.5 * s, ry = 1.55 * s, SPRAYS = TOUCH ? 150 : 240;
    const trunk = new THREE.Mesh(oliveTrunk(), lambert(0x2f2b26)); trunk.position.set(TREE.x, y - 0.05, TREE.z); trunk.scale.setScalar(s);
    const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.15, 1.15), new THREE.MeshLambertMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide }), SPRAYS);
    const v = new THREE.Vector3();
    for (let j = 0; j < SPRAYS; j++) { // denser toward the outside of the crown, as on a pruned olive
      const a = rr(0, TAU), el = Math.asin(rr(-0.75, 1)), f = Math.cbrt(rr(0.25, 1));
      v.set(Math.cos(a) * Math.cos(el) * rad * f, Math.sin(el) * ry * f, Math.sin(a) * Math.cos(el) * rad * f);
      m.position.set(TREE.x + v.x, cy + v.y, TREE.z + v.z); m.rotation.set(rr(-1.3, 1.3), rr(0, TAU), rr(0, TAU)); m.scale.setScalar(rr(0.8, 1.3) * 1.4); m.updateMatrix();
      leaves.setMatrixAt(j, m.matrix); leaves.setColorAt(j, col.setHSL(rr(0.2, 0.25), rr(0.1, 0.25), rr(0.75, 1)));
    }
    trunk.castShadow = trunk.receiveShadow = leaves.castShadow = leaves.receiveShadow = true;
    group.add(trunk, leaves);
    // The projectors: one at the tree's foot lighting the crown, two either side lighting the sky.
    const glow = glowTex(), crown = new THREE.Vector3(TREE.x, cy, TREE.z), at = new THREE.Vector3(TREE.x, y + 0.6, TREE.z + 4);
    projector(group, glow, at.x, at.z, crown.clone().sub(at).normalize(), { angle: 0.6, cd: 700, range: 18, color: 0xfff1d8, haze: 0.12 });
    for (const sx of [-1, 1]) projector(group, glow, TREE.x + sx * 19, TREE.z, new THREE.Vector3(sx * 0.2, 1, -0.1).normalize(), { angle: 0.12, cd: 9000, range: 140, color: 0xeef2ff, haze: 0.5 });
  }

  // The sky (rendered in Blender: art-source/blender/night_sky.py) on a dome inside the day sky, thinning away at first
  // light; the moon; and the lights of the village on the ridge behind.
  const skyTex = new THREE.TextureLoader().load(nightSkyUrl); skyTex.colorSpace = THREE.SRGBColorSpace; skyTex.anisotropy = 4;
  const domeMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, transparent: true, fog: false, depthWrite: false });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4600, 64, 24, 0, TAU, 0, Math.PI / 2), domeMat); dome.renderOrder = -2; group.add(dome);
  const moonMat = new THREE.SpriteMaterial({ map: canvasTex(128, 128, (g, W) => {
    const r = g.createRadialGradient(W / 2, W / 2, W * 0.16, W / 2, W / 2, W / 2);
    r.addColorStop(0, '#f4f0e2'); r.addColorStop(0.34, '#e9e4d4'); r.addColorStop(0.38, 'rgba(200,210,255,.22)'); r.addColorStop(1, 'rgba(200,210,255,0)');
    g.fillStyle = r; g.fillRect(0, 0, W, W);
  }), fog: false, depthWrite: false, transparent: true });
  const moon = new THREE.Sprite(moonMat);
  moon.position.setFromSphericalCoords(4000, THREE.MathUtils.degToRad(62), THREE.MathUtils.degToRad(140)); moon.scale.setScalar(240); group.add(moon);
  {
    const pts = [];
    for (let i = 0; i < 180; i++) { const x = rr(-500, 500), z = rr(650, 820); if (Math.sin(x * 0.012) > -0.3) pts.push(x, height(x, z) + 3, z); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 2.4, sizeAttenuation: false, color: 0xffc070, fog: false })));
  }

  return {
    group, height, water: null, grass: () => true, grassScale: 0.8, grassTint: 0xb9ad86, reachable: () => true,
    light: { sun: [99, 300], sky: [2, 0.25, 0.002, 0.8], hemi: [0x31405e, 0x0a0907, 0.18], sunColor: 0x9fb4e6, sunI: 0.1, fog: [0x05080e, 0.004], exposure: 1, moon: [62, 140] },
    dawn: { sun: [93, 80], sky: [3, 1.4, 0.004, 0.8], hemi: [0x8590ad, 0x2b2620, 1.1], sunColor: 0xd0c4d4, sunI: 0.35, fog: [0x59606e, 0.004], exposure: 0.85, moon: [70, 140] },
    fade(k) { domeMat.opacity = (1 - k) ** 1.5; moonMat.opacity = 1 - 0.7 * k; },
    tree: TREE,
  };
}

export const BUILD = { lake, oakRide, pineRidge, clearing, field };
