import * as THREE from 'three';

const { smoothstep } = THREE.MathUtils;

// Rolling hills far out; every map is flat round the hunter (the origin) and adds its own shape on top of this.
export function hills(x, z) {
  const k = smoothstep(Math.hypot(x, z), 140, 700);
  return k * 55 * (0.6 + 0.4 * (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009) + 0.5 * Math.sin(x * 0.027 + z * 0.021)));
}

// The active map's ground. The environment sets it when a map is shown; flight, the dog and the bag read it.
let floor = hills, waterLevel = null;
export function setTerrain(height, water = null) { floor = height; waterLevel = water; }

export const floorH = (x, z) => floor(x, z);
export const inWater = (x, z) => waterLevel !== null && floor(x, z) < waterLevel - 0.05;
// The surface a falling bird stops on: the ground, or the water over it.
export const groundH = (x, z) => (inWater(x, z) ? waterLevel : floor(x, z));
