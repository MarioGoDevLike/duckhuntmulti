// The first-person gun rig riding on the camera: both shotguns with hands on them, the muzzle flash and its light,
// spent hulls, and the reloads. The game says when it fires and how far a reload has got; the rig animates the rest.
//
// Each gun is described by a spec, in gun space (barrels along -z, rib on +y, trigger near z = 0):
//   { gun: Object3D, muzzle: Vector3, hands: (see poseHands), barrels?: [bottomY, topY],
//     port?: Vector3 — a tube gun's loading port, where the support hand feeds shells in,
//     hinge?: Vector3, open?(angle) — a break action: tip the barrels about the hinge (x axis; negative = down),
//     chambers?: [Vector3, Vector3] — its breech-face centres when closed, bottom then top }
// Each weapon starts with its procedural gun and swaps in the loaded model's spec once it arrives.
// The reload choreography itself lives in reloadAnimation.js.
import * as THREE from 'three';
import { rnd } from '../../core/math.js';
import { flashTexture } from '../../core/textures.js';
import { addHands, poseHands } from './hands.js';
import { makeShell, createSpentHulls } from './shells.js';
import { semiLoad, semiSeatBump, breakActionLoad, seatedShells, chambersAt, boreAt, restPose, mixPose } from './reloadAnimation.js';
import { makeSemiAuto } from './semiAuto.js';
import { semiAutoModelReady } from './semiAutoModel.js';
import { makeOverUnder, OU_BARRELS } from './overUnder.js';
import { overUnderModelReady } from './overUnderModel.js';

// Just past the muzzle of the procedural guns. Every gun keeps its bead at the same height, so the aiming pose lines up.
const PROC_MUZZLE = new THREE.Vector3(0, 0.018, -0.98);
const BREAK_ANGLE = 0.55; // rad the barrels drop when a break action is fully open
const X_AXIS = new THREE.Vector3(1, 0, 0);
// Feeding a tube gun: rolled over to the right so the loading port faces the support hand, brought up toward centre.
const FEED = { roll: -0.8, pitch: 0.1, x: -0.04, y: 0.03, z: 0.02 };
// Loading a break action: brought in toward centre and turned a little toward the eye, so the open chambers face you.
const BREAK = { yaw: 0.15, roll: -0.12, x: -0.05, y: 0.03, z: 0.02 };

const applyPose = (o, p) => { o.position.set(p[0], p[1], p[2]); o.rotation.set(p[3], p[4], p[5]); };

export function createViewmodel(camera) {
  const gun = new THREE.Group(); camera.add(gun);

  // A weapon slot: its group in the rig, its hands, the shells its reload handles, and the spec in use
  // (procedural until the model loads).
  function slot(spec, modelReady, shellCount) {
    const group = new THREE.Group(); gun.add(group); group.add(spec.gun);
    const shells = Array.from({ length: shellCount }, () => { const m = makeShell(); m.visible = false; group.add(m); return m; });
    const s = { group, spec, shells, hands: addHands(group, spec.hands) };
    modelReady.then(model => {
      if (!model) return;
      group.remove(s.spec.gun); group.add(model.gun); s.spec = model;
      poseHands(s.hands, model.hands);
      if (equipped === s) setMuzzle(model.muzzle);
    });
    return s;
  }
  const slots = {
    single: slot({ gun: makeSemiAuto(), muzzle: PROC_MUZZLE, port: new THREE.Vector3(0, -0.028, -0.11),
      hands: { grip: [0, -0.0194, 0.0646, -0.42], fore: [0, 0.002, -0.36] } }, semiAutoModelReady, 1),
    double: slot({ gun: makeOverUnder(), muzzle: PROC_MUZZLE, barrels: OU_BARRELS,
      hands: { grip: [0, -0.0194, 0.0646, -0.42], fore: [0, -0.008, -0.31], foreScale: 0.88 } }, overUnderModelReady, 2),
  };
  let equipped = null;

  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.setScalar(0.4); gun.add(flash);
  const flashL = new THREE.PointLight(0xffc070, 0, 30); gun.add(flashL);
  const setMuzzle = p => { flash.position.copy(p); flashL.position.copy(p); };
  setMuzzle(PROC_MUZZLE);

  const spent = createSpentHulls(camera);
  let recoil = 0, flashT = 0;
  // Reload state. feed: 0 … 1 into the tube gun's feeding posture · feedP: where its current shell cycle is ·
  // emptied: this break-open has thrown its empties · loading: chambers being loaded this reload (others hold live
  // shells) · seated: loaded shells are in the chambers · lockJolt: the snap of the action closing.
  let feed = 0, feedP = 0, emptied = false, loading = null, seated = false, prevBrk = 0, lockJolt = 0;
  const pose = [], target = [];
  const v = new THREE.Vector3(), vel = new THREE.Vector3(), q = new THREE.Quaternion(), qCam = new THREE.Quaternion(), qShell = new THREE.Quaternion();

  // The ejectors kick the fired hulls out of the open chambers, back over the shooter's shoulder.
  function throwEmpties(s, angle, count) {
    const c = chambersAt(s.spec, angle), dir = boreAt(angle);
    s.group.updateWorldMatrix(true, false);
    s.group.getWorldQuaternion(q); camera.getWorldQuaternion(qCam).invert();
    for (let i = 0; i < count; i++) {
      v.copy(c[i]).addScaledVector(dir, 0.01).applyMatrix4(s.group.matrixWorld); camera.worldToLocal(v);
      vel.copy(dir).multiplyScalar(-2.6).add(new THREE.Vector3(rnd(-0.25, 0.25) + 0.35, 1.3 + i * 0.2, 0)).applyQuaternion(q).applyQuaternion(qCam);
      qShell.copy(qCam).multiply(q).multiply(new THREE.Quaternion().setFromAxisAngle(X_AXIS, angle));
      spent.eject(v, vel, qShell);
    }
  }

  // Tube gun: the support hand blends from the forend into the shell-feeding cycle and back.
  function animateTubeGun(s) {
    restPose(s.spec.hands.fore, pose);
    const shell = s.shells[0];
    if (feed > 0.001 && s.spec.port) {
      semiLoad(s.spec.port, feedP, target, shell);
      mixPose(pose, target, feed, pose);
      if (feed < 0.6) shell.visible = false; // only once the hand has really left the gun
    } else shell.visible = false;
    applyPose(s.hands.support, pose);
  }

  // Break action: the barrels open on the hinge with the support hand on the forend; during a reload the empties are
  // thrown, the trigger hand loads the fired chambers, and the shells ride in as it closes.
  function animateBreakAction(s, brk, reload) {
    const { spec, hands, shells } = s;
    if (!spec.open) return; // the procedural gun has no hinge: it just dips (see update)
    const angle = -BREAK_ANGLE * brk;
    spec.open(angle);
    const [x, y, z] = spec.hands.fore;
    v.set(x, y, z).sub(spec.hinge).applyAxisAngle(X_AXIS, angle).add(spec.hinge);
    hands.support.position.copy(v); hands.support.rotation.x = angle;
    if (!spec.chambers) return;
    if (reload) {
      if (!loading) { // a new reload: which chambers were fired (bottom first)
        const fired = reload.mag - reload.shells;
        loading = shells.map((m, i) => (i < fired ? m : null));
      }
      if (!emptied && brk > 0.85) { emptied = true; throwEmpties(s, angle, loading.filter(Boolean).length); }
      breakActionLoad(spec, angle, reload.p, pose, loading); applyPose(hands.trigger, pose);
      seatedShells(spec, angle, shells.map((m, i) => (loading[i] ? null : m))); // live shells left in unfired chambers
      if (reload.p >= 0.82) seated = true;
    } else {
      applyPose(hands.trigger, restPose(spec.hands, pose));
      if (seated && brk > 0.05) seatedShells(spec, angle, shells);
      else { seated = false; shells.forEach(m => { m.visible = false; }); }
      if (brk < 0.1) { emptied = false; loading = null; }
    }
  }

  return {
    flashMaterial: flash.material, // the other hunters' guns flash with the same sprite
    equip(W) {
      equipped = W.single ? slots.single : slots.double;
      for (const s of Object.values(slots)) { s.group.visible = s === equipped; s.shells.forEach(m => { m.visible = false; }); }
      feed = 0; emptied = false; loading = null; seated = false; prevBrk = 0;
      setMuzzle(equipped.spec.muzzle);
    },
    // shellsLeft: after this shot. A double fires its bottom barrel first, then the top.
    fire(W, shellsLeft) {
      recoil = 1; flashT = 0.05;
      const { barrels } = equipped.spec;
      if (barrels) flash.position.y = flashL.position.y = barrels[shellsLeft === 1 ? 0 : 1];
      if (W.single) spent.eject(v.set(0.14, -0.11, -0.4), vel.set(1.5, 1.2, 0.2)); // the semi spits its hull to the right
    },
    // ads: 0 at the hip … 1 shouldered, looking down the rib · brk: 0 … 1 a double broken open ·
    // reload: { p (0 → 1 through the current reload step), shells, mag } while reloading, else null.
    update(dt, T, visible, ads, brk, reload) {
      recoil = Math.max(0, recoil - dt * 6); flashT -= dt;
      gun.visible = visible;
      const s = equipped, tube = s === slots.single;
      feed += ((reload && tube ? 1 : 0) - feed) * Math.min(1, dt * 9);
      if (reload && tube) feedP = reload.p;
      if (prevBrk > 0.1 && brk <= 0.1) lockJolt = 1; // the action locking shut
      prevBrk = brk; lockJolt = Math.max(0, lockJolt - dt * 7);

      const hip = 1 - ads, bump = feed * semiSeatBump(feedP);
      // Reloading a double: a gun with a real hinge keeps its stock up and lets the barrels fall, so the open breech is in
      // view; one without (the procedural gun) dips as a whole instead.
      const hinged = !!s?.spec.open, dip = hinged ? 0.12 : 0.45, drop = hinged ? 0.02 : 0.06, br = hinged ? brk : 0;
      gun.position.set(
        0.11 * hip + FEED.x * feed + BREAK.x * br,
        -0.13 * hip - 0.055 * ads - drop * brk + FEED.y * feed + BREAK.y * br + Math.sin(T * 1.7) * 0.0015 * hip,
        -0.3 * hip - 0.38 * ads + recoil * 0.05 + FEED.z * feed + BREAK.z * br - 0.006 * bump);
      gun.rotation.set(
        0.035 * hip + 0.012 * ads - dip * brk + FEED.pitch * feed + recoil * 0.06 * (1 - 0.5 * ads) + 0.03 * lockJolt + 0.01 * bump,
        0.085 * hip + BREAK.yaw * br,
        FEED.roll * feed + BREAK.roll * br);
      if (s) { if (tube) animateTubeGun(s); else animateBreakAction(s, brk, reload); }

      flash.visible = flashT > 0; flash.material.rotation = T * 50; flashL.intensity = flashT > 0 ? 40 : 0;
      spent.update(dt, gun.visible);
    },
  };
}
