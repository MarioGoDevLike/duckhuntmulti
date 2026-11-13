// The retriever. Our birds that land within reach are fetched one at a time and laid next to the hunter in rows,
// like the bag; birds the dog does not get to simply stay where they fell. A small state machine:
//   sit → out (run to the bird) → back (carry it to the pile) → home → sit
// In the woodcock wood the dog also works as a pointer: between birds it quarters the cover ahead of the hunter (bell
// ringing); sent to a found bird it runs in and freezes on point (bell silent), and holds there, steady to wing and
// shot, until the bird is up — then sits where it stood, ready to fetch.
//   sit/quarter → point (run in, hold) → sit
import * as THREE from 'three';
import { rnd } from '../../core/math.js';
import { WOODCOCK } from '../../config/gameplay.js';
import { groundH } from '../../world/terrain.js';
import { foldWings, lay } from '../birds/bird.js';
import { makeStandInDog } from './standInDog.js';
import { makeLabrador, dogModelReady } from './labrador.js';

const FETCH_RANGE = 70;                       // m from the hunter
const SPEED = { out: 8.5, back: 7, home: 6 }; // m/s
const SIT_YAW = Math.PI * 0.85;               // sitting at heel, looking out over the field

// quarry(): what is being hunted (for the pile layout) · isMine(d): the bird is still ours to fetch.
export function createRetriever(scene, camera, { quarry, isMine }) {
  let dog = makeStandInDog(); dog.g.visible = false; scene.add(dog.g);
  // The rigged Labrador takes over from the stand-in where it stands as soon as it has loaded.
  dogModelReady.then(() => {
    const lab = makeLabrador(); if (!lab) return;
    lab.g.position.copy(dog.g.position); lab.g.rotation.copy(dog.g.rotation); lab.g.visible = dog.g.visible;
    scene.remove(dog.g); scene.add(lab.g); dog = lab;
  });

  const queue = [], dv = new THREE.Vector3();
  let mode = 'sit', bird = null, pileN = 0, running = false;
  const quarter = new THREE.Vector3(), stand = new THREE.Vector3(); let quarterT = 0;
  const pointer = () => quarry().kind === 'woodcock';
  const hunterX = () => camera.position.x;
  const home = () => new THREE.Vector3(hunterX() + 1.1, 0, 0.5);
  const pileSpot = k => { // rows to the front-right of the hunter
    const b = quarry().bag;
    return new THREE.Vector3(hunterX() + 1.1 + (k % 4) * b.dx, 0, -1.7 - (k / 4 | 0) * b.dz * 0.8);
  };
  function moveTo(to, dt, speed) { // true on arrival
    dv.set(to.x - dog.g.position.x, 0, to.z - dog.g.position.z);
    const dist = dv.length(); if (dist < 0.35) return true;
    dog.g.position.addScaledVector(dv.normalize(), Math.min(dist, speed * dt));
    dog.g.rotation.y = Math.atan2(dv.x, dv.z);
    return false;
  }

  return {
    show(v) { dog.g.visible = v; },
    reset() {
      queue.length = 0; bird = null; mode = 'sit'; pileN = 0; quarterT = 0;
      dog.g.position.copy(home()); dog.g.rotation.set(0, SIT_YAW, 0);
    },
    inReach: p => Math.hypot(p.x - hunterX(), p.z) < FETCH_RANGE,
    fetch(d) { d.fetch = true; queue.push(d); },
    // Point a hidden woodcock: run in to `stand` m short of it, on the hunter's side, and freeze facing it.
    point(d) {
      if (mode === 'out' || mode === 'back') return; // busy with a fetch: the bird flushes unpointed
      bird = d; mode = 'point';
      stand.set(hunterX() - d.g.position.x, 0, -d.g.position.z).normalize().multiplyScalar(WOODCOCK.stand).add(d.g.position);
    },
    ranging: () => running && pointer(), // the bell rings while the dog moves
    at: () => dog.g.position,
    // Called off the hunt (the bag): drop everything and sit there.
    sitAt(x, z, yaw) {
      queue.length = 0; bird = null; mode = 'sit';
      dog.g.position.set(x, 0, z); dog.g.rotation.set(0, yaw, 0);
    },
    update(dt, T) {
      running = false;
      if (mode === 'point') {
        if (!bird.hidden) { mode = 'sit'; bird = null; } // flushed: steady where it stands
        else if (moveTo(stand, dt, SPEED.out)) dog.g.rotation.y = Math.atan2(bird.g.position.x - dog.g.position.x, bird.g.position.z - dog.g.position.z);
        else running = true;
      } else if (mode === 'sit' && !queue.length && pointer()) { // quartering the cover 6–18 m ahead, across the front
        if ((quarterT -= dt) <= 0 || moveTo(quarter, dt, 3.2)) { quarterT = rnd(2.5, 4.5); quarter.set(hunterX() + rnd(-14, 14), 0, -rnd(6, 18)); }
        else running = true;
      }
      if (mode === 'sit' && queue.length) {
        bird = queue.shift();
        mode = isMine(bird) && bird.down && !bird.retrieved ? 'out' : 'sit';
      }
      if (mode === 'out') {
        running = true;
        if (!isMine(bird)) { mode = 'home'; bird = null; }
        else if (moveTo(bird.g.position, dt, SPEED.out)) { mode = 'back'; bird.carried = true; }
      } else if (mode === 'back') {
        running = true;
        const spot = pileSpot(pileN);
        if (moveTo(spot, dt, SPEED.back)) {
          const b = bird; b.carried = false; b.retrieved = isMine(b); foldWings(b); // a bird lost to another hunter's claim isn't ours to pick up
          b.g.position.copy(spot);
          lay(b, groundH(spot.x, spot.z), Math.PI + rnd(-0.1, 0.1), (quarry().upturn ? Math.PI : 0) + rnd(-0.3, 0.3)); // laid out like the bag
          pileN++; mode = 'home'; bird = null;
        }
      } else if (mode === 'home') {
        running = true;
        if (moveTo(home(), dt, SPEED.home)) { mode = 'sit'; dog.g.rotation.y = SIT_YAW; }
      }
      dog.animate(dt, running, T); // before the bird is placed, so it sits in this frame's jaws
      if (bird?.carried) { // held across the jaws
        dog.g.updateMatrixWorld();
        bird.g.position.copy(dog.head.localToWorld(dog.mouth.clone()));
        if (bird.scan) { // the flat chaffinch scan is gripped round the middle, lying across the jaws
          bird.g.position.y -= 0.05; bird.g.rotation.set(0.15, dog.g.rotation.y + Math.PI / 2, 0);
        } else bird.g.rotation.set(0, dog.g.rotation.y + Math.PI / 2, Math.PI / 2);
      }
    },
    // Off the hunt: keeps breathing where it sits.
    idle(dt, T) { if (dog.g.visible) dog.animate(dt, false, T); },
  };
}
