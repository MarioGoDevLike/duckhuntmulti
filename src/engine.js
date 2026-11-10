import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export const GAME_TIME = 120;
// Semi-auto: 5 in the tube, loaded one shell at a time. Double: two barrels, breaks open and takes a fresh pair.
export const WEAPONS = {
  semi: { name: 'Beretta A400', type: 'Semi-auto 12 ga', desc: '5 shells · quick follow-up shots · loads one shell at a time', mag: 5, interval: 0.22, reload: 0.55, single: true },
  double: { name: 'Side-by-side', type: 'Double barrel 12 ga', desc: '2 shells · instant second barrel · reloads both at once', mag: 2, interval: 0.12, reload: 1.3, single: false },
};
export const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches; // phones and tablets
const SHOT_SPEED = 370, EYE = 1.7, TAU = Math.PI * 2; // m/s, m
const rnd = (a, b) => a + Math.random() * (b - a);
const { clamp, smoothstep, degToRad } = THREE.MathUtils;

// Flat field around the hunter, rolling hills far out.
function groundH(x, z) {
  const k = smoothstep(Math.hypot(x, z), 140, 700);
  return k * 55 * (0.6 + 0.4 * (Math.sin(x * 0.011 + 1.3) * Math.cos(z * 0.009) + 0.5 * Math.sin(x * 0.027 + z * 0.021)));
}

function grassTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'); g.fillStyle = '#7d7a45'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26000; i++) {
    const x = rnd(0, 512), y = rnd(0, 512);
    g.strokeStyle = `hsl(${rnd(45, 95)},${rnd(25, 50)}%,${rnd(22, 55)}%)`;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd(-3, 3), y - rnd(4, 14)); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(400, 400); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, '#fff'); r.addColorStop(0.3, 'rgba(255,200,90,.8)'); r.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ---------- shared duck parts ---------- */
const sph = new THREE.SphereGeometry(1, 12, 9), box = new THREE.BoxGeometry(1, 1, 1);
const cylZ = new THREE.CylinderGeometry(1, 1, 1, 14).rotateX(Math.PI / 2);     // axis along z
const coneB = new THREE.ConeGeometry(1, 1, 6).rotateX(-Math.PI / 2);          // apex toward -z
const wingGeo = pts => new THREE.ShapeGeometry(new THREE.Shape(pts.map(p => new THREE.Vector2(p[0], p[1])))).rotateX(Math.PI / 2);
const innerG = wingGeo([[0, -0.09], [0.2, -0.08], [0.2, 0.07], [0, 0.08]]);
const outerG = wingGeo([[0, -0.08], [0.1, -0.085], [0.29, -0.04], [0.13, 0.055], [0, 0.07]]);
const L = color => new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
const M = {
  grey: L(0xa9a59b), brown: L(0x8a6a44), dark: L(0x4a4038), green: L(0x16502f), white: L(0xf2f0e6), chest: L(0x5b3322),
  bill: L(0xd9b02a), billH: L(0xb87a2c), blue: L(0x2c49a6), wingD: L(0x77726a), wingH: L(0x6b5235),
};
function part(parent, geo, mat, sx, sy, sz, x, y, z) {
  const o = new THREE.Mesh(geo, mat); o.scale.set(sx, sy, sz); o.position.set(x, y, z); parent.add(o); return o;
}
// Mallard facing +z, wings jointed at shoulder and wrist.
function makeDuck(drake) {
  const g = new THREE.Group(), body = drake ? M.grey : M.brown, head = drake ? M.green : M.brown;
  part(g, sph, body, 0.1, 0.09, 0.25, 0, 0, 0);
  if (drake) part(g, sph, M.chest, 0.092, 0.085, 0.12, 0, -0.005, 0.15);
  part(g, coneB, M.dark, 0.07, 0.03, 0.2, 0, 0.01, -0.28);
  part(g, cylZ, head, 0.032, 0.032, 0.2, 0, 0.02, 0.31);
  if (drake) part(g, cylZ, M.white, 0.034, 0.034, 0.016, 0, 0.02, 0.36);
  part(g, sph, head, 0.045, 0.045, 0.058, 0, 0.03, 0.43);
  part(g, box, drake ? M.bill : M.billH, 0.036, 0.014, 0.07, 0, 0.022, 0.5);
  const wings = [];
  for (const side of [1, -1]) {
    const s = new THREE.Group(), inner = new THREE.Group(), outer = new THREE.Group();
    s.scale.x = side; s.position.set(side * 0.08, 0.045, 0.04); outer.position.x = 0.2;
    inner.add(new THREE.Mesh(innerG, drake ? M.wingD : M.wingH)); outer.add(new THREE.Mesh(outerG, M.dark));
    part(inner, box, M.blue, 0.15, 0.006, 0.04, 0.11, 0, -0.065);
    inner.add(outer); s.add(inner); g.add(s); wings.push([inner, outer]);
  }
  g.scale.setScalar(1.4);
  return { g, wings };
}

/* ---------- synthesised audio ---------- */
function makeAudio() {
  const ac = new (window.AudioContext || window.webkitAudioContext)(), out = ac.destination;
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const noise = (at, gain, type, f0, f1, dur, q = 1) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    s.connect(f).connect(g).connect(out); s.start(at, Math.random()); s.stop(at + dur);
  };
  const tone = (at, gain, f0, f1, dur) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(gain, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g).connect(out); o.start(at); o.stop(at + dur);
  };
  const wind = ac.createBufferSource(), wf = ac.createBiquadFilter(), wg = ac.createGain();
  wind.buffer = buf; wind.loop = true; wf.type = 'lowpass'; wf.frequency.value = 350; wg.gain.value = 0.05;
  wind.connect(wf).connect(wg).connect(out); wind.start();
  return {
    resume: () => ac.resume(),
    shot() {
      const n = ac.currentTime;
      noise(n, 1, 'lowpass', 6000, 300, 0.8); tone(n, 0.9, 140, 35, 0.3);
      noise(n + 0.28, 0.22, 'lowpass', 900, 200, 1.5);                       // echo off the treeline
      noise(n + 0.12, 0.25, 'bandpass', 2600, 2400, 0.05, 3);                // action cycling
    },
    click: f => noise(ac.currentTime, 0.5, 'bandpass', f, f * 0.9, 0.06, 3),
    thud: () => tone(ac.currentTime, 0.4, 90, 40, 0.15),
    quack(vol) {
      let n = ac.currentTime;
      const f = ac.createBiquadFilter(), g = ac.createGain();
      f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 5; g.gain.value = vol; f.connect(g).connect(out);
      for (let i = 0, c = 2 + (Math.random() * 3 | 0); i < c; i++) {
        const o = ac.createOscillator(), og = ac.createGain(), len = 0.13 - i * 0.015;
        o.type = 'sawtooth'; o.frequency.setValueAtTime(560 - i * 25, n); o.frequency.exponentialRampToValueAtTime(360, n + len);
        og.gain.setValueAtTime(0, n); og.gain.linearRampToValueAtTime(1, n + 0.015); og.gain.exponentialRampToValueAtTime(0.01, n + len);
        o.connect(og).connect(f); o.start(n); o.stop(n + len); n += len + 0.05;
      }
    },
  };
}

/* ---------- game ---------- */
export function createGame(canvas, cb) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !TOUCH });
  renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.55;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 6000);
  camera.rotation.order = 'YXZ'; camera.position.set(0, EYE, 0); scene.add(camera);

  // Low morning sun to the hunter's right.
  const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, degToRad(82), degToRad(110));
  Object.entries({ turbidity: 8, rayleigh: 2.2, mieCoefficient: 0.006, mieDirectionalG: 0.85 }).forEach(([k, v]) => { sky.material.uniforms[k].value = v; });
  sky.material.uniforms.sunPosition.value.copy(sunDir);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(scene, 0, 0.1, 6000).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x7a6a45, 1.6));
  const sun = new THREE.DirectionalLight(0xffd2a0, 3.2); sun.position.copy(sunDir).multiplyScalar(100); scene.add(sun);
  scene.fog = new THREE.FogExp2(0xc9c4b4, 0.0028);

  const col = new THREE.Color(), m = new THREE.Object3D();
  { // ground
    const geo = new THREE.PlaneGeometry(3000, 3000, 160, 160).rotateX(-Math.PI / 2), p = geo.attributes.position;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i); p.setY(i, groundH(x, z));
      const n = 0.5 + 0.5 * Math.sin(x * 0.05 + Math.sin(z * 0.04) * 2) * Math.cos(z * 0.06);
      col.setHSL(0.15, 0.25, 0.62 + n * 0.3); c.set([col.r, col.g, col.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); geo.computeVertexNormals();
    scene.add(new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ map: grassTexture(), vertexColors: true })));
  }
  const uTime = { value: 0 };
  { // wind-blown grass around the hunter
    const geo = new THREE.PlaneGeometry(0.1, 1, 1, 4).translate(0, 0.5, 0), p = geo.attributes.position;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), s = 0.35 + 0.65 * y; p.setX(i, p.getX(i) * (1 - y * 0.85)); c.set([s, s, s], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = s => {
      s.uniforms.uTime = uTime;
      s.vertexShader = 'uniform float uTime;\n' + s.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float w = sin(uTime * 1.6 + instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.27) + 0.5 * sin(uTime * 3.7 + instanceMatrix[3].x * 1.3);
        transformed.x += w * 0.16 * position.y * position.y;`);
    };
    const N = TOUCH ? 16000 : 45000, grass = new THREE.InstancedMesh(geo, mat, N);
    for (let i = 0; i < N; i++) {
      const r = 1.2 + 70 * Math.pow(Math.random(), 1.4), a = rnd(0, TAU);
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); m.rotation.set(rnd(-0.25, 0.25), rnd(0, Math.PI), rnd(-0.25, 0.25));
      m.scale.set(rnd(0.8, 1.8), rnd(0.35, 0.95), 1); m.updateMatrix(); grass.setMatrixAt(i, m.matrix);
      grass.setColorAt(i, col.setHSL(rnd(0.12, 0.24), rnd(0.3, 0.55), rnd(0.3, 0.5)));
    }
    scene.add(grass);
  }
  const addTrees = (geo, n, hue) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), n);
    for (let i = 0; i < n; i++) {
      let x, z;
      do { const r = rnd(150, 520), a = rnd(0, TAU); x = Math.cos(a) * r; z = Math.sin(a) * r; } while (Math.sin(x * 0.02) + Math.cos(z * 0.017 + 1) < 0.1);
      const s = rnd(0.7, 1.5);
      m.position.set(x, groundH(x, z), z); m.rotation.set(0, rnd(0, 6), 0); m.scale.set(s, s * rnd(0.9, 1.4), s); m.updateMatrix();
      mesh.setMatrixAt(i, m.matrix); mesh.setColorAt(i, col.setHSL(hue + rnd(-0.03, 0.03), rnd(0.3, 0.5), rnd(0.12, 0.22)));
    }
    scene.add(mesh);
  };
  addTrees(new THREE.ConeGeometry(3, 13, 7).translate(0, 6.5, 0), 700, 0.33);
  addTrees(new THREE.IcosahedronGeometry(4.5, 1).scale(1, 1.2, 1).translate(0, 5, 0), 500, 0.27);

  // First-person guns, built along -z. Both keep the bead at the same height so the aiming pose lines up.
  const gun = new THREE.Group(); camera.add(gun);
  const metal = new THREE.MeshStandardMaterial({ color: 0x1c1d20, metalness: 0.7, roughness: 0.4, envMapIntensity: 0.5 });
  const recv = new THREE.MeshStandardMaterial({ color: 0x2b2c2f, metalness: 0.6, roughness: 0.45, envMapIntensity: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a3216, roughness: 0.55, envMapIntensity: 0.4 });
  const beadM = new THREE.MeshBasicMaterial({ color: 0xff5a2a });
  const semiGun = new THREE.Group(), sxsGun = new THREE.Group(); gun.add(semiGun, sxsGun);
  part(semiGun, cylZ, metal, 0.012, 0.012, 0.72, 0, 0.018, -0.56);          // barrel
  part(semiGun, box, metal, 0.008, 0.004, 0.72, 0, 0.032, -0.56);           // vent rib
  part(semiGun, cylZ, metal, 0.011, 0.011, 0.36, 0, -0.008, -0.38);         // magazine tube
  part(semiGun, cylZ, wood, 0.023, 0.026, 0.27, 0, -0.008, -0.33);          // forend
  part(semiGun, cylZ, recv, 0.023, 0.033, 0.21, 0, 0, -0.095);              // receiver
  part(semiGun, box, metal, 0.004, 0.022, 0.07, 0.023, 0.01, -0.1);         // ejection port
  part(semiGun, box, wood, 0.04, 0.06, 0.32, 0, -0.03, 0.16).rotation.x = -0.12; // stock
  part(semiGun, sph, beadM, 0.0035, 0.0035, 0.0035, 0, 0.038, -0.915);       // bead
  for (const x of [-0.0125, 0.0125]) part(sxsGun, cylZ, metal, 0.012, 0.012, 0.72, x, 0.018, -0.56); // barrels
  part(sxsGun, box, metal, 0.007, 0.006, 0.72, 0, 0.031, -0.56);            // rib between the barrels
  part(sxsGun, box, wood, 0.046, 0.024, 0.24, 0, 0.0, -0.34);               // splinter forend
  part(sxsGun, box, recv, 0.05, 0.048, 0.13, 0, 0.006, -0.135);             // boxlock action
  part(sxsGun, box, metal, 0.01, 0.008, 0.03, 0.006, 0.033, -0.07);         // top lever
  part(sxsGun, box, metal, 0.004, 0.02, 0.03, 0, -0.026, -0.1);             // twin trigger guard
  part(sxsGun, box, wood, 0.038, 0.052, 0.34, 0, -0.022, 0.13).rotation.x = -0.09; // straight stock
  part(sxsGun, sph, beadM, 0.0035, 0.0035, 0.0035, 0, 0.037, -0.915);        // bead
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.setScalar(0.4); flash.position.set(0, 0.018, -0.98); gun.add(flash);
  const flashL = new THREE.PointLight(0xffc070, 0, 30); flashL.position.copy(flash.position); gun.add(flashL);
  const hull = part(camera, cylZ, new THREE.MeshLambertMaterial({ color: 0xb3261e }), 0.01, 0.01, 0.06, 0, 0, 0);
  const hullV = new THREE.Vector3(); let hullT = 0;
  const fMat = new THREE.PointsMaterial({ color: 0xe8e2d4, size: 0.07, transparent: true, opacity: 0.9 });

  let audio, raf, last = performance.now(), T = 0, state = 'menu', paused = false, locked = false;
  let yaw = 0, pitch = 0.16, kick = 0, recoil = 0, flashT = 0, spawnT = 1, aim = false, ads = 0, brk = 0, W = WEAPONS.semi;
  const UP = new THREE.Vector3(0, 1, 0);
  let timeLeft = GAME_TIME, score = 0, bag = 0, shots = 0, shells = W.mag, reloading = false, reloadT = 0, nextShot = 0, lastKill = -9, lastSec = 0;
  const ducks = [], pellets = [], bursts = [];
  const rel = new THREE.Vector3(), rv = new THREE.Vector3(), tmp = new THREE.Vector3();
  const hud = () => cb.onHud({ score, ducks: bag, shells, mag: W.mag, reloading, aiming: aim, time: Math.ceil(timeLeft) });

  function spawn() {
    const speed = rnd(13, 27), n = Math.random() < 0.4 ? 1 : 2 + (Math.random() * 4 | 0);
    const p = new THREE.Vector3(), v = new THREE.Vector3();
    if (Math.random() < 0.72) { // crossing shot
      const side = Math.random() < 0.5 ? 1 : -1;
      p.set(-side * 120, rnd(5, 20), -rnd(14, 50)); v.set(side, rnd(-0.03, 0.03), rnd(-0.1, 0.1));
    } else {                    // incoming, passing overhead
      p.set(rnd(-70, 70), rnd(10, 24), -170); v.set(rnd(-25, 25) - p.x, 0, 190);
    }
    // Birds can come from any side; most flights favour roughly where the hunter is facing.
    const turn = Math.random() < 0.6 ? yaw + rnd(-1.5, 1.5) : rnd(0, TAU);
    p.applyAxisAngle(UP, turn); v.applyAxisAngle(UP, turn);
    v.normalize(); const lat = new THREE.Vector3(-v.z, 0, v.x);
    for (let i = 0; i < n; i++) { // V formation
      const d = makeDuck(Math.random() < 0.6), k = Math.ceil(i / 2);
      d.g.position.copy(p).addScaledVector(v, -k * 1.6).addScaledVector(lat, (i % 2 ? 1 : -1) * k * 1.2); d.g.position.y += rnd(-0.4, 0.4);
      Object.assign(d, { vel: v.clone().multiplyScalar(speed), alive: true, down: false, ph: rnd(0, 6), hz: 5 + speed * 0.14, life: 0, wob: rnd(0, 6), spin: 0 });
      scene.add(d.g); ducks.push(d);
    }
    if (state === 'play') audio?.quack(0.12 + Math.random() * 0.15);
  }

  function burst(p) {
    const n = 26, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([p.x, p.y, p.z], i * 3); vel.push(new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1.5), rnd(-1, 1)).multiplyScalar(rnd(0.5, 3))); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, fMat); pts.frustumCulled = false; scene.add(pts); bursts.push({ pts, vel, life: 2.2 });
  }

  function kill(d, range) {
    const speed = d.vel.length(), dbl = T - lastKill < 1.5; lastKill = T;
    d.alive = false; d.life = 0; d.spin = rnd(4, 9); d.vel.multiplyScalar(0.85);
    for (const [a, b] of d.wings) { a.rotation.z = 1.1; b.rotation.z = -0.5; }
    const pts = Math.round((40 + range * 2 + speed * 3) * (dbl ? 2 : 1)); score += pts; bag++;
    cb.onMsg(`${dbl ? 'DOUBLE!  ' : ''}+${pts}  ·  ${range | 0} m`); burst(d.g.position); hud();
  }

  function fire() {
    if (T < nextShot || (reloading && !W.single)) return; // a broken-open double can't fire
    if (shells <= 0) { audio.click(1500); reloading = true; hud(); return; }
    reloading = false; reloadT = 0; shells--; shots++; nextShot = T + W.interval; recoil = 1; flashT = 0.05;
    if (!W.single) flash.position.x = flashL.position.x = shells === 1 ? 0.0125 : -0.0125; // right barrel, then left
    audio.shot();
    pellets.push({ pos: camera.position.clone(), dir: camera.getWorldDirection(new THREE.Vector3()), dist: 0, hit: false, miss: 1e9, hint: '' });
    kick = 1;
    for (const d of ducks) if (d.alive) d.vel.y += rnd(0.3, 1.6); // birds flare at the shot
    if (W.single) { hull.position.set(0.14, -0.11, -0.4); hullV.set(1.5, 1.2, 0.2); hullT = 0.5; }
    hud();
  }

  function step(dt) {
    T += dt; uTime.value = T;
    recoil = Math.max(0, recoil - dt * 6); kick = Math.max(0, kick - dt * 4); flashT -= dt;
    if (state === 'play') {
      timeLeft -= dt;
      if (timeLeft <= 0) {
        timeLeft = 0; state = 'over'; locked = false; document.exitPointerLock?.();
        cb.onEnd({ score, ducks: bag, shots });
      } else {
        if (reloading && shells < W.mag && (reloadT += dt) > W.reload) {
          reloadT = 0; shells = W.single ? shells + 1 : W.mag; audio.click(3200); if (shells === W.mag) reloading = false; hud();
        }
        const sec = Math.ceil(timeLeft); if (sec !== lastSec) { lastSec = sec; hud(); }
      }
    } else if (state === 'menu') { yaw = Math.sin(T * 0.12) * 0.35; pitch = 0.16; }
    if ((spawnT -= dt) <= 0) { spawn(); spawnT = state === 'play' ? rnd(1.6, 3.6) - 1.2 * (1 - timeLeft / GAME_TIME) : rnd(2.5, 5); }

    // Shot column: travels at SHOT_SPEED and spreads with range. Closest approach is solved against each
    // bird's own velocity, so a fast crosser is only hit when the shot is placed ahead of it.
    for (let i = pellets.length - 1; i >= 0; i--) {
      const s = pellets[i];
      for (const d of ducks) {
        if (!d.alive) continue;
        rel.copy(s.pos).sub(d.g.position); rv.copy(s.dir).multiplyScalar(SHOT_SPEED).sub(d.vel);
        const tt = clamp(-rel.dot(rv) / rv.lengthSq(), 0, dt); rel.addScaledVector(rv, tt);
        const miss = rel.length(), range = s.dist + SHOT_SPEED * tt;
        if (miss < 0.26 + range * 0.013 && Math.random() < (64 - range) / 24) { kill(d, range); s.hit = true; }
        else if (miss < s.miss) {
          const along = rel.dot(d.vel) / d.vel.length(); s.miss = miss;
          s.hint = Math.abs(along) > Math.abs(rel.y) ? (along > 0 ? 'Too far ahead' : 'Behind — lead more') : (rel.y > 0 ? 'Over the top' : 'Underneath');
        }
      }
      s.pos.addScaledVector(s.dir, SHOT_SPEED * dt); s.dist += SHOT_SPEED * dt;
      if (s.dist > 75) { if (!s.hit && s.miss < 5) cb.onMsg(s.hint); pellets.splice(i, 1); }
    }

    for (let i = ducks.length - 1; i >= 0; i--) {
      const d = ducks[i], g = d.g, p = g.position; d.life += dt;
      let gone = false;
      if (d.alive) {
        d.vel.y += (Math.sin(d.life * 1.1 + d.wob) * 0.9 + (p.y < 4 ? 2 : p.y > 30 ? -2 : 0)) * dt;
        p.addScaledVector(d.vel, dt); g.lookAt(tmp.copy(p).add(d.vel)); g.rotateZ(Math.sin(d.life * 0.9 + d.wob) * 0.12);
        d.ph += dt * d.hz * TAU;
        for (const [a, b] of d.wings) { a.rotation.z = 0.12 + 0.62 * Math.sin(d.ph); b.rotation.z = 0.5 * Math.sin(d.ph - 1.1); }
        gone = Math.hypot(p.x, p.z) > 200;
      } else if (!d.down) {
        d.vel.y -= 9.8 * dt; d.vel.multiplyScalar(1 - 0.5 * dt); p.addScaledVector(d.vel, dt);
        g.rotateX(d.spin * dt); g.rotateZ(d.spin * 0.6 * dt);
        const h = groundH(p.x, p.z) + 0.12;
        if (p.y < h) { d.down = true; d.life = 0; p.y = h; g.rotation.set(0, rnd(0, 6), 1.4); audio?.thud(); }
      } else gone = d.life > 8;
      if (gone) { scene.remove(g); ducks.splice(i, 1); }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], a = b.pts.geometry.attributes.position;
      b.vel.forEach((v, j) => { v.multiplyScalar(1 - 2 * dt); v.y -= 1.2 * dt; a.setXYZ(j, a.getX(j) + v.x * dt, a.getY(j) + v.y * dt, a.getZ(j) + v.z * dt); });
      a.needsUpdate = true;
      if ((b.life -= dt) <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); bursts.splice(i, 1); }
    }

    camera.rotation.set(pitch + kick * 0.03, yaw, 0);
    gun.visible = state === 'play';
    // Right mouse shoulders the gun: the eye drops just above the rib and looks down it to the bead.
    // While a double is broken open for reloading it drops off the shoulder.
    brk += ((!W.single && reloading && state === 'play' ? 1 : 0) - brk) * Math.min(1, dt * 10);
    ads += ((aim && state === 'play' && brk < 0.5 ? 1 : 0) - ads) * Math.min(1, dt * 12);
    const hip = 1 - ads, fov = 55 - 15 * ads;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    gun.position.set(0.11 * hip, -0.13 * hip - 0.055 * ads - 0.06 * brk + Math.sin(T * 1.7) * 0.0015 * hip, -0.3 * hip - 0.38 * ads + recoil * 0.05);
    gun.rotation.set(0.035 * hip + 0.012 * ads - 0.45 * brk + recoil * 0.06 * (1 - 0.5 * ads), 0.085 * hip, 0);
    flash.visible = flashT > 0; flash.material.rotation = T * 50; flashL.intensity = flashT > 0 ? 40 : 0;
    hull.visible = gun.visible && (hullT -= dt) > 0;
    if (hull.visible) { hullV.y -= 9.8 * dt; hull.position.addScaledVector(hullV, dt); hull.rotation.x += dt * 20; }
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!paused) step(dt);
    renderer.render(scene, camera);
  }

  const live = () => state === 'play' && !paused;
  const wantReload = () => { if (shells < W.mag && !reloading) { reloading = true; hud(); } };
  const setAim = v => { if (aim !== v) { aim = v; hud(); } };
  const look = (dx, dy, s) => { // full 360° turn; slower while aiming
    if (!live()) return;
    const k = s * camera.fov / 55;
    yaw -= dx * k; pitch = clamp(pitch - dy * k, -0.2, 1.45);
  };
  const onMove = e => look(e.movementX, e.movementY, 0.0016);
  const onDown = e => { if (live() && e.target === canvas) { if (e.button === 0) fire(); else if (e.button === 2) setAim(true); } };
  const onUp = e => { if (e.button === 2) setAim(false); };
  // Touch: drag on the scene to look. preventDefault stops the browser from also sending fake mouse clicks.
  let tid = null, tx = 0, ty = 0;
  const onTS = e => { e.preventDefault(); if (tid === null) { const t = e.changedTouches[0]; tid = t.identifier; tx = t.clientX; ty = t.clientY; } };
  const onTM = e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === tid) { look(t.clientX - tx, t.clientY - ty, 0.0045); tx = t.clientX; ty = t.clientY; }
  };
  const onTE = e => { for (const t of e.changedTouches) if (t.identifier === tid) tid = null; };
  const pause = () => {
    if (!live()) return;
    paused = true; aim = false; locked = false; document.exitPointerLock?.(); cb.onPause();
  };
  const onHide = () => { if (document.hidden) pause(); };
  const onKey = e => {
    if (!live()) return;
    if (e.code === 'KeyR') wantReload();
    else if (e.code === 'Escape' || e.code === 'KeyP') pause(); // Esc also pauses when the mouse isn't captured
  };
  const onMenu = e => e.preventDefault();
  const onLock = () => {
    const l = document.pointerLockElement === canvas;
    if (locked && !l && state === 'play') { paused = true; aim = false; cb.onPause(); }
    locked = l;
  };
  const onResize = () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); };
  // Desktop grabs the mouse; phones go fullscreen and try to turn to landscape (not every browser allows it).
  const lock = () => {
    try {
      if (TOUCH) document.documentElement.requestFullscreen?.()?.then(() => screen.orientation?.lock?.('landscape'))?.catch(() => {});
      else canvas.requestPointerLock()?.catch?.(() => {});
    } catch { /* falls back to unlocked mouse / windowed play */ }
  };
  const act = { passive: false };
  const events = [[document, 'mousemove', onMove], [document, 'mousedown', onDown], [document, 'mouseup', onUp], [document, 'keydown', onKey],
    [document, 'contextmenu', onMenu], [document, 'pointerlockchange', onLock], [document, 'visibilitychange', onHide], [window, 'resize', onResize],
    [canvas, 'touchstart', onTS, act], [canvas, 'touchmove', onTM, act], [canvas, 'touchend', onTE], [canvas, 'touchcancel', onTE]];
  events.forEach(([t, n, f, o]) => t.addEventListener(n, f, o));
  onResize(); raf = requestAnimationFrame(frame);

  return {
    start(weapon) {
      audio ||= makeAudio(); audio.resume();
      W = WEAPONS[weapon] || WEAPONS.semi; semiGun.visible = W.single; sxsGun.visible = !W.single;
      flash.position.x = flashL.position.x = 0; brk = 0;
      ducks.forEach(d => scene.remove(d.g)); ducks.length = pellets.length = 0;
      timeLeft = GAME_TIME; score = bag = shots = 0; shells = W.mag; reloading = false; reloadT = 0; nextShot = 0; lastKill = -9; spawnT = 1.5;
      yaw = 0; pitch = 0.2; aim = false; paused = false; state = 'play'; hud(); lock();
    },
    // Abandon the hunt (no score posted) and go back to the drifting menu view.
    quit() {
      state = 'menu'; paused = false; aim = false; reloading = false; locked = false; document.exitPointerLock?.();
      ducks.forEach(d => scene.remove(d.g)); ducks.length = pellets.length = 0;
    },
    resume() { paused = false; lock(); },
    pause,
    fire: () => { if (live()) fire(); },
    reload: () => { if (live()) wantReload(); },
    toggleAim: () => { if (live()) setAim(!aim); },
    dispose() { cancelAnimationFrame(raf); events.forEach(([t, n, f]) => t.removeEventListener(n, f)); renderer.dispose(); },
  };
}
