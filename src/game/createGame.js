// The game: owns the renderer, the frame loop and the rules of a hunt (clock, shells, scoring, kills), and wires
// the systems together. The UI drives it through the handle returned below and hears back through cb:
//   onHud(state) · onMsg(text) · onPause() · onEnd({ score, ducks, shots, quarry }) · onKill(id, pts) · onPose({ yaw, pitch, shots })
//
// States: 'menu' (drifting view, ambient birds) → 'play' (a hunt, solo or in a room) → 'over' (the bag) → 'menu'.
import * as THREE from 'three';
import { GAME_TIME, WEAPONS, QUARRY, EYE, PITCH_MIN, PITCH_MAX, slotX } from '../config/gameplay.js';
import { TOUCH } from '../config/platform.js';
import { rnd, mulberry } from '../core/math.js';
import { createAudio } from '../audio/soundscape.js';
import { createEnvironment } from '../world/environment.js';
import { fly, fall, startFall } from '../entities/birds/flight.js';
import { createViewmodel } from '../entities/weapons/viewmodel.js';
import { createRetriever } from '../entities/retriever/retriever.js';
import { createHunters } from '../entities/hunters.js';
import { createFlock } from './flock.js';
import { spawnFlight } from './spawner.js';
import { createShotColumn } from './shotColumn.js';
import { createFeatherBursts } from './featherBursts.js';
import { createBag } from './bag.js';
import { createInspector } from './inspector.js';
import { createInput } from './input.js';

const { clamp } = THREE.MathUtils;

export function createGame(canvas, cb) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOUCH });
  renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 6000);
  camera.rotation.order = 'YXZ'; camera.position.set(0, EYE, 0); scene.add(camera);

  /* ---------- state ---------- */
  let audio = null, raf = 0, last = performance.now(), T = 0, state = 'menu', paused = false;
  // View and gun handling. ads: 0 hip … 1 shouldered · brk: 0 … 1 over-under broken open.
  let yaw = 0, pitch = 0.16, kick = 0, aim = false, ads = 0, brk = 0, menuSpawnT = 1;
  // The round. mp: { seed, startAt (local ms), slot, count } while hunting in a room; R drives the flights, seeded in a room.
  let W = WEAPONS.semi, Q = QUARRY.duck, mp = null, R = Math.random, elapsed = 0, nextSpawn = 0, poseT = 0;
  let timeLeft = GAME_TIME, score = 0, bagged = 0, shots = 0, shells = W.mag, reloading = false, reloadT = 0, nextShot = 0, lastKill = -9, lastSec = 0;
  const killLog = new Map(); // bird id → 'me' or the id of the hunter who bagged it
  const rr = (a, b) => a + R() * (b - a);
  const live = () => state === 'play' && !paused;

  /* ---------- systems ---------- */
  const world = createEnvironment(scene, renderer);
  const view = createViewmodel(camera);
  const hunters = createHunters(scene, view.flashMaterial);
  const flock = createFlock(scene);
  const shotColumn = createShotColumn();
  const bursts = createFeatherBursts(scene);
  const bag = createBag(scene);
  const retriever = createRetriever(scene, camera, {
    quarry: () => Q,
    isMine: d => flock.birds.includes(d) && killLog.get(d.id) === 'me',
  });
  const inspector = createInspector(camera, scene, flock, () => hud());

  const hud = () => cb.onHud({
    score, ducks: bagged, shells, mag: W.mag, reloading, aiming: aim, time: Math.ceil(timeLeft),
    canGrab: inspector.canGrab, holding: inspector.holding,
  });

  /* ---------- rules ---------- */
  const spawn = (lag = 0) => spawnFlight({ Q, R, flock, lag, facing: mp ? 0 : yaw, voice: state === 'play' ? audio : null });

  // hit: how the shot took it (see shotColumn), or null for a bird another hunter dropped. Returns how it comes down.
  function drop(d, hit = null) {
    d.alive = false; d.life = 0;
    const how = startFall(d, hit);
    bursts.spawn(d.g.position, hit ? Math.round(8 + 30 * (1 - hit.u) * (0.4 + 0.6 * hit.e)) : 26, hit?.dir); // a full pattern knocks out more
    return how;
  }
  const HOW = { fold: 'clean', wing: 'wing hit', tower: 'towered', glide: 'hit light' };  function kill(d, range, hit) {
    const speed = d.vel.length(), dbl = T - lastKill < 1.5; lastKill = T;
    const pts = Math.round((40 + range * 2 + speed * 3) * Q.pts * (dbl ? 2 : 1)); score += pts; bagged++;
    const how = drop(d, hit); cb.onMsg(`${dbl ? 'DOUBLE!  ' : ''}+${pts}  ·  ${range | 0} m  ·  ${HOW[how]}`); hud();
    killLog.set(d.id, 'me');
    cb.onKill?.(d.id, pts); // in a room: claim the bird (first claim wins)
  }

  function fire() {
    if (inspector.holding) return; // hands full
    if (T < nextShot || elapsed < 0 || (reloading && !W.single)) return; // countdown, or a broken-open double
    if (shells <= 0) { audio.empty(); wantReload(); return; }
    reloading = false; reloadT = 0; shells--; shots++; nextShot = T + W.interval; kick = 1;
    view.fire(W, shells); audio.shot(W.single);
    shotColumn.fire(camera.position.clone(), camera.getWorldDirection(new THREE.Vector3()));
    // Birds flare at the shot. Solo only: in a room every screen must fly identical birds, and a random
    // flare from one hunter's gun would send their copies somewhere else on everyone else's screen.
    if (!mp) for (const d of flock.birds) if (d.alive) d.vel.y += rnd(0.3, 1.6);
    hud(); if (mp) cb.onPose?.({ yaw, pitch, shots });
  }
  const wantReload = () => { if (shells < W.mag && !reloading) { reloading = true; if (!W.single) audio?.open(); hud(); } };
  const setAim = v => { if (aim !== v) { aim = v; hud(); } };
  const toggleHold = () => { if (inspector.canGrab) aim = false; inspector.toggle(); }; // picking a bird up lowers the gun

  // After the round: lay out each hunter's birds on the grass, the dog sitting beside them.
  function layBag(list) {
    inspector.release();
    flock.removeWhere(d => !d.alive); // the bag shows them all
    const birdsOf = {};
    for (const [id, by] of killLog) (birdsOf[by] ||= []).push(flock.drakeOf.get(id) ?? true);
    const spot = bag.layOut(list, Q, birdsOf);
    world.mow(spot.mow);
    retriever.sitAt(spot.dog.x, spot.dog.z, -Math.PI * 0.6);
  }

  /* ---------- frame ---------- */
  function stepRound(dt) {
    // In a room the clock is shared wall time, so every hunter's round starts and ends together.
    elapsed = mp ? (Date.now() - mp.startAt) / 1000 : elapsed + dt;
    timeLeft = GAME_TIME - elapsed;
    if (timeLeft <= 0) {
      timeLeft = 0; state = 'over'; input.release();
      mp = null; R = Math.random; hunters.clear();
      cb.onEnd({ score, ducks: bagged, shots, quarry: Q.kind }); // the UI then calls showBag() to lay the birds out
      return;
    }
    if (reloading && shells < W.mag && (reloadT += dt) > W.reload) {
      reloadT = 0; shells = W.single ? shells + 1 : W.mag; audio.load(W.single); if (shells === W.mag) reloading = false; hud();
    }
    const sec = Math.ceil(timeLeft); if (sec !== lastSec) { lastSec = sec; hud(); }
    // Flight schedule runs off the round clock (seeded in a room), so it is identical for every player.
    while (elapsed >= nextSpawn) {
      const lag = elapsed - nextSpawn; spawn(lag);
      nextSpawn += (rr(...Q.gap) - 1.2 * Math.min(1, nextSpawn / GAME_TIME)) / (mp ? 1 + 0.25 * (mp.count - 1) : 1);
    }
    if (mp && (poseT -= dt) <= 0) { poseT = 0.5; cb.onPose?.({ yaw, pitch, shots }); }
  }

  function stepIdle(dt) {
    if (state === 'menu') { yaw = Math.sin(T * 0.12) * 0.35; pitch = 0.16; }
    const v = bag.view;
    if (v) { // standing over the bag, drifting slowly from side to side; further back on tall screens
      const fit = Math.max(1, 1.4 / camera.aspect);
      camera.position.set(v.cx + Math.sin(T * 0.15) * (0.5 + v.span * 0.06), v.h * fit, v.zc + (v.z - v.zc) * fit);
      camera.lookAt(v.cx, 0, v.zc);
    }
    if ((menuSpawnT -= dt) <= 0) { spawn(); menuSpawnT = rnd(2.5, 5); }
  }

  function stepBirds(dt) {
    const voice = state === 'play' ? audio : null;
    for (let i = flock.birds.length - 1; i >= 0; i--) {
      const d = flock.birds[i]; d.life += dt;
      let gone = false;
      if (d.alive) gone = fly(d, dt, voice);
      else if (!d.down) {
        if (fall(d, dt)) {
          audio?.thud(d.g.position);
          if (state === 'play' && killLog.get(d.id) === 'me' && retriever.inReach(d.g.position)) retriever.fetch(d);
        }
      } else gone = d.life > 8 && !d.fetch && !d.retrieved; // the dog's birds stay
      if (gone) flock.remove(i);
    }
  }

  function step(dt) {
    T += dt; world.uTime.value = T;
    kick = Math.max(0, kick - dt * 4);
    if (state === 'play') stepRound(dt); else stepIdle(dt);
    hunters.update(dt);
    shotColumn.update(dt, flock.birds, Q, kill, hint => cb.onMsg(hint));
    stepBirds(dt);
    bursts.update(dt);

    if (!bag.view) camera.rotation.set(pitch + kick * 0.03, yaw, 0);
    if (state === 'play') { retriever.update(dt, T); if (!inspector.holding) inspector.scan(); }
    else retriever.idle(dt, T);
    // Right mouse shoulders the gun: the eye drops just above the rib and looks down it to the bead. Reloading takes it
    // off the shoulder. A double breaks open for the reload, and snaps shut faster than it opened.
    const open = !W.single && reloading && state === 'play' ? 1 : 0;
    brk += (open - brk) * Math.min(1, dt * (open > brk ? 9 : 16));
    ads += ((aim && state === 'play' && !reloading && brk < 0.5 ? 1 : 0) - ads) * Math.min(1, dt * 12);
    const fov = 55 - 15 * ads;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // How far the current reload step has got (one shell for the semi, both barrels for the double), for the animation.
    const reload = reloading && state === 'play' ? { p: Math.min(1, reloadT / W.reload), shells, mag: W.mag } : null;
    view.update(dt, T, state === 'play' && !inspector.holding, ads, brk, reload);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused || mp) step(dt); // a room's hunt keeps running while one player sits in the pause menu
    audio?.listen(camera);
    renderer.render(scene, camera);
  }

  /* ---------- input ---------- */
  const pause = () => {
    if (!live()) return;
    paused = true; aim = false; input.release(); cb.onPause();
  };
  const input = createInput(canvas, {
    live,
    look(dx, dy, s) { // full 360° turn; slower while aiming
      if (!live()) return;
      const k = s * camera.fov / 55;
      yaw -= dx * k; pitch = clamp(pitch - dy * k, PITCH_MIN, PITCH_MAX);
    },
    fire, aim: setAim, reload: wantReload, hold: toggleHold, pause,
    lockLost() { if (state === 'play') { paused = true; aim = false; cb.onPause(); } },
  });
  const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize);
  onResize(); raf = requestAnimationFrame(frame);

  /* ---------- public API ---------- */
  return {
    // room (optional): { seed, startAt: local ms when the round begins, slot, count, quarry }. A room's quarry wins.
    start(weapon, room, quarry) {
      inspector.release();
      Q = QUARRY[room?.quarry || quarry] || QUARRY.duck; world.setScenery(Q);
      audio ||= createAudio(); audio.resume();
      W = WEAPONS[weapon] || WEAPONS.semi; view.equip(W); brk = 0;
      flock.reset(); shotColumn.clear(); hunters.clear(); bag.clear(); killLog.clear();
      mp = room || null; R = mp ? mulberry(mp.seed) : Math.random;
      elapsed = mp ? (Date.now() - mp.startAt) / 1000 : 0; nextSpawn = 1.5; timeLeft = GAME_TIME - elapsed; lastSec = 0;
      camera.position.set(mp ? slotX(mp.slot, mp.count) : 0, EYE, 0);
      retriever.reset(); retriever.show(true);
      const hx = camera.position.x; world.mow([hx - 0.6, hx + 3.4, -5.5, 1.2]); // short grass where the dog lays the birds
      score = bagged = shots = 0; shells = W.mag; reloading = false; reloadT = 0; nextShot = 0; lastKill = -9;
      yaw = 0; pitch = 0.2; aim = false; paused = false; state = 'play'; hud(); input.lock();
    },
    // Abandon the hunt (no score posted) and go back to the drifting menu view.
    quit() {
      inspector.release(); retriever.show(false);
      state = 'menu'; paused = false; aim = false; reloading = false; input.release();
      mp = null; R = Math.random; camera.position.set(0, EYE, 0);
      hunters.clear(); bag.clear(); world.growBack(); world.resetScenery();
      flock.clear(); shotColumn.clear();
    },
    // After the round: list is [{ by, name, sub, slot, count, winner }] per hunter. See bag.js.
    showBag: list => { if (state === 'over') layBag(list); },
    unlockAudio() { audio ||= createAudio(); audio.resume(); }, // call from a click so a room's start has sound
    // Another hunter (by) claimed this bird first: it falls here too and goes in their bag.
    remoteKill(id, by) { killLog.set(id, by); const d = flock.birds.find(x => x.id === id && x.alive); if (d) drop(d); },
    // Our claim lost the race: take the points back.
    revokeKill(pts) { score = Math.max(0, score - pts); bagged = Math.max(0, bagged - 1); hud(); },
    // list: [{ id, name, slot, yaw, pitch, shots }] for the other hunters in the round.
    setPeers(list) { if (mp) hunters.sync(list, mp.count, at => audio?.distantShot(at)); },
    resume() { paused = false; input.lock(); },
    pause,
    fire: () => { if (live()) fire(); },
    reload: () => { if (live()) wantReload(); },
    toggleAim: () => { if (live()) setAim(!aim); },
    hold: () => { if (live()) toggleHold(); },
    dispose() { cancelAnimationFrame(raf); input.dispose(); removeEventListener('resize', onResize); renderer.dispose(); },
  };
}
