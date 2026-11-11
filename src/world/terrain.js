import * as THREE from 'three';

const { smoothstep } = THREE.MathUtils;

// Ground height: flat field around the hunter, rolling hills far out.
export function groundH(x, z) {
  const k = smoothstep(Math.hypot(x, z), 140, 700);
  return k * 55 * (0.6 + 0.4 * (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009) + 0.5 * Math.sin(x * 0.027 + z * 0.021)));
}
