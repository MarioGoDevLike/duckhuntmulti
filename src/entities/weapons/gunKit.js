// Shared materials and profile tools for the first-person guns.
//
// Guns are built from side profiles traced from reference photos (art-source/reference): each part is a closed
// outline in the (forward, up) plane, extruded across its width and bevelled, so stocks, grips and receivers have
// real silhouettes and rounded edges. Gun space: barrels run along -z, the rib is on +y, the shooter's eye is at +z.
import * as THREE from 'three';
import { rnd } from '../../core/math.js';
import { mesh } from '../../core/meshes.js';
import { canvasTex } from '../../core/textures.js';

const { lerp } = THREE.MathUtils;

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
export function mats() {
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
export function profile(pts, width, { bevel = 0.004, smooth = true, holes = [], seg = 4 } = {}) {
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
export const tube = (rRear, rFront, len, seg = 28) => new THREE.CylinderGeometry(rRear, rFront, len, seg, 1).rotateX(Math.PI / 2);
export const tubeX = (r, len, seg = 16) => new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2);
export const ring = (g, r, w, z, y, mat) => mesh(tube(r, r, w), mat, g, 0, y, z);
// Knurled band: a few thin raised rings.
export function knurl(g, r, z0, z1, y, mat, n = 4) { for (let i = 0; i < n; i++) ring(g, r, 0.0015, lerp(z0, z1, (i + 0.5) / n), y, mat); }
