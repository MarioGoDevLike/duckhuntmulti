// The lamp: a hand-held spotlight with a visible beam, the only real light in a night hunt. There is one per night,
// the lamper's. On the lamper's own screen it rides on the camera and is seen in hand; on everyone else's it shines
// from the lamper's figure, aimed by their pose. A bird in the sky outside the projectors' beams is seen only in it.
//
// state: { on, spot (narrow beam, else flood), red (red filter), bat (battery 0 … 1) }.
import * as THREE from 'three';
import { NIGHT } from '../config/gameplay.js';
import { TOUCH } from '../config/platform.js';
import { flashTexture } from '../core/textures.js';
import { makeBeam, aimBeam } from '../core/beam.js';

const { smoothstep } = THREE.MathUtils;
const WARM = new THREE.Color(0xfff0d6), RED = new THREE.Color(0xff2a12), DARK_LENS = new THREE.Color(0x222222);
const PENUMBRA = 0.45;

// What the beam is doing given its state: { angle, range, cd, dazzle, color }, all zero when off or flat.
export function beamOf(state) {
  if (!state?.on || state.bat <= 0) return { angle: 0, range: 0, cd: 0, dazzle: 0, color: WARM };
  const B = state.spot ? NIGHT.spot : NIGHT.flood, r = state.red ? NIGHT.red : { range: 1, cd: 1, dazzle: 1 };
  const weak = smoothstep(state.bat, 0, 0.15); // a flat battery browns out
  return { angle: B.angle, range: B.range * r.range * (0.5 + 0.5 * weak), cd: B.cd * r.cd * (0.25 + 0.75 * weak), dazzle: B.dazzle * r.dazzle * weak, color: state.red ? RED : WARM };
}

// The lamp in the lamper's hand: a black body, the lens, and a pistol grip.
function handLamp() {
  const g = new THREE.Group(), black = new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.5, metalness: 0.3 });
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.05, 0.17, 20).rotateX(Math.PI / 2), black);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.007, 8, 24), black); bezel.position.z = -0.086;
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  lens.position.z = -0.087; lens.rotation.y = Math.PI;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.11, 0.045), black); grip.position.set(0, -0.07, 0.03); grip.rotation.x = 0.25;
  const glove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 8).scale(1, 1.3, 1.2), new THREE.MeshLambertMaterial({ color: 0x2d3324 }));
  glove.position.set(0.01, -0.1, 0.04);
  g.add(body, bezel, lens, grip, glove);
  return { g, lens: lens.material };
}

export function createLamp(scene, camera) {
  const light = new THREE.SpotLight(0xffffff, 0, 30, 0.3, PENUMBRA, 2);
  light.castShadow = true; light.shadow.mapSize.set(TOUCH ? 512 : 1024, TOUCH ? 512 : 1024);
  light.shadow.bias = -0.0004; light.shadow.normalBias = 0.02; light.shadow.camera.near = 0.4;
  scene.add(light, light.target);
  const beam = makeBeam(0xffffff, 0); scene.add(beam);
  // The laser: a thin, bright green line out of the lamp's head, seen by everyone in the field.
  const laser = makeBeam(0x39ff5a, 5); laser.visible = false; scene.add(laser);
  let laserOn = false;
  const glare = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), color: 0xfff4e0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glare.scale.setScalar(0.5); scene.add(glare); // the lens seen from in front, on the others' screens
  const hand = handLamp(); hand.g.position.set(0.2, -0.19, -0.42); hand.g.visible = false; camera.add(hand.g);

  const origin = new THREE.Vector3(), dir = new THREE.Vector3(0, 0, -1), to = new THREE.Vector3();
  let cur = beamOf(null), flick = 1, mine = false;
  const hide = () => { light.visible = beam.visible = glare.visible = laser.visible = false; laserOn = false; light.intensity = 0; cur = beamOf(null); };
  hide();

  return {
    origin, dir,
    get beam() { return cur; },
    get laser() { return laserOn; },
    // In my hand (the lamper's screen) or someone else's.
    shadowSize(n) { if (light.shadow.mapSize.x !== n) { light.shadow.mapSize.set(n, n); light.shadow.map?.dispose(); light.shadow.map = null; } },
    setMine(v) { mine = hand.g.visible = !!v; }, // !!: three hides only on visible === false, and a day hunt passes null
    // pos, d: where the lamp is and where it points (unit) · state: see above · T: the clock, for a weak battery's flicker.
    update(pos, d, state, T) {
      origin.copy(pos); dir.copy(d); cur = beamOf(state);
      flick = state?.on && state.bat < 0.15 ? 0.75 + 0.25 * Math.sin(T * 37) * Math.sin(T * 13.3) : 1;
      // The light stays in the scene (adding or removing a light recompiles every material); off is intensity 0.
      light.intensity = cur.cd * flick; light.color.copy(cur.color); light.visible = true;
      light.angle = cur.angle || 0.3; light.distance = (cur.range || 30) * 1.6; light.shadow.camera.far = light.distance;
      light.position.copy(origin); light.target.position.copy(origin).addScaledVector(dir, 10);
      beam.visible = cur.cd > 0;
      if (cur.range > 0) aimBeam(beam, origin, dir, cur.range * 0.9, cur.angle);
      beam.material.uniforms.uColor.value.copy(cur.color); beam.material.uniforms.uOpacity.value = (state?.red ? 0.3 : 0.22) * flick;
      glare.visible = !mine && cur.cd > 0; glare.position.copy(origin).addScaledVector(dir, 0.15); glare.material.color.copy(cur.color);
      hand.lens.color.copy(cur.cd > 0 ? cur.color : DARK_LENS);
      laserOn = !!state?.laser && state.bat > 0; laser.visible = laserOn;
      if (laserOn) aimBeam(laser, origin, dir, 160, 0.0028);
    },
    // How hard the beam presses on a point: 0 outside it … about 1 in the middle of a flood at 15 m (more for the spot,
    // and close in). The light falls off across the penumbra and toward the end of its reach.
    dazzleAt(p) {
      if (!cur.dazzle) return 0;
      to.copy(p).sub(origin); const dist = to.length(); if (dist > cur.range || dist < 0.1) return 0;
      const off = Math.acos(Math.min(1, to.dot(dir) / dist)), edge = 1 - smoothstep(off, cur.angle * (1 - PENUMBRA), cur.angle);
      return cur.dazzle * edge * (1 - dist / cur.range) * (1 + 8 / (dist + 4)) * 0.7;
    },
    hide() { hide(); hand.g.visible = false; mine = false; },
  };
}
