// Looking at and holding a retrieved bird: look at one on the pile to target it, pick it up into the support hand
// in front of the camera, and put it back where it came from.
import * as THREE from 'three';
import { SCAN_FACE } from '../entities/birds/bird.js';
import { supportHand } from '../entities/weapons/hands.js';

const REACH = 6, CONE = 0.14; // m, rad

// onChange(): whether a bird can be picked up, or is held, has changed (the HUD shows a prompt).
export function createInspector(camera, scene, flock, onChange) {
  const group = new THREE.Group(); camera.add(group); group.visible = false;
  { const h = supportHand(); h.rotation.x = -0.2; group.add(h); }
  const look = new THREE.Vector3(), to = new THREE.Vector3();
  let held = null, from = null, target = null;

  const api = {
    get holding() { return !!held; },
    get canGrab() { return !!target && !held; },
    // The retrieved bird nearest the centre of view, within reach.
    scan() {
      let best = null, bestA = CONE;
      camera.getWorldDirection(look);
      for (const d of flock.birds) {
        if (!d.retrieved) continue;
        to.copy(d.g.position).sub(camera.position);
        if (to.length() > REACH) continue;
        const a = look.angleTo(to.normalize()); if (a < bestA) { bestA = a; best = d; }
      }
      if (best !== target) { target = best; onChange(); }
    },
    // Pick up the targeted bird, or put the held one back.
    toggle() {
      if (held) { // back on the pile where it came from
        scene.add(held.g); held.g.position.copy(from.p); held.g.quaternion.copy(from.q);
        held = null; group.visible = false; onChange(); return;
      }
      if (!target) return;
      held = target; target = null;
      from = { p: held.g.position.clone(), q: held.g.quaternion.clone() };
      const size = new THREE.Box3().setFromObject(held.g).getSize(new THREE.Vector3()).length();
      group.add(held.g); held.g.position.set(0, 0.03, 0);
      // The scan is turned to show its upper side to the eye, head to the left; the mallard shows its back (green head,
      // blue speculum), head to the right; the others are turned breast up.
      if (held.scan) held.g.quaternion.setFromEuler(SCAN_FACE);
      else held.g.rotation.set(0.25, Math.PI * 0.6, held.kind === 'duck' && held.carcass ? Math.PI / 2 : Math.PI);
      group.position.set(0.02, -0.1 - size * 0.1, -0.35 - size * 0.8); group.visible = true; onChange();
    },
    release() { if (held) api.toggle(); },
  };
  return api;
}
