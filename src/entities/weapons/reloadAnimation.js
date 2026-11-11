// Reload choreography for the first-person guns: where the hands and the shells are at each moment of a reload, as
// keyframed poses in gun space (see viewmodel.js). Pure functions of the reload's progress p (0 → 1): the game owns the
// timing (WEAPONS[].reload), so the animation always matches the rules, and the load sound lands as the shell seats.
//
// A pose is [x, y, z, rx, ry, rz]: a hand frame's position and Euler rotation in gun space.
import * as THREE from 'three';

const { clamp } = THREE.MathUtils;
const ease = t => t * t * (3 - 2 * t);
const X_AXIS = new THREE.Vector3(1, 0, 0), BACK = new THREE.Vector3(0, 0, -1);

// keys: [[t, pose], ...] in increasing t. Eased in and out between neighbouring keys, so every key is a hold.
function sample(keys, t, out) {
  let i = 1; while (i < keys.length - 1 && t > keys[i][0]) i++;
  const [t0, a] = keys[i - 1], [t1, b] = keys[i], k = ease(clamp((t - t0) / (t1 - t0), 0, 1));
  for (let j = 0; j < a.length; j++) out[j] = a[j] + (b[j] - a[j]) * k;
  return out;
}
export const restPose = (hand, out) => {
  const p = hand.grip ?? hand; out[0] = p[0]; out[1] = p[1]; out[2] = p[2]; out[3] = p[3] ?? 0; out[4] = 0; out[5] = 0; return out;
};
export const mixPose = (a, b, k, out) => { for (let j = 0; j < 6; j++) out[j] = a[j] + (b[j] - a[j]) * k; return out; };

/* ---------- Semi-auto: one cycle per shell ---------- */
// The support hand drops off the gun to the shell belt, takes a shell, brings it up under the loading port lined up
// with the tube, rolls it in and thumbs it home — then goes for the next. The shell rides in the fingers just ahead of
// the palm; the hand frame (forend axis, palm under it) follows it.
const IN_FINGERS = new THREE.Vector3(0, -0.022, -0.03); // shell centre relative to the support-hand frame
const semiKeys = port => {
  const hand = (dx, dy, dz, rx, ry = 0, rz = 0) =>
    [port.x + dx - IN_FINGERS.x, port.y + dy - IN_FINGERS.y, port.z + dz - IN_FINGERS.z, rx, ry, rz];
  const home = hand(0, 0.012, -0.04, 0.2); // thumb on the base of a shell pushed up into the tube
  return [
    [0.00, home],
    [0.12, hand(0, -0.02, 0.0, 0.2)],             // thumb off, hand drops clear of the port
    [0.38, hand(0.06, -0.24, 0.12, 0.9, 0, -0.6)], // down to the belt
    [0.46, hand(0.06, -0.24, 0.12, 0.9, 0, -0.6)], // takes a shell
    [0.70, hand(0, -0.03, 0.01, 0.2)],             // up under the port, lined up with the tube
    [0.82, hand(0, 0.004, 0.005, 0.2)],            // rolls it up into the port
    [1.00, home],                                  // thumbs it home (the game's load clack lands here)
  ];
};
// hand: pose out. shell: the Object3D in the fingers.
export function semiLoad(port, p, hand, shell) {
  sample(semiKeys(port), p, hand);
  shell.visible = p > 0.44 && p < 0.97;
  shell.position.set(hand[0] + IN_FINGERS.x, hand[1] + IN_FINGERS.y, hand[2] + IN_FINGERS.z);
  shell.rotation.set(hand[3] - 0.2, hand[4], hand[5]);
}
// The push that seats a shell, 0 → 1 → 0 over the last stretch of the cycle: a small shove through the gun.
export const semiSeatBump = p => (p > 0.82 ? Math.sin(Math.PI * (p - 0.82) / 0.18) : 0);

/* ---------- Break action: both chambers at once ---------- */
// The gun is already breaking open (the game drives the hinge) and the ejectors throw the empties; the trigger hand
// leaves the grip, takes two shells from the belt, slides them into the chambers along the bore and goes back to the
// grip as the action snaps shut. Chambers move with the barrels, so their targets are taken at the current opening.
// Seen from the eye, a hand wrapped round the shells would hide them and the breech. Instead it stays below and behind
// them, tilted a little past the barrels, thumb and index on the rims, so what you watch is the shells going in.
const BEHIND_RIMS = new THREE.Vector3(0, -0.045, 0.05); // trigger-hand frame relative to the shells' centre, barrel frame
const ALONG_BORE = 0.3;                                  // the hand's tilt beyond the barrels' while loading
const _c = [new THREE.Vector3(), new THREE.Vector3()], _mid = new THREE.Vector3(), _dir = new THREE.Vector3(), _off = new THREE.Vector3();

// spec.chambers: closed breech-face centres, bottom then top; spec.hinge; angle: the current opening (x axis, negative down).
export function chambersAt(spec, angle, out = _c) {
  spec.chambers.forEach((ch, i) => out[i].copy(ch).sub(spec.hinge).applyAxisAngle(X_AXIS, angle).add(spec.hinge));
  return out;
}
export const boreAt = (angle, out = _dir) => out.copy(BACK).applyAxisAngle(X_AXIS, angle); // toward the muzzle

export function breakActionLoad(spec, angle, p, hand, shells) {
  const c = chambersAt(spec, angle), dir = boreAt(angle);
  _mid.copy(c[0]).add(c[1]).multiplyScalar(0.5);
  _off.copy(BEHIND_RIMS).applyAxisAngle(X_AXIS, angle);
  const at = (along, rx, rz) => { const v = _mid.clone().addScaledVector(dir, along).add(_off); return [v.x, v.y, v.z, rx, 0, rz]; };
  const grip = restPose(spec.hands, []), open = angle + ALONG_BORE;
  const keys = [
    [0.00, grip],
    [0.20, grip],                                                       // on the grip while it breaks and throws the empties
    [0.40, [grip[0] + 0.09, grip[1] - 0.24, grip[2] + 0.12, 0.3, 0, 0.5]], // down to the belt
    [0.48, [grip[0] + 0.09, grip[1] - 0.24, grip[2] + 0.12, 0.3, 0, 0.5]], // takes two
    [0.68, at(-0.05, open, -0.15)],                                     // shells lined up behind the chambers
    [0.82, at(0.035, open, -0.15)],                                     // slid home, rims flush
    [0.88, at(-0.01, open - 0.25, -0.1)],                               // fingers open off the rims
    [1.00, grip],                                                       // back on the grip as it snaps shut
  ];
  sample(keys, p, hand);
  // In the fingers until they are seated; from then on they ride in the chambers (see seatedShells).
  // shells[i] is null for a chamber that still holds a live shell and is not being loaded.
  if (p < 0.82) {
    const show = p > 0.46;
    shells.forEach((s, i) => {
      if (!s) return;
      s.visible = show;
      s.position.set(hand[0], hand[1], hand[2]).sub(_off).add(c[i]).sub(_mid);
      s.rotation.set(hand[3] - ALONG_BORE, 0, 0); // held in the fingers: along the bore once the hand is lined up
    });
  } else seatedShells(spec, angle, shells);
}
// Loaded shells sitting in the chambers, opening and closing with the barrels (null entries skipped).
export function seatedShells(spec, angle, shells) {
  const c = chambersAt(spec, angle), dir = boreAt(angle);
  shells.forEach((s, i) => { if (!s) return; s.visible = true; s.position.copy(c[i]).addScaledVector(dir, 0.035); s.rotation.set(angle, 0, 0); });
}
