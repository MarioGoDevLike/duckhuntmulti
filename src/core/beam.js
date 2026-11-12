// A visible beam of light: a cone of glowing haze, brightest along its core and fading with distance down it. Used by the
// lamp and the night map's projectors. makeBeam(color, opacity) builds one; aimBeam points it from origin along dir
// (unit), `length` long and `angle` (rad, half-width) wide.
import * as THREE from 'three';

function beamMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0 } },
    vertexShader: `varying float vAlong; varying vec3 vN, vV;
      void main() {
        vAlong = -position.z; vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `uniform vec3 uColor; uniform float uOpacity; varying float vAlong; varying vec3 vN, vV;
      void main() { // brightest along the core seen side-on, fading out with distance down the beam
        float a = uOpacity * pow(abs(dot(normalize(vN), normalize(vV))), 2.0) * pow(1.0 - vAlong, 2.2) * smoothstep(0.0, 0.03, vAlong);
        gl_FragColor = vec4(uColor * a, a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

// A visible beam of light (a cone of glowing haze), shared with the projectors on the night map. aimBeam points one
// from origin along dir, `length` long and `angle` (rad) wide; its glow is set with uColor and uOpacity.
const BEAM = new THREE.CylinderGeometry(0.02, 1, 1, 40, 1, true).translate(0, -0.5, 0).rotateX(Math.PI / 2); // points down −z
export function makeBeam(color, opacity) {
  const m = new THREE.Mesh(BEAM, beamMaterial()); m.frustumCulled = false; m.renderOrder = 5;
  m.material.uniforms.uColor.value.set(color); m.material.uniforms.uOpacity.value = opacity;
  return m;
}
const bq = new THREE.Vector3();
export function aimBeam(m, origin, dir, length, angle) {
  const w = Math.tan(angle) * length;
  m.position.copy(origin); m.lookAt(bq.copy(origin).sub(dir)); m.scale.set(w, w, length);
}
