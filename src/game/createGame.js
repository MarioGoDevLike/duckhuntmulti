// The game: owns the renderer, the frame loop and the rules of a hunt (clock, shells, scoring, kills), and wires
// the systems together. The UI drives it through the handle returned below and hears back through cb:
//   onHud(state) · onMsg(text) · onPause() · onEnd({ score, ducks, shots, quarry, lost, kills }) · onKill(id, pts) · onPose({ yaw, pitch, shots, lamp })
//   and, in a night hunt, onNightEvent(ev) (for the room: see game/night.js) · onCall(n) (a quick callout, keys 1–4)
//
// States: 'menu' (drifting view, ambient birds) → 'play' (a hunt, solo or in a room) → 'over' (the bag) → 'menu'.
import * as THREE from 'three';
import { WEAPONS, QUARRY, NIGHT, EYE, PITCH_MIN, PITCH_MAX, slotX, roundTime, CHOKES, chokesFor } from '../config/gameplay.js';
import { MENU_MAP, mapOf } from '../config/maps.js';
import { TOUCH } from '../config/platform.js';
import { rnd, mulberry, TAU } from '../core/math.js';
import { createAudio } from '../audio/soundscape.js';
import { createEnvironment } from '../world/environment.js';
import { fly, fall, startFall } from '../entities/birds/flight.js';
import { createViewmodel } from '../entities/weapons/viewmodel.js';
import { createRetriever } from '../entities/retriever/retriever.js';
import { createHunters } from '../entities/hunters.js';
import { createLamp } from '../entities/lamp.js';
import { createFlock } from './flock.js';
import { spawnFlight } from './spawner.js';
import { createShotColumn } from './shotColumn.js';
import { createFeatherBursts } from './featherBursts.js';
import { createBag } from './bag.js';
import { createInspector } from './inspector.js';
import { createInput } from './input.js';
import { createNight } from './night.js';
import { createShotcam } from './shotcam.js';
import { setShotkamsVisible } from '../entities/weapons/shotkam.js';

const { clamp } = THREE.MathUtils;

export function createGame(canvas, cb) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOUCH });
  renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; // only the night lamp casts shadows
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 6000);
  camera.rotation.order = 'YXZ'; camera.position.set(0, EYE, 0); scene.add(camera);

  /* ---------- state ---------- */
  let audio = null, raf = 0, last = performance.now(), T = 0, state = 'menu', paused = false;
  // View and gun handling. ads: 0 hip … 1 shouldered · brk: 0 … 1 over-under broken open.
  const settings = { volume: 1, sensitivity: 1, fov: 55, graphics: 'high', shotcam: false, shotcamKey: 'KeyS' }; // see App's Settings tab
  let yaw = 0, pitch = 0.16, kick = 0, aim = false, ads = 0, brk = 0, menuSpawnT = 1;
  // The round. mp: { seed, startAt (local ms), slot, count } while hunting in a room; R drives the flights, seeded in a room.
  let W = WEAPONS.semi, chokes = chokesFor('semi'), Q = QUARRY.duck, map = MENU_MAP, mp = null, R = Math.random, elapsed = 0, nextSpawn = 0, poseT = 0;
  // Night: role 'lamp' | 'gun' | 'both' (a solo test night) · lampState: our lamp, if we hold it · peers: the others' poses.
  let role = 'gun', lampSlot = -1, peers = [], kills = 0;
  const lampState = { on: false, spot: false, red: false, laser: false, bat: 1 };
  const holdsLamp = () => Q.night && role !== 'gun', holdsGun = () => !Q.night || role !== 'lamp';
  let RT = roundTime('duck'), timeLeft = RT, score = 0, bagged = 0, shots = 0, shells = W.mag, reloading = false, reloadT = 0, nextShot = 0, lastKill = -9, lastSec = 0;
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
  const lamp = createLamp(scene, camera);
  const shotcam = createShotcam(renderer, scene, view.rig); // films only while the player has it on in Settings
  const night = createNight({
    flock, lamp, audio: () => (state === 'play' ? audio : null),
    onEvent: ev => cb.onNightEvent?.(ev),
    onFound(d) { // a downed bird brought in by its shooter's dog: into the bag, points for the whole party
      bagged++; score = bagged * NIGHT.pts;
      cb.onMsg('Found it — ' + bagged + ' in the bag' + (killLog.get(d.id) === 'me' ? ' · your bird' : '')); hud();
    },
  });

  // The barrel the next shot leaves: the semi has one; the over-under fires its bottom barrel, then the top.
  const barrel = () => (W.single ? 0 : Math.min(chokes.length - 1, Math.max(0, W.mag - shells)));
  const hud = () => cb.onHud({
    score, ducks: bagged, shells, mag: W.mag, reloading, aiming: aim, choke: chokes[barrel()], time: Math.ceil(timeLeft), total: RT,
    canGrab: inspector.canGrab, holding: inspector.holding,
    night: Q.night ? { role, lamp: { ...lampState, bat: Math.round(lampState.bat * 100) / 100 }, kills, ...night.stats } : null,
  });
  let nightHudT = 0, bellT = 0;

  /* ---------- rules ---------- */
  // line: where the hunters stand (doves flare on seeing them); in a room every slot, so all screens agree.
  const line = () => (mp ? Array.from({ length: mp.count }, (_, i) => slotX(i, mp.count)) : [camera.position.x]);
  const spawn = (lag = 0) => {
    const d = spawnFlight({ Q, map, R, flock, lag, facing: mp ? 0 : yaw, voice: state === 'play' ? audio : null, line: line() });
    if (d?.hidden && Math.abs(d.hunter - camera.position.x) < 0.5) retriever.point(d); // a woodcock found in front of us: our dog points it
  };

  // hit: how the shot took it (see shotColumn), or null for a bird another hunter dropped. Returns how it comes down.
  function drop(d, hit = null) {
    d.alive = false; d.life = 0;
    if (Q.night) night.killed(d);
    const how = startFall(d, hit);
    bursts.spawn(d.g.position, hit ? Math.round(8 + 30 * (1 - hit.u) * (0.4 + 0.6 * hit.e)) : 26, hit?.dir); // a full pattern knocks out more
    return how;
  }
  const HOW = { fold: 'clean', wing: 'wing hit', tower: 'towered', glide: 'hit light' };
  function kill(d, range, hit) {
    if (Q.night) { // at night a bird only counts once it has been found on the ground with the lamp
      kills++; drop(d, hit); killLog.set(d.id, 'me'); lastKill = T; if (settings.shotcam) shotcam.kill();
      cb.onMsg('Down · ' + (range | 0) + ' m — the dog is on it'); hud();
      cb.onKill?.(d.id, 0);
      return;
    }
    const speed = d.vel.length(), dbl = T - lastKill < 1.5; lastKill = T;
    const pts = Math.round((40 + range * 2 + speed * 3) * Q.pts * (dbl ? 2 : 1)); score += pts; bagged++; if (settings.shotcam) shotcam.kill();
    const limit = Q.limit && bagged === Q.limit ? `  ·  limit filled: ${Q.limit} ${Q.many}` : '';
    const how = drop(d, hit); cb.onMsg(`${dbl ? 'DOUBLE!  ' : ''}+${pts}  ·  ${range | 0} m  ·  ${HOW[how]}${limit}`); hud();
    killLog.set(d.id, 'me');
    cb.onKill?.(d.id, pts); // in a room: claim the bird (first claim wins)
  }

  function fire() {
    if (!holdsGun()) { toggleLamp(); return; } // the lamper's trigger is the lamp's switch
    if (inspector.holding) return; // hands full
    if (T < nextShot || elapsed < 0 || (reloading && !W.single)) return; // countdown, or a broken-open double
    if (shells <= 0) { audio.empty(); wantReload(); return; }
    const choke = CHOKES[chokes[barrel()]];
    reloading = false; reloadT = 0; shells--; shots++; nextShot = T + W.interval; kick = 1;
    view.fire(W, shells); audio.shot(W.single); if (settings.shotcam) shotcam.shot();
    shotColumn.fire(camera.position.clone(), camera.getWorldDirection(new THREE.Vector3()), choke);
    // Birds flare at the shot. Solo only: in a room every screen must fly identical birds, and a random
    // flare from one hunter's gun would send their copies somewhere else on everyone else's screen. (In a room
    // doves still flare, on every screen alike, when they come close enough to see the line: see flight.js.)
    if (!mp && !Q.night) for (const d of flock.birds) if (d.alive) { if (d.kind === 'dove' || d.kind === 'woodcock') d.scare = true; else d.vel.y += rnd(0.3, 1.6); }
    if (Q.night) night.spook(); // every bird in the air takes fright and climbs (on every screen)
    hud(); if (mp) pose();
  }
  const pose = () => cb.onPose?.({ yaw, pitch, shots, lamp: holdsLamp() ? { ...lampState, bat: Math.round(lampState.bat * 100) / 100 } : null });
  // The lamp: on and off, flood or spot, the red filter.
  function toggleLamp() { if (!holdsLamp() || elapsed < 0) return; lampState.on = !lampState.on && lampState.bat > 0; audio?.click(); hud(); if (mp) pose(); }
  function lampMode(k) { if (!holdsLamp()) return; lampState[k] = !lampState[k]; audio?.click(); hud(); if (mp) pose(); }
  function onKey(code) {
    // The player's Save clip key (Settings), while the shotcam is on.
    if (settings.shotcam && code === settings.shotcamKey && state === 'play') { cb.onMsg('Saving shotcam…'); shotcam.save().then(m => cb.onMsg(m), e => cb.onMsg('Shotcam failed: ' + e.message)); return; }
    if (!Q.night || state !== 'play') return;
    if (/^Digit[1-4]$/.test(code)) cb.onCall?.(+code.slice(5));
    else if (code === 'KeyF') lampMode('red');
    else if (code === 'KeyQ') lampMode('spot');
    else if (code === 'KeyK' && role === 'both') lampMode('laser');
    else if (code === 'KeyL' && role === 'both') toggleLamp();
  }
  const wantReload = () => { if (shells < W.mag && !reloading) { reloading = true; if (!W.single) audio?.open(); hud(); } };
  const setAim = v => {
    if (!holdsGun()) { if (v) lampMode('laser'); return; } // the lamper's right button: the laser on, and off again
    if (aim !== v) { aim = v; hud(); }
  };
  const toggleHold = () => { if (inspector.canGrab) aim = false; inspector.toggle(); }; // picking a bird up lowers the gun

  // After the round: lay out each hunter's birds on the grass, the dog sitting beside them.
  function layBag(list) {
    inspector.release();
    flock.removeWhere(d => !d.alive); // the bag shows them all
    const birdsOf = {};
    for (const [id, by] of killLog) if (!Q.night || night.found.includes(id)) (birdsOf[by] ||= []).push(flock.drakeOf.get(id) ?? true); // at night: only the birds found
    const spot = bag.layOut(list, Q, birdsOf);
    world.mow(spot.mow);
    retriever.sitAt(spot.dog.x, spot.dog.z, -Math.PI * 0.6);
  }

  /* ---------- frame ---------- */
  function stepRound(dt) {
    // In a room the clock is shared wall time, so every hunter's round starts and ends together.
    elapsed = mp ? (Date.now() - mp.startAt) / 1000 : elapsed + dt;
    timeLeft = RT - elapsed;
    if (timeLeft <= 0) {
      const lost = Q.night ? night.stats.down : 0;
      timeLeft = 0; state = 'over'; input.release();
      mp = null; R = Math.random; hunters.clear(); lamp.hide(); audio?.night(false);
      cb.onEnd({ score, ducks: bagged, shots, quarry: Q.kind, lost, kills }); // the UI then calls showBag() to lay the birds out
      return;
    }
    if (reloading && shells < W.mag && (reloadT += dt) > W.reload) {
      reloadT = 0; shells = W.single ? shells + 1 : W.mag; audio.load(W.single); if (shells === W.mag) reloading = false; hud();
    }
    const sec = Math.ceil(timeLeft); if (sec !== lastSec) { lastSec = sec; hud(); }
    if (Q.night) stepNight(dt);
    // Flight schedule runs off the round clock (seeded in a room), so it is identical for every player.
    else while (elapsed >= nextSpawn) {
      const lag = elapsed - nextSpawn; spawn(lag);
      const wave = Q.wave ? 1 + Q.wave[1] * Math.sin(nextSpawn * TAU / Q.wave[0]) : 1; // busy spells and lulls
      nextSpawn += (rr(...Q.gap) - 1.2 * Math.min(1, nextSpawn / RT)) * wave / (mp ? 1 + 0.25 * (mp.count - 1) : 1);
    }
    if (mp && (poseT -= dt) <= 0) { poseT = mp.poseEvery || 0.5; pose(); }
  }

  // The night's clock, the battery, and the sky greying toward first light.
  function stepNight(dt) {
    night.update(dt, elapsed);
    world.dawn((elapsed - (NIGHT.time - NIGHT.dawn)) / NIGHT.dawn);
    if (holdsLamp() && lampState.on && elapsed > 0) {
      lampState.bat = Math.max(0, lampState.bat - dt / NIGHT.battery * (lampState.spot ? NIGHT.spotDrain : 1));
      if (lampState.bat <= 0) { lampState.on = false; cb.onMsg('The lamp battery is flat'); hud(); if (mp) pose(); }
    }
    if ((nightHudT -= dt) <= 0) { nightHudT = 0.5; hud(); }
  }
  // Where the lamp is and where it points: in our hand, or in the lamper's (from their pose).
  const lampAt = new THREE.Vector3(), lampDir = new THREE.Vector3(), LAMP_IN_HAND = new THREE.Vector3(0.2, -0.17, -0.45);
  function stepLamp() {
    if (!Q.night || state !== 'play') return;
    if (holdsLamp()) {
      camera.updateMatrixWorld(); camera.localToWorld(lampAt.copy(LAMP_IN_HAND)); camera.getWorldDirection(lampDir);
      lamp.update(lampAt, lampDir, lampState, T); return;
    }
    const lamper = peers.find(p => p.slot === lampSlot), eye = lamper && hunters.eyeOf(lamper.id, lampAt);
    if (!eye) { lamp.update(lampAt, lampDir, null, T); return; }
    lampAt.y -= 0.15;
    lampDir.set(-Math.sin(eye.yaw) * Math.cos(eye.pitch), Math.sin(eye.pitch), -Math.cos(eye.yaw) * Math.cos(eye.pitch));
    lamp.update(lampAt, lampDir, lamper.lamp, T);
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

  const maybeFetch = d => {
    if (state === 'play' && killLog.get(d.id) === 'me' && (Q.night || (retriever.inReach(d.g.position) && world.reachable(d.g.position)))) retriever.fetch(d); // at night the dog goes as far as it takes
  };
  function stepBirds(dt) {
    const voice = state === 'play' ? audio : null;
    for (let i = flock.birds.length - 1; i >= 0; i--) {
      const d = flock.birds[i]; d.life += dt;
      let gone = false;
      if (d.alive) gone = d.n ? night.step(d, dt) : fly(d, dt, voice);
      else if (!d.down) {
        if (fall(d, dt)) {
          audio?.thud(d.g.position);
          if (world.inWater(d.g.position)) d.afloat = true; else maybeFetch(d);
        }
      } else if (d.afloat) {
        if (world.drift(d.g.position, dt)) { d.afloat = false; d.life = 0; maybeFetch(d); } // ashore: the dog can reach it
      } else gone = !d.n && d.life > 8 && !d.fetch && !d.retrieved; // the dog's birds stay; at night they lie until fetched
      if (d.n && d.retrieved) night.fetched(d); // at night: in the bag once our dog has brought it
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
    stepLamp();
    if (state === 'play' && Q.kind === 'woodcock' && retriever.ranging() && (bellT -= dt) <= 0) { bellT = rnd(0.28, 0.42); audio.bell(retriever.at()); } // the bell goes quiet on point
    if (state === 'play') { retriever.update(dt, T); if (!inspector.holding && !Q.night) inspector.scan(); }
    else retriever.idle(dt, T);
    // Right mouse shoulders the gun: the eye drops just above the rib and looks down it to the bead. Reloading takes it
    // off the shoulder. A double breaks open for the reload, and snaps shut faster than it opened.
    const open = !W.single && reloading && state === 'play' ? 1 : 0;
    brk += (open - brk) * Math.min(1, dt * (open > brk ? 9 : 16));
    ads += ((aim && state === 'play' && !reloading && brk < 0.5 ? 1 : 0) - ads) * Math.min(1, dt * 12);
    const fov = settings.fov * (1 - 0.27 * ads); // shouldering zooms in a little
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    // How far the current reload step has got (one shell for the semi, both barrels for the double), for the animation.
    const reload = reloading && state === 'play' ? { p: Math.min(1, reloadT / W.reload), shells, mag: W.mag } : null;
    view.update(dt, T, state === 'play' && !inspector.holding && holdsGun(), ads, brk, reload);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused || mp) step(dt); // a room's hunt keeps running while one player sits in the pause menu
    audio?.listen(camera);
    // The shotcam, when on, renders its own view first; the game's render then paints over it.
    if (settings.shotcam) shotcam.capture(dt, camera, state === 'play');
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
      const k = s * settings.sensitivity * camera.fov / settings.fov;
      yaw -= dx * k; pitch = clamp(pitch - dy * k, PITCH_MIN, PITCH_MAX);
    },
    fire, aim: setAim, reload: wantReload, hold: toggleHold, pause, key: onKey,
    lockLost() { if (state === 'play') { paused = true; aim = false; cb.onPause(); } },
  });
  const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize);
  // Low keeps the look (same lighting, models and sky) but draws fewer pixels and grass blades.
  const applyGraphics = () => {
    const low = settings.graphics === 'low';
    renderer.setPixelRatio(low ? Math.min(devicePixelRatio, 1) : Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
    world.grassDensity(low ? 0.5 : 1);
    lamp.shadowSize(low || TOUCH ? 512 : 1024);
    onResize();
  };
  onResize(); raf = requestAnimationFrame(frame);
  // Development builds only: a handle for tuning from the console (look somewhere, inspect the birds and the night).
  if (import.meta.env.DEV) window.__hunt = { flock, night, lamp, shotcam, camera, renderer, scene, look(y, p) { yaw = y; pitch = p; }, step, fire, get hud() { return { score, bagged, kills, shells }; } };

  /* ---------- public API ---------- */
  return {
    // room (optional): { seed, startAt: local ms when the round begins, slot, count, quarry, map, poseEvery? (s between
    // pose updates), and at night role ('lamp' | 'gun') and lampSlot }. A room's quarry and map win. A night hunt
    // without a room is a test night: we hold both the lamp and a gun. choke: the choke picked for each barrel ('1'…'3').
    start(weapon, room, quarry, mapId, choke) {
      inspector.release();
      Q = QUARRY[room?.quarry || quarry] || QUARRY.duck; RT = roundTime(Q.kind);
      map = mapOf(room ? room.map : mapId, Q.kind); world.setMap(map);
      audio ||= createAudio(settings.volume); audio.resume();
      W = WEAPONS[weapon] || WEAPONS.semi; chokes = chokesFor(WEAPONS[weapon] ? weapon : 'semi', choke); view.equip(W); brk = 0;
      flock.reset(); shotColumn.clear(); shotcam.clear(); hunters.clear(); bag.clear(); killLog.clear(); peers = [];
      mp = room || null; R = mp ? mulberry(mp.seed) : Math.random;
      elapsed = mp ? (Date.now() - mp.startAt) / 1000 : 0; nextSpawn = 1.5; timeLeft = RT - elapsed; lastSec = 0;
      role = Q.night ? (room?.role || 'both') : 'gun'; lampSlot = room?.lampSlot ?? -1; kills = 0;
      Object.assign(lampState, { on: false, spot: false, red: false, laser: false, bat: 1 });
      hunters.setGap(Q.night ? NIGHT.gap : 5); lamp.hide(); lamp.setMine(holdsLamp()); audio.night(!!Q.night);
      camera.position.set(mp ? slotX(mp.slot, mp.count, Q.night ? NIGHT.gap : 5) : 0, EYE, 0);
      retriever.reset(); retriever.show(true);
      if (Q.night) night.start(world.map, R, role !== 'gun');
      else { const hx = camera.position.x; world.mow([hx - 0.6, hx + 3.4, -5.5, 1.2]); } // short grass where the dog lays the birds
      score = bagged = shots = 0; shells = W.mag; reloading = false; reloadT = 0; nextShot = 0; lastKill = -9;
      yaw = 0; pitch = 0.2; aim = false; paused = false; state = 'play'; hud(); input.lock();
    },
    // Abandon the hunt (no score posted) and go back to the drifting menu view.
    quit() {
      inspector.release(); retriever.show(false); lamp.hide(); audio?.night(false);
      state = 'menu'; paused = false; aim = false; reloading = false; input.release();
      mp = null; R = Math.random; camera.position.set(0, EYE, 0);
      hunters.clear(); bag.clear(); world.growBack(); map = MENU_MAP; world.setMap(map);
      flock.clear(); shotColumn.clear();
    },
    // After the round: list is [{ by, name, sub, slot, count, winner }] per hunter. See bag.js.
    showBag: list => { if (state === 'over') layBag(list); },
    unlockAudio() { audio ||= createAudio(settings.volume); audio.resume(); },
    // A small picture of each map from where the hunter stands: { [id]: JPEG data URL }. Builds any map not yet
    // built, so call it while a loading screen is up. Drawn from the canvas in the same task as the render.
    mapPreviews(ids, w = 320, h = 180) {
      const el = renderer.domElement, cam = new THREE.PerspectiveCamera(62, el.width / el.height, 0.05, 6000);
      cam.position.set(0, EYE, 0); cam.rotation.set(0.1, 0, 0, 'YXZ');
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      const sh = Math.min(el.height, el.width * h / w), sw = sh * w / h, out = {};
      flock.birds.forEach(d => { d.g.visible = false; });
      for (const id of ids) {
        world.setMap(id); renderer.render(scene, cam);
        g.drawImage(el, (el.width - sw) / 2, (el.height - sh) / 2, sw, sh, 0, 0, w, h); out[id] = c.toDataURL('image/jpeg', 0.82);
      }
      flock.birds.forEach(d => { d.g.visible = true; });
      world.setMap(map);
      return out;
    },
    // s: { volume 0–1, sensitivity (×), fov (degrees), graphics 'high' | 'low', shotcam (on/off), shotcamKey (a KeyboardEvent
    // code) }, any subset. Turning the shotcam off drops what it has filmed and takes the camera off the guns.
    setSettings(s) {
      Object.assign(settings, s); audio?.setVolume(settings.volume); applyGraphics();
      if (!settings.shotcam) shotcam.clear();
      setShotkamsVisible(!!settings.shotcam);
    }, // call from a click so a room's start has sound
    // Another hunter (by) claimed this bird first: it falls here too and goes in their bag.
    remoteKill(id, by) { killLog.set(id, by); const d = flock.birds.find(x => x.id === id && x.alive); if (d) drop(d); },
    // Our claim lost the race: take the points back.
    revokeKill(pts) { if (Q.night) { kills = Math.max(0, kills - 1); hud(); return; } score = Math.max(0, score - pts); bagged = Math.max(0, bagged - 1); hud(); },
    // list: [{ id, name, slot, yaw, pitch, shots }] for the other hunters in the round.
    setPeers(list) { if (mp) { peers = list; hunters.sync(list.map(p => ({ ...p, holdsLamp: Q.night && p.slot === lampSlot })), mp.count, at => audio?.distantShot(at)); } },
    // Night: an event from the lamper's screen (see game/night.js).
    nightEvent(ev) { if (state === 'play' && Q.night) night.apply(ev); },
    // Night: the touch buttons.
    lamp: () => { if (live()) toggleLamp(); },
    lampMode: k => { if (live()) lampMode(k); },
    call: n => { if (live()) cb.onCall?.(n); },
    resume() { paused = false; input.lock(); },
    pause,
    fire: () => { if (live()) fire(); },
    reload: () => { if (live()) wantReload(); },
    toggleAim: () => { if (live()) setAim(!aim); },
    hold: () => { if (live()) toggleHold(); },
    dispose() { cancelAnimationFrame(raf); input.dispose(); removeEventListener('resize', onResize); renderer.dispose(); },
  };
}
