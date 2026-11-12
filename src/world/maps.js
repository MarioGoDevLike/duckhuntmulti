// The four hunting grounds (see config/maps.js). Each builder returns
//   { group, height(x, z), water (level or null), light, grass(x, z, h) → blades grow here?, grassScale, grassTint?, reachable(p) }
// height must stay flat (0) round the hunters' line, which runs along x near the origin, facing −z.
// light: { sun: [polar°, azimuth°], sky: [turbidity, rayleigh, mie, mieG], hemi: [sky, ground, intensity], sunColor, sunI, fog: [color, density] }
import * as THREE from 'three';
import { rnd, TAU } from '../core/math.js';
import { hills } from './terrain.js';

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
const RIDE = 13; // half-width of the ride that birds can be retrieved from
function oakRide(tex) {
  const group = new THREE.Group();
  const height = (x, z) => hills(x, z) + 0.6 * Math.sin(x * 0.08) * Math.cos(z * 0.07) * smoothstep(Math.abs(x), 14, 30);
  ground(group, tex, height, (x, z, h, n) => (Math.abs(x) > 15 ? [0.09, 0.3, 0.26 + n * 0.1] : [0.17, 0.3, 0.5 + n * 0.25]));
  const ROWS = 64, COLS = 20;
  oaks(group, height, ROWS * COLS * 2 + 60, i => {
    if (i >= ROWS * COLS * 2) return { x: rnd(-15, 15), z: rnd(48, 75) }; // the wood closes the ride behind the line
    const side = i & 1 ? 1 : -1, j = i >> 1;
    return { x: side * (16.5 + (j % COLS) * 6.2 + rnd(-2, 2)), z: -320 + (j / COLS | 0) * 6.2 + rnd(-2, 2) };
  });
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

export const BUILD = { lake, oakRide, pineRidge, clearing };
