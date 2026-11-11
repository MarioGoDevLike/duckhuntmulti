// Shared unit geometries and small mesh helpers for the procedural models.
import * as THREE from 'three';

export const sph = new THREE.SphereGeometry(1, 12, 9);
export const box = new THREE.BoxGeometry(1, 1, 1);
export const cylZ = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2); // axis along z

export const lambert = color => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });

// A scaled, placed instance of a unit geometry.
export function part(parent, geo, mat, sx, sy, sz, x, y, z) {
  const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); parent.add(o); return o;
}

// A placed mesh of a purpose-built geometry.
export const mesh = (geo, mat, parent, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent?.add(m); return m;
};
