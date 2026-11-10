import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import duckSoundUrl from './assets/duck_sound.mp3';

export const GAME_TIME = 120;
// Semi-auto: 5 in the tube, loaded one shell at a time. Over-under: two stacked barrels, breaks open and takes a fresh pair.
export const WEAPONS = {
  semi: { name: 'Beretta A400', type: 'Semi-auto 12 ga', desc: '5 shells · quick follow-up shots · loads one shell at a time', mag: 5, interval: 0.22, reload: 0.55, single: true },
  double: { name: 'Over-under', type: 'Over-under 12 ga', desc: '2 shells · instant second barrel · breaks open and reloads both', mag: 2, interval: 0.12, reload: 1.3, single: false },
};
export const TOUCH = matchMedia('(hover: none), (pointer: coarse)').matches; // phones and tablets
const OU_BARRELS = [-0.0055, 0.018]; // bottom and top barrel heights in the gun model
const SHOT_SPEED = 370, EYE = 1.7, TAU = Math.PI * 2; // m/s, m
const rnd = (a, b) => a + Math.random() * (b - a);
// Seeded generator: every player in a room gets the same flights from the same seed.
function mulberry(seed) {
  return () => {
    seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const slotX = (slot, count) => (slot - (count - 1) / 2) * 5; // hunters stand 5 m apart in a row
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
// Grey laminated wood: thin dyed layers, cut at a slant so they show as wavy bands.
function laminateTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'); g.fillStyle = '#4b4b49'; g.fillRect(0, 0, 256, 256);
  for (let y = -40; y < 300; y += rnd(3, 9)) {
    const l = rnd(26, 50), a = rnd(4, 14), f = rnd(0.01, 0.03), p = rnd(0, 6);
    g.strokeStyle = `hsl(40,4%,${l}%)`; g.lineWidth = rnd(2, 5); g.beginPath();
    for (let x = 0; x <= 256; x += 8) g.lineTo(x, y + Math.sin(x * f + p) * a + x * 0.12);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}
// Floating text: first line in the given colour, any further lines smaller and gold.
function labelSprite(lines, color = '#f1e8d0', width = 1.2) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 64 * lines.length;
  const x = c.getContext('2d'); x.textAlign = 'center'; x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,.7)';
  lines.forEach((t, i) => {
    x.font = `bold ${i ? 38 : 50}px Georgia`; x.strokeText(t, 256, 48 + i * 64);
    x.fillStyle = i ? '#e2c877' : color; x.fillText(t, 256, 48 + i * 64);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
  sp.scale.set(width, width * c.height / 512, 1);
  return sp;
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
const torus = new THREE.TorusGeometry(1, 0.13, 8, 20).rotateY(Math.PI / 2);   // ring in the y-z plane
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
  return { g, wings, drake };
}

/* ---------- first-person hands ---------- */
const V = (x, y, z) => new THREE.Vector3(x, y, z), Y_AXIS = V(0, 1, 0);
// A capsule from a to b: one finger segment, a wrist, a forearm.
function bone(parent, mat, a, b, r) {
  const d = b.clone().sub(a), o = new THREE.Mesh(new THREE.CapsuleGeometry(r, d.length(), 4, 10), mat);
  o.position.copy(a).addScaledVector(d, 0.5); o.quaternion.setFromUnitVectors(Y_AXIS, d.normalize()); parent.add(o);
}
const chain = (parent, mat, pts, r0, r1) => pts.slice(1).forEach((p, i) => bone(parent, mat, pts[i], p, r0 + (r1 - r0) * i / (pts.length - 2 || 1)));
const skin = new THREE.MeshStandardMaterial({ color: 0xc08a68, roughness: 0.62, metalness: 0, envMapIntensity: 0.4 });
const sleeve = new THREE.MeshStandardMaterial({ color: 0x4a5236, roughness: 0.95, envMapIntensity: 0.3 });
const cuff = new THREE.MeshStandardMaterial({ color: 0x2c2f22, roughness: 0.95, envMapIntensity: 0.3 });
function forearm(g, wrist, elbow) {
  const d = elbow.clone().sub(wrist);
  bone(g, skin, wrist, wrist.clone().addScaledVector(d, 0.35), 0.022);
  bone(g, cuff, wrist.clone().addScaledVector(d, 0.2), wrist.clone().addScaledVector(d, 0.3), 0.034);
  bone(g, sleeve, wrist.clone().addScaledVector(d, 0.28), elbow, 0.04);
}
// Trigger hand. Frame: origin at the top of the grip, -y down the grip, -z toward the muzzle, +x to the right.
function triggerHand() {
  const g = new THREE.Group();
  part(g, sph, skin, 0.015, 0.046, 0.034, 0.028, -0.045, 0.01);              // back of the hand
  part(g, sph, skin, 0.022, 0.04, 0.017, 0.01, -0.058, 0.03);                // heel of the palm round the back of the grip
  [[0.03, 0.0088], [0.052, 0.0084], [0.073, 0.0074]].forEach(([h, r], i) => { // middle, ring, little finger wrap the grip
    const k = 1 - i * 0.12;
    chain(g, skin, [V(0.03, -h, -0.008), V(0.026, -h, -0.031), V(0.024 - 0.026 * k, -h - 0.002, -0.034), V(0.022 - 0.044 * k, -h - 0.004, -0.02)], r, r * 0.85);
  });
  chain(g, skin, [V(0.03, -0.01, -0.014), V(0.024, 0.0, -0.038), V(0.011, 0.011, -0.054), V(0.001, 0.007, -0.062)], 0.0085, 0.0072); // index on the trigger
  chain(g, skin, [V(0.03, -0.02, 0.02), V(0.024, 0.024, 0.022), V(0.003, 0.036, 0.016), V(-0.018, 0.031, 0.009)], 0.0105, 0.0085); // thumb over the wrist
  forearm(g, V(0.032, -0.075, 0.035), V(0.14, -0.17, 0.4));
  return g;
}
// Support hand. Frame: origin on the forend's axis, palm under it, fingers up the right side, thumb along the left.
function supportHand() {
  const g = new THREE.Group();
  part(g, sph, skin, 0.03, 0.013, 0.045, 0.002, -0.043, 0.005).rotation.z = 0.3; // palm cupping the forend
  [[-0.03, 0.0088, 1], [-0.01, 0.0088, 1], [0.01, 0.0082, 0.95], [0.028, 0.0072, 0.82]].forEach(([z, r, k]) => {
    chain(g, skin, [V(0.02, -0.036, z), V(0.037, -0.016 * k, z - 0.004), V(0.036, 0.011 * k, z - 0.008), V(0.021, 0.029 * k, z - 0.011)], r, r * 0.85);
  });
  chain(g, skin, [V(-0.012, -0.045, 0.035), V(-0.03, -0.03, 0.012), V(-0.037, -0.012, -0.014), V(-0.036, 0.0, -0.034)], 0.0105, 0.0085);
  forearm(g, V(-0.006, -0.05, 0.05), V(-0.16, -0.27, 0.33));
  return g;
}
// pose: [x, y, z, tilt] for each hand's frame within the gun.
function addHands(gunGroup, grip, fore, foreScale = 1) {
  const r = triggerHand(), l = supportHand();
  r.position.set(grip[0], grip[1], grip[2]); r.rotation.x = grip[3];
  l.position.set(fore[0], fore[1], fore[2]); l.scale.setScalar(foreScale);
  gunGroup.add(r, l);
}

/* ---------- audio ---------- */
// Recorded mallard calls are cut into single calls at load time; the guns are synthesised in layers
// (supersonic crack, muzzle blast, chest thump, action noise) and sent through an outdoor reverb.
// Everything positional goes through HRTF panners, with the listener riding on the camera.

// Split a recording into its separate calls: runs of loud 20 ms windows, joined across short gaps.
function findCalls(buffer) {
  const data = buffer.getChannelData(0), rate = buffer.sampleRate, win = Math.round(rate * 0.02);
  const rms = [];
  for (let i = 0; i + win <= data.length; i += win) {
    let s = 0; for (let j = i; j < i + win; j++) s += data[j] * data[j];
    rms.push(Math.sqrt(s / win));
  }
  const thr = Math.max(0.015, 0.2 * Math.max(...rms)), gap = 6, out = [];
  for (let i = 0, start = -1, quiet = 0; i <= rms.length; i++) {
    if (i < rms.length && rms[i] > thr) { if (start < 0) start = i; quiet = 0; continue; }
    if (start >= 0 && (++quiet > gap || i === rms.length)) {
      const a = Math.max(0, start - 2) * 0.02, b = Math.min(i - quiet + 3, rms.length) * 0.02;
      if (b - a > 0.12) out.push([a, Math.min(b - a, 1.8)]);
      start = -1;
    }
  }
  return out.length ? out : [[0, Math.min(1.5, buffer.duration)]];
}

function makeAudio() {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  // Brick-wall limiter so stacked shots and calls never clip.
  const out = ac.createDynamicsCompressor();
  Object.entries({ threshold: -8, knee: 0, ratio: 20, attack: 0.002, release: 0.2 }).forEach(([k, v]) => { out[k].value = v; });
  out.connect(ac.destination);

  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

  // Open field: early slap off the treeline, then a long dark tail rolling over the hills.
  const verb = ac.createConvolver(), wet = ac.createGain(); wet.gain.value = 0.5;
  {
    const len = ac.sampleRate * 3.2, ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let c = 0; c < 2; c++) {
      const ch = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / ac.sampleRate;
        lp += 0.12 * ((Math.random() * 2 - 1) - lp); // one-pole lowpass: outdoor tails lose their top end
        ch[i] = lp * Math.exp(-t * 1.9) * (t < 0.02 ? t / 0.02 : 1) * 2.5;
      }
      for (const [t, g] of [[0.19, 0.5], [0.33, 0.35], [0.52, 0.25], [0.81, 0.15]]) { // treeline echoes
        const at = Math.round((t + c * 0.013) * ac.sampleRate);
        for (let i = 0; i < 400; i++) ch[at + i] += g * (Math.random() * 2 - 1) * Math.exp(-i / 90);
      }
    }
    verb.buffer = ir; verb.connect(wet).connect(out);
  }

  // Each sound gets a bus: dry level, reverb send, and either a stereo pan or a 3D position.
  const bus = ({ at = null, pan = 0, send = 0.3, gain = 1, lp = 0 } = {}) => {
    const g = ac.createGain(); g.gain.value = gain;
    let head = g;
    if (lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; f.connect(g); head = f; }
    if (at) {
      const p = ac.createPanner();
      Object.assign(p, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 8, rolloffFactor: 1, maxDistance: 400 });
      if (p.positionX) { p.positionX.value = at.x; p.positionY.value = at.y; p.positionZ.value = at.z; } else p.setPosition(at.x, at.y, at.z);
      g.connect(p).connect(out);
      // Send after the panner, so the reverb fades with distance along with the dry sound.
      if (send) { const s = ac.createGain(); s.gain.value = send; p.connect(s).connect(verb); }
    } else {
      const p = ac.createStereoPanner(); p.pan.value = pan; g.connect(p).connect(out);
      if (send) { const s = ac.createGain(); s.gain.value = send; p.connect(s).connect(verb); }
    }
    return head;
  };
  const noise = (dst, at, gain, type, f0, f1, dur, q = 0.7, attack = 0.001) => {
    const s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = buf; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, at); f.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + attack); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(dst); s.start(at, Math.random()); s.stop(at + dur + 0.01);
  };
  const tone = (dst, at, gain, f0, f1, dur, type = 'sine') => {
    const o = ac.createOscillator(), g = ac.createGain(); o.type = type;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(dst); o.start(at); o.stop(at + dur + 0.01);
  };
  // A metal-on-metal clack: a bright tick over a short ringing resonance.
  const clack = (dst, at, f, gain = 0.5) => {
    noise(dst, at, gain, 'bandpass', f * 1.6, f * 1.2, 0.025, 2.5);
    noise(dst, at, gain * 0.6, 'bandpass', f, f * 0.95, 0.08, 12);
    tone(dst, at, gain * 0.15, f * 0.62, f * 0.6, 0.06, 'triangle');
  };

  const wind = ac.createBufferSource(), wf = ac.createBiquadFilter(), wg = ac.createGain();
  wind.buffer = buf; wind.loop = true; wf.type = 'lowpass'; wf.frequency.value = 380; wg.gain.value = 0.045;
  wind.connect(wf).connect(wg).connect(out); wind.start();
  const gust = ac.createOscillator(), gg = ac.createGain(); gust.frequency.value = 0.07; gg.gain.value = 0.025; // slow gusts
  gust.connect(gg).connect(wg.gain); gust.start();

  let calls = null, voices = 0;
  fetch(duckSoundUrl).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b))
    .then(b => { calls = { b, cuts: findCalls(b) }; })
    .catch(e => console.warn('Duck recording unavailable, using synthesised calls', e));
  const synthQuack = (dst, n) => {
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 5; f.connect(dst);
    for (let i = 0, c = 2 + (Math.random() * 3 | 0); i < c; i++) {
      const len = 0.13 - i * 0.015; tone(f, n, 1, 560 - i * 25, 360, len, 'sawtooth'); n += len + 0.05;
    }
  };
  const lp = new THREE.Vector3(), lf = new THREE.Vector3();

  return {
    resume: () => ac.resume(),
    // Listener follows the hunter's head.
    listen(cam) {
      const L = ac.listener; cam.getWorldPosition(lp); cam.getWorldDirection(lf);
      if (L.positionX) {
        L.positionX.value = lp.x; L.positionY.value = lp.y; L.positionZ.value = lp.z;
        L.forwardX.value = lf.x; L.forwardY.value = lf.y; L.forwardZ.value = lf.z;
        L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
      } else { L.setPosition(lp.x, lp.y, lp.z); L.setOrientation(lf.x, lf.y, lf.z, 0, 1, 0); }
    },
    // Our own gun. semi: the action cycles and spits the hull; the over-under just settles its hammer.
    shot(semi) {
      const n = ac.currentTime, b = bus({ send: 0.55 });
      noise(b, n, 1.0, 'highpass', 3500, 2500, 0.012);             // crack: shock wave off the shot column
      noise(b, n, 1.0, 'lowpass', 9000, 260, 0.45, 0.6, 0.0015);   // muzzle blast
      noise(b, n + 0.004, 0.6, 'bandpass', 1400, 500, 0.22, 0.9); // gas roar off the muzzle
      tone(b, n, 1.0, 120, 38, 0.24);                              // thump felt through the stock
      tone(b, n, 0.5, 62, 30, 0.38);
      const mech = bus({ pan: 0.25, send: 0.08, gain: 0.8 });
      if (semi) {
        clack(mech, n + 0.045, 2300, 0.5);      // bolt slams back, hull ejects
        clack(mech, n + 0.095, 1700, 0.55);     // bolt runs home on a new shell
        noise(bus({ pan: 0.5, send: 0.05, gain: 0.35, lp: 1800 }), n + 0.62, 0.4, 'bandpass', 900, 600, 0.05, 2); // hull lands in the grass
      } else clack(mech, n + 0.03, 3000, 0.15); // hammer settling
    },
    // Another hunter down the line: quieter, darker, from where they stand.
    distantShot(at) {
      const n = ac.currentTime, b = bus({ at, send: 0.8, gain: 0.9, lp: 3500 });
      noise(b, n, 1.0, 'lowpass', 6000, 250, 0.5, 0.6, 0.002); tone(b, n, 0.7, 110, 40, 0.3);
    },
    empty: () => clack(bus({ pan: 0.2, send: 0.05 }), ac.currentTime, 2600, 0.45), // hammer falls on nothing
    open: () => clack(bus({ send: 0.05, gain: 0.7 }), ac.currentTime, 1000, 0.5), // over-under breaks open
    // A shell pushed into the tube, or the double snapping shut on a fresh pair.
    load(semi) {
      const n = ac.currentTime, b = bus({ pan: -0.1, send: 0.05, gain: 0.7 });
      if (semi) { clack(b, n, 1500, 0.35); clack(b, n + 0.07, 2100, 0.3); }
      else { clack(b, n, 1200, 0.6); clack(b, n + 0.03, 2800, 0.35); }
    },
    thud(at) { const n = ac.currentTime, b = bus({ at, send: 0.1, gain: 1.4 }); tone(b, n, 0.6, 90, 40, 0.15); noise(b, n, 0.4, 'lowpass', 800, 200, 0.12); },
    // A real call from the recording, played from where the bird is, pitched a little per bird.
    quack(at, vol = 1) {
      if (voices >= 5 || ac.state !== 'running') return;
      const n = ac.currentTime, dst = bus({ at, send: 0.12, gain: vol * 1.6 });
      if (!calls) { synthQuack(dst, n); return; }
      const [a, len] = calls.cuts[Math.random() * calls.cuts.length | 0];
      const s = ac.createBufferSource(), g = ac.createGain();
      s.buffer = calls.b; s.playbackRate.value = rnd(0.97, 1.04); // natural speed; just enough variation that birds differ
      const dur = len / s.playbackRate.value;
      g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(1, n + 0.01);
      g.gain.setValueAtTime(1, n + dur - 0.04); g.gain.linearRampToValueAtTime(0, n + dur);
      s.connect(g).connect(dst); s.start(n, a, len); voices++; s.onended = () => voices--;
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
  let mow; // mow([x0, x1, z0, z1]) cuts the grass short inside the rectangle; mow(null) lets it grow back
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
    const N = TOUCH ? 16000 : 45000, grass = new THREE.InstancedMesh(geo, mat, N), gd = new Float32Array(N * 7);
    for (let i = 0; i < N; i++) {
      const r = 1.2 + 70 * Math.pow(Math.random(), 1.4), a = rnd(0, TAU);
      m.position.set(Math.cos(a) * r, 0, Math.sin(a) * r); m.rotation.set(rnd(-0.25, 0.25), rnd(0, Math.PI), rnd(-0.25, 0.25));
      m.scale.set(rnd(0.8, 1.8), rnd(0.35, 0.95), 1); m.updateMatrix(); grass.setMatrixAt(i, m.matrix);
      gd.set([m.position.x, m.position.z, m.rotation.x, m.rotation.y, m.rotation.z, m.scale.x, m.scale.y], i * 7);
      grass.setColorAt(i, col.setHSL(rnd(0.12, 0.24), rnd(0.3, 0.55), rnd(0.3, 0.5)));
    }
    scene.add(grass);
    mow = rect => {
      for (let i = 0; i < N; i++) {
        const o = i * 7, x = gd[o], z = gd[o + 1], cut = rect && x > rect[0] && x < rect[1] && z > rect[2] && z < rect[3];
        m.position.set(x, 0, z); m.rotation.set(gd[o + 2], gd[o + 3], gd[o + 4]); m.scale.set(gd[o + 5], cut ? 0.07 : gd[o + 6], 1);
        m.updateMatrix(); grass.setMatrixAt(i, m.matrix);
      }
      grass.instanceMatrix.needsUpdate = true;
    };
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
  const semiGun = new THREE.Group(), ouGun = new THREE.Group(); gun.add(semiGun, ouGun);
  { // Semi-auto in black synthetic: raised vent rib, textured forend, pistol grip, skeleton adjustable stock.
    const poly = new THREE.MeshStandardMaterial({ color: 0x1d1e20, roughness: 0.82, metalness: 0.05, envMapIntensity: 0.35 });
    const grip = new THREE.MeshStandardMaterial({ color: 0x131416, roughness: 0.95, metalness: 0, envMapIntensity: 0.2 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x0f1012, metalness: 0.85, roughness: 0.32, envMapIntensity: 0.6 });
    const steel = new THREE.MeshStandardMaterial({ color: 0x9a9da2, metalness: 0.9, roughness: 0.3 });
    const S = semiGun, tilt = (o, r) => { o.rotation.x = r; return o; };
    part(S, cylZ, blue, 0.0105, 0.0105, 0.68, 0, 0.018, -0.58);                // barrel
    part(S, cylZ, blue, 0.0118, 0.0118, 0.035, 0, 0.018, -0.905);              // extended choke tube
    part(S, box, blue, 0.0075, 0.0025, 0.7, 0, 0.0352, -0.565);                // stepped rib…
    for (let z = -0.25; z > -0.9; z -= 0.065) part(S, box, blue, 0.004, 0.006, 0.012, 0, 0.0315, z); // …on posts, open between
    part(S, cylZ, blue, 0.0105, 0.0105, 0.4, 0, -0.0085, -0.42);              // magazine tube
    part(S, cylZ, poly, 0.0135, 0.0135, 0.03, 0, -0.0085, -0.625);             // magazine cap
    part(S, cylZ, poly, 0.029, 0.031, 0.34, 0, 0.002, -0.33);                 // forend
    for (const x of [-1, 1]) part(S, box, grip, 0.003, 0.034, 0.24, x * 0.0295, -0.004, -0.33); // grip panels
    part(S, cylZ, poly, 0.0255, 0.0255, 0.02, 0, 0.002, -0.505);               // forend nose
    part(S, box, poly, 0.047, 0.05, 0.21, 0, 0.003, -0.06);                    // receiver
    part(S, cylZ, poly, 0.0235, 0.012, 0.21, 0, 0.026, -0.06);                 // rounded receiver top
    part(S, box, blue, 0.003, 0.02, 0.07, 0.0237, 0.012, -0.08);               // ejection port
    part(S, box, steel, 0.003, 0.012, 0.05, 0.0245, 0.012, -0.08);             // bolt face in the port
    part(S, cylZ, steel, 0.004, 0.004, 0.02, 0.031, 0.012, -0.098).rotation.y = Math.PI / 2; // cocking handle
    part(S, box, blue, 0.002, 0.008, 0.018, -0.0245, -0.006, -0.03);           // bolt release
    part(S, box, poly, 0.005, 0.004, 0.06, 0, -0.04, 0.005);                   // trigger guard: bottom bar
    tilt(part(S, box, poly, 0.005, 0.004, 0.035, 0, -0.03, -0.035), 0.75);     //   front leg
    tilt(part(S, box, steel, 0.004, 0.026, 0.004, 0, -0.03, 0.005), 0.25);     // trigger blade
    tilt(part(S, box, grip, 0.036, 0.1, 0.044, 0, -0.065, 0.085), -0.42);      // pistol grip
    part(S, box, poly, 0.04, 0.035, 0.2, 0, 0.0, 0.14);                        // stock wrist and comb
    part(S, box, poly, 0.034, 0.08, 0.09, 0, -0.05, 0.15);                     // solid web behind the grip
    tilt(part(S, box, poly, 0.036, 0.016, 0.16, 0, 0.022, 0.215), 0.02);       // adjustable cheek riser
    part(S, box, poly, 0.038, 0.03, 0.12, 0, -0.002, 0.29);                    // skeleton: upper beam
    tilt(part(S, box, poly, 0.034, 0.018, 0.24, 0, -0.103, 0.237), 0.04);      //   lower beam
    tilt(part(S, box, poly, 0.03, 0.012, 0.16, 0, -0.055, 0.265), -0.6);       //   cross strut
    part(S, box, grip, 0.045, 0.14, 0.03, 0, -0.05, 0.365);                    // recoil pad
    part(S, sph, beadM, 0.0032, 0.0032, 0.0032, 0, 0.0405, -0.91);             // fibre-optic bead
    addHands(S, [0, -0.0194, 0.0646, -0.42], [0, 0.002, -0.36]);
  }
  { // Over-under in grey laminate: stacked barrels with vented top and side ribs, black action, adjustable comb.
    const lam = new THREE.MeshStandardMaterial({ map: laminateTexture(), roughness: 0.45, metalness: 0, envMapIntensity: 0.5 });
    const blue = new THREE.MeshStandardMaterial({ color: 0x0d0e10, metalness: 0.85, roughness: 0.25, envMapIntensity: 0.7 });
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.95, roughness: 0.22 });
    const red = new THREE.MeshStandardMaterial({ color: 0xd8261c, emissive: 0x5a0a06, roughness: 0.4 });
    const green = new THREE.MeshStandardMaterial({ color: 0x2f8f3a, metalness: 0.6, roughness: 0.35 });
    const pad = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.95 });
    const O = ouGun, tilt = (o, r) => { o.rotation.x = r; return o; };
    for (const y of OU_BARRELS) {
      part(O, cylZ, blue, 0.0115, 0.0115, 0.68, 0, y, -0.58);                 // barrel
      part(O, cylZ, steel, 0.0124, 0.0124, 0.02, 0, y, -0.925);               // extended choke
      part(O, cylZ, green, 0.0126, 0.0126, 0.005, 0, y, -0.912);              //   choke band
    }
    for (let z = -0.27; z > -0.9; z -= 0.065) part(O, box, blue, 0.021, 0.006, 0.048, 0, 0.0063, z); // vented side ribs
    part(O, box, blue, 0.008, 0.0025, 0.7, 0, 0.0335, -0.565);                // top rib…
    for (let z = -0.25; z > -0.9; z -= 0.065) part(O, box, blue, 0.004, 0.005, 0.012, 0, 0.031, z); // …on posts
    part(O, box, blue, 0.043, 0.058, 0.125, 0, 0.004, -0.1);                  // action
    for (const x of [-1, 1]) {
      part(O, box, red, 0.0015, 0.005, 0.016, x * 0.0219, 0.017, -0.125);   // red badge
      tilt(part(O, box, steel, 0.0012, 0.0015, 0.06, x * 0.0219, -0.004, -0.09), -0.55); // engraved line
    }
    part(O, box, steel, 0.012, 0.006, 0.028, 0.004, 0.034, -0.04);           // top lever
    part(O, box, lam, 0.05, 0.044, 0.27, 0, -0.012, -0.3);                    // forend
    part(O, cylZ, lam, 0.025, 0.022, 0.27, 0, -0.016, -0.3);                  // rounded forend belly
    part(O, torus, blue, 0.02, 0.02, 0.02, 0, -0.032, -0.03);                 // round trigger guard
    tilt(part(O, box, steel, 0.004, 0.024, 0.004, 0, -0.03, -0.03), 0.25);    // single trigger
    tilt(part(O, box, lam, 0.036, 0.1, 0.044, 0, -0.065, 0.085), -0.42);      // pistol grip
    part(O, box, lam, 0.038, 0.035, 0.2, 0, 0.0, 0.14);                        // wrist and comb line
    tilt(part(O, box, lam, 0.036, 0.11, 0.24, 0, -0.06, 0.245), 0.06);       // stock body
    part(O, box, lam, 0.034, 0.014, 0.17, 0, 0.024, 0.225);                    // adjustable comb
    part(O, box, pad, 0.042, 0.15, 0.025, 0, -0.05, 0.372);                    // recoil pad
    part(O, sph, beadM, 0.0032, 0.0032, 0.0032, 0, 0.038, -0.91);              // bead
    addHands(O, [0, -0.0194, 0.0646, -0.42], [0, -0.008, -0.31], 0.88);
  }
  const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false }));
  flash.scale.setScalar(0.4); flash.position.set(0, 0.018, -0.98); gun.add(flash);
  const flashL = new THREE.PointLight(0xffc070, 0, 30); flashL.position.copy(flash.position); gun.add(flashL);
  const hull = part(camera, cylZ, new THREE.MeshLambertMaterial({ color: 0xb3261e }), 0.01, 0.01, 0.06, 0, 0, 0);
  const hullV = new THREE.Vector3(); let hullT = 0;
  const fMat = new THREE.PointsMaterial({ color: 0xe8e2d4, size: 0.07, transparent: true, opacity: 0.9 });

  // Other hunters in the room: a simple figure that turns and raises the gun as they look around.
  const HM = { jacket: L(0x4b5a36), pants: L(0x3b3a30), skin: L(0xc99a76), cap: L(0xc0621c) };
  const flashMat = flash.material;
  function makeHunter(name) {
    const g = new THREE.Group(), arms = new THREE.Group();
    part(g, box, HM.pants, 0.3, 0.8, 0.22, 0, 0.4, 0);
    part(g, box, HM.jacket, 0.44, 0.62, 0.27, 0, 1.11, 0);
    part(g, sph, HM.skin, 0.1, 0.12, 0.1, 0, 1.56, 0);
    part(g, box, HM.cap, 0.21, 0.07, 0.23, 0, 1.66, 0.01);
    part(g, box, HM.cap, 0.19, 0.015, 0.1, 0, 1.63, -0.14);
    arms.position.set(0.1, 1.4, -0.05); g.add(arms);
    part(arms, box, HM.jacket, 0.1, 0.1, 0.42, -0.06, -0.06, -0.2);
    part(arms, box, metal, 0.035, 0.04, 1.05, 0, 0, -0.45);
    part(arms, box, wood, 0.045, 0.07, 0.3, 0, -0.03, 0.12);
    const fl = new THREE.Sprite(flashMat); fl.scale.setScalar(0.9); fl.position.set(0, 0, -1.02); fl.visible = false; arms.add(fl);
    const tag = labelSprite([name]); tag.position.y = 2.05; g.add(tag);
    return { g, arms, fl, flT: 0, yaw: 0, pitch: 0, shots: 0 };
  }
  const peers = new Map();
  const clearPeers = () => { peers.forEach(h => scene.remove(h.g)); peers.clear(); };

  let audio, raf, last = performance.now(), T = 0, state = 'menu', paused = false, locked = false;
  let yaw = 0, pitch = 0.16, kick = 0, recoil = 0, flashT = 0, spawnT = 1, aim = false, ads = 0, brk = 0, W = WEAPONS.semi;
  // mp: { seed, startAt (local ms), slot, count } while hunting in a room. R drives flights: seeded in a room.
  let mp = null, R = Math.random, elapsed = 0, nextSpawn = 0, duckSeq = 0, poseT = 0;
  const rr = (a, b) => a + R() * (b - a);
  const UP = new THREE.Vector3(0, 1, 0);
  let timeLeft = GAME_TIME, score = 0, bag = 0, shots = 0, shells = W.mag, reloading = false, reloadT = 0, nextShot = 0, lastKill = -9, lastSec = 0;
  const ducks = [], pellets = [], bursts = [];
  // Who bagged which bird ('me' or another hunter's id), and whether it was a drake, for laying out the bag.
  const killLog = new Map(), drakeOf = new Map();
  const rel = new THREE.Vector3(), rv = new THREE.Vector3(), tmp = new THREE.Vector3();
  const hud = () => cb.onHud({ score, ducks: bag, shells, mag: W.mag, reloading, aiming: aim, time: Math.ceil(timeLeft) });

  // lag: seconds this flight is late (tab was hidden), so it appears where it would be by now.
  function spawn(lag = 0) {
    const speed = rr(13, 27), n = R() < 0.4 ? 1 : 2 + (R() * 4 | 0);
    const p = new THREE.Vector3(), v = new THREE.Vector3();
    if (R() < 0.72) { // crossing shot
      const side = R() < 0.5 ? 1 : -1;
      p.set(-side * 120, rr(5, 20), -rr(14, 50)); v.set(side, rr(-0.03, 0.03), rr(-0.1, 0.1));
    } else {          // incoming, passing overhead
      p.set(rr(-70, 70), rr(10, 24), -170); v.set(rr(-25, 25) - p.x, 0, 190);
    }
    // Birds can come from any side; most favour where the hunter faces (in a room: the way the line faces).
    const turn = R() < 0.6 ? (mp ? 0 : yaw) + rr(-1.5, 1.5) : rr(0, TAU);
    p.applyAxisAngle(UP, turn); v.applyAxisAngle(UP, turn);
    v.normalize(); const lat = new THREE.Vector3(-v.z, 0, v.x);
    for (let i = 0; i < n; i++) { // V formation
      const d = makeDuck(R() < 0.6), k = Math.ceil(i / 2);
      d.g.position.copy(p).addScaledVector(v, -k * 1.6).addScaledVector(lat, (i % 2 ? 1 : -1) * k * 1.2); d.g.position.y += rr(-0.4, 0.4);
      Object.assign(d, { id: duckSeq++, vel: v.clone().multiplyScalar(speed), alive: true, down: false, ph: rr(0, 6), hz: 5 + speed * 0.14, life: 0, wob: rr(0, 6), spin: 0 });
      d.g.position.addScaledVector(d.vel, lag); drakeOf.set(d.id, d.drake);
      scene.add(d.g); ducks.push(d);
    }
    if (state === 'play') audio?.quack(ducks[ducks.length - 1].g.position, rnd(0.7, 1));
  }

  function burst(p) {
    const n = 26, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([p.x, p.y, p.z], i * 3); vel.push(new THREE.Vector3(rnd(-1, 1), rnd(-0.5, 1.5), rnd(-1, 1)).multiplyScalar(rnd(0.5, 3))); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, fMat); pts.frustumCulled = false; scene.add(pts); bursts.push({ pts, vel, life: 2.2 });
  }

  function drop(d) {
    d.alive = false; d.life = 0; d.spin = rnd(4, 9); d.vel.multiplyScalar(0.85);
    for (const [a, b] of d.wings) { a.rotation.z = 1.1; b.rotation.z = -0.5; }
    burst(d.g.position);
  }
  function kill(d, range) {
    const speed = d.vel.length(), dbl = T - lastKill < 1.5; lastKill = T;
    const pts = Math.round((40 + range * 2 + speed * 3) * (dbl ? 2 : 1)); score += pts; bag++;
    drop(d); cb.onMsg(`${dbl ? 'DOUBLE!  ' : ''}+${pts}  ·  ${range | 0} m`); hud();
    killLog.set(d.id, 'me');
    cb.onKill?.(d.id, pts); // in a room: claim the bird (first claim wins)
  }

  function fire() {
    if (T < nextShot || elapsed < 0 || (reloading && !W.single)) return; // countdown, or a broken-open double
    if (shells <= 0) { audio.empty(); wantReload(); return; }
    reloading = false; reloadT = 0; shells--; shots++; nextShot = T + W.interval; recoil = 1; flashT = 0.05;
    if (!W.single) flash.position.y = flashL.position.y = OU_BARRELS[shells === 1 ? 0 : 1]; // bottom barrel first, then top
    audio.shot(W.single);
    pellets.push({ pos: camera.position.clone(), dir: camera.getWorldDirection(new THREE.Vector3()), dist: 0, hit: false, miss: 1e9, hint: '' });
    kick = 1;
    for (const d of ducks) if (d.alive) d.vel.y += rnd(0.3, 1.6); // birds flare at the shot
    if (W.single) { hull.position.set(0.14, -0.11, -0.4); hullV.set(1.5, 1.2, 0.2); hullT = 0.5; }
    hud(); if (mp) cb.onPose?.({ yaw, pitch, shots });
  }

  /* ---------- the bag, laid out on the grass after the hunt ---------- */
  const bagGroup = new THREE.Group(); scene.add(bagGroup);
  let bagView = null, mown = false;
  function clearBag() {
    bagGroup.traverse(o => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
    bagGroup.clear(); bagView = null;
    if (mown) { mow(null); mown = false; }
  }
  // list: [{ by: 'me' | hunter id, name, sub, slot, count, winner }]. Each hunter's birds go in rows in front of
  // where they stood, heads away, wings folded, in the order they were shot.
  function layBag(list) {
    clearBag();
    const birdsOf = {};
    for (const [id, by] of killLog) (birdsOf[by] ||= []).push(drakeOf.get(id) ?? true);
    const COLS = 6, DX = 0.46, DZ = 0.9, FRONT = -2.4;
    let x0 = Infinity, x1 = -Infinity, depth = DZ;
    for (const e of list) {
      const birds = birdsOf[e.by] || [], cx = slotX(e.slot, e.count), rows = Math.max(1, Math.ceil(birds.length / COLS));
      birds.forEach((drake, i) => {
        const r = i / COLS | 0, inRow = Math.min(COLS, birds.length - r * COLS);
        const d = makeDuck(drake);
        for (const [a, b] of d.wings) { a.rotation.set(0, 1.35, 0); b.rotation.set(0, 0.2, 0); }
        d.g.position.set(cx + (i % COLS - (inRow - 1) / 2) * DX + rnd(-0.03, 0.03), 0.12, FRONT - r * DZ + rnd(-0.05, 0.05));
        d.g.rotation.set(0, Math.PI + rnd(-0.08, 0.08), rnd(-0.35, 0.35));
        bagGroup.add(d.g);
      });
      const lines = e.name ? [e.name, e.sub || ''] : birds.length ? [] : ['No birds this time'];
      if (lines.length) {
        const tag = labelSprite(lines.filter(Boolean), e.winner ? '#ffd76a' : '#f1e8d0', e.count > 1 ? 2.2 : 1.6);
        tag.position.set(cx, 0.75, FRONT - rows * DZ - 0.2); bagGroup.add(tag);
      }
      x0 = Math.min(x0, cx - COLS * DX / 2); x1 = Math.max(x1, cx + COLS * DX / 2); depth = Math.max(depth, rows * DZ);
    }
    mow([x0 - 1.5, x1 + 1.5, FRONT - depth - 2, 0.6]); mown = true;
    const span = x1 - x0;
    bagView = { cx: (x0 + x1) / 2, zc: FRONT - depth / 2 + 0.6, h: 1.7 + depth * 0.45 + span * 0.3, z: -0.6 + span * 0.35, span };
  }

  function step(dt) {
    T += dt; uTime.value = T;
    recoil = Math.max(0, recoil - dt * 6); kick = Math.max(0, kick - dt * 4); flashT -= dt;
    if (state === 'play') {
      // In a room the clock is shared wall time, so every hunter's round starts and ends together.
      elapsed = mp ? (Date.now() - mp.startAt) / 1000 : elapsed + dt;
      timeLeft = GAME_TIME - elapsed;
      if (timeLeft <= 0) {
        timeLeft = 0; state = 'over'; locked = false; document.exitPointerLock?.();
        mp = null; R = Math.random; clearPeers();
        cb.onEnd({ score, ducks: bag, shots }); // the game then calls showBag() to lay the birds out
      } else {
        if (reloading && shells < W.mag && (reloadT += dt) > W.reload) {
          reloadT = 0; shells = W.single ? shells + 1 : W.mag; audio.load(W.single); if (shells === W.mag) reloading = false; hud();
        }
        const sec = Math.ceil(timeLeft); if (sec !== lastSec) { lastSec = sec; hud(); }
        // Flight schedule runs off the round clock (seeded in a room), so it is identical for every player.
        while (elapsed >= nextSpawn) {
          const lag = elapsed - nextSpawn; spawn(lag);
          nextSpawn += (rr(1.6, 3.6) - 1.2 * Math.min(1, nextSpawn / GAME_TIME)) / (mp ? 1 + 0.25 * (mp.count - 1) : 1);
        }
        if (mp && (poseT -= dt) <= 0) { poseT = 0.5; cb.onPose?.({ yaw, pitch, shots }); }
      }
    } else {
      if (state === 'menu') { yaw = Math.sin(T * 0.12) * 0.35; pitch = 0.16; }
      if (bagView) { // standing over the bag, drifting slowly from side to side; further back on tall screens
        const v = bagView, fit = Math.max(1, 1.4 / camera.aspect);
        camera.position.set(v.cx + Math.sin(T * 0.15) * (0.5 + v.span * 0.06), v.h * fit, v.zc + (v.z - v.zc) * fit);
        camera.lookAt(v.cx, 0, v.zc);
      }
      if ((spawnT -= dt) <= 0) { spawn(); spawnT = rnd(2.5, 5); }
    }
    for (const h of peers.values()) {
      const k = Math.min(1, dt * 6);
      h.g.rotation.y += (h.yaw - h.g.rotation.y) * k; h.arms.rotation.x += (h.pitch - h.arms.rotation.x) * k;
      h.fl.visible = (h.flT -= dt) > 0;
    }

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
        if (state === 'play' && Math.random() < dt * 0.05) audio?.quack(p, rnd(0.5, 0.9)); // the flock keeps talking
        gone = Math.hypot(p.x, p.z) > 200;
      } else if (!d.down) {
        d.vel.y -= 9.8 * dt; d.vel.multiplyScalar(1 - 0.5 * dt); p.addScaledVector(d.vel, dt);
        g.rotateX(d.spin * dt); g.rotateZ(d.spin * 0.6 * dt);
        const h = groundH(p.x, p.z) + 0.12;
        if (p.y < h) { d.down = true; d.life = 0; p.y = h; g.rotation.set(0, rnd(0, 6), 1.4); audio?.thud(p); }
      } else gone = d.life > 8;
      if (gone) { scene.remove(g); ducks.splice(i, 1); }
    }

    for (let i = bursts.length - 1; i >= 0; i--) {
      const b = bursts[i], a = b.pts.geometry.attributes.position;
      b.vel.forEach((v, j) => { v.multiplyScalar(1 - 2 * dt); v.y -= 1.2 * dt; a.setXYZ(j, a.getX(j) + v.x * dt, a.getY(j) + v.y * dt, a.getZ(j) + v.z * dt); });
      a.needsUpdate = true;
      if ((b.life -= dt) <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); bursts.splice(i, 1); }
    }

    if (!bagView) camera.rotation.set(pitch + kick * 0.03, yaw, 0);
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
    if (!paused || mp) step(dt); // a room's hunt keeps running while one player sits in the pause menu
    audio?.listen(camera);
    renderer.render(scene, camera);
  }

  const live = () => state === 'play' && !paused;
  const wantReload = () => { if (shells < W.mag && !reloading) { reloading = true; if (!W.single) audio?.open(); hud(); } };
  const setAim = v => { if (aim !== v) { aim = v; hud(); } };
  const look = (dx, dy, s) => { // full 360° turn; slower while aiming
    if (!live()) return;
    const k = s * camera.fov / 55;
    yaw -= dx * k; pitch = clamp(pitch - dy * k, -0.2, 1.45);
  };
  // Mouse-look only while the pointer is captured; a free cursor sliding over the page must not steer the gun.
  // Chrome (notably on Windows) occasionally reports one bogus jump of hundreds of px under pointer lock, which
  // yanks the view off the bird. A hand never produces a single event that dwarfs the recent motion, so such an
  // outlier is dropped; if big moves keep coming it is a real fast swing and goes through.
  let moveAvg = 0, dropped = 0;
  const onMove = e => {
    if (!locked) return;
    const dx = e.movementX, dy = e.movementY, m = Math.hypot(dx, dy);
    if (m > 150 && m > 5 * moveAvg + 60 && dropped < 2) { dropped++; return; }
    dropped = 0; moveAvg = moveAvg * 0.7 + m * 0.3;
    look(dx, dy, 0.0016);
  };
  const onDown = e => {
    if (!live() || e.target !== canvas) return;
    if (!TOUCH && !locked) { lock(); return; } // a room's round starts without a click, so the first click grabs the mouse
    if (e.button === 0) fire(); else if (e.button === 2) setAim(true);
  };
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
  // Desktop grabs the mouse. Phones play in landscape; fullscreen there is the player's choice (the app's toggle).
  const lock = () => {
    try {
      if (TOUCH) return;
      // Raw mouse input: no OS acceleration and none of the movement spikes that come with it. Falls back where unsupported.
      canvas.requestPointerLock({ unadjustedMovement: true })?.catch?.(() => canvas.requestPointerLock()?.catch?.(() => {}));
    } catch { /* falls back to unlocked mouse / windowed play */ }
  };
  const act = { passive: false };
  const events = [[document, 'mousemove', onMove], [document, 'mousedown', onDown], [document, 'mouseup', onUp], [document, 'keydown', onKey],
    [document, 'contextmenu', onMenu], [document, 'pointerlockchange', onLock], [document, 'visibilitychange', onHide], [window, 'resize', onResize],
    [canvas, 'touchstart', onTS, act], [canvas, 'touchmove', onTM, act], [canvas, 'touchend', onTE], [canvas, 'touchcancel', onTE]];
  events.forEach(([t, n, f, o]) => t.addEventListener(n, f, o));
  onResize(); raf = requestAnimationFrame(frame);

  return {
    // room (optional): { seed, startAt: local ms when the round begins, slot, count }.
    start(weapon, room) {
      audio ||= makeAudio(); audio.resume();
      W = WEAPONS[weapon] || WEAPONS.semi; semiGun.visible = W.single; ouGun.visible = !W.single;
      flash.position.y = flashL.position.y = 0.018; brk = 0;
      ducks.forEach(d => scene.remove(d.g)); ducks.length = pellets.length = 0; clearPeers(); clearBag(); killLog.clear(); drakeOf.clear();
      mp = room || null; R = mp ? mulberry(mp.seed) : Math.random; duckSeq = 0;
      elapsed = mp ? (Date.now() - mp.startAt) / 1000 : 0; nextSpawn = 1.5; timeLeft = GAME_TIME - elapsed; lastSec = 0;
      camera.position.set(mp ? slotX(mp.slot, mp.count) : 0, EYE, 0);
      score = bag = shots = 0; shells = W.mag; reloading = false; reloadT = 0; nextShot = 0; lastKill = -9;
      yaw = 0; pitch = 0.2; aim = false; paused = false; state = 'play'; hud(); lock();
    },
    // Abandon the hunt (no score posted) and go back to the drifting menu view.
    quit() {
      state = 'menu'; paused = false; aim = false; reloading = false; locked = false; document.exitPointerLock?.();
      mp = null; R = Math.random; camera.position.set(0, EYE, 0); clearPeers(); clearBag();
      ducks.forEach(d => scene.remove(d.g)); ducks.length = pellets.length = 0;
    },
    // After the round: lay out each hunter's birds on the grass and look down on them. See layBag().
    showBag: list => { if (state === 'over') layBag(list); },
    unlockAudio() { audio ||= makeAudio(); audio.resume(); }, // call from a click so a room's start has sound
    // Another hunter (by) claimed this bird first: it falls here too and goes in their bag.
    remoteKill(id, by) { killLog.set(id, by); const d = ducks.find(x => x.id === id && x.alive); if (d) drop(d); },
    // Our claim lost the race: take the points back.
    revokeKill(pts) { score = Math.max(0, score - pts); bag = Math.max(0, bag - 1); hud(); },
    // list: [{ id, name, slot, yaw, pitch, shots }] for the other hunters in the round.
    setPeers(list) {
      if (!mp) return;
      const seen = new Set();
      for (const p of list) {
        seen.add(p.id);
        let h = peers.get(p.id);
        if (!h) { h = makeHunter(p.name); h.shots = p.shots || 0; h.g.position.set(slotX(p.slot, mp.count), 0, 0); scene.add(h.g); peers.set(p.id, h); }
        h.yaw = p.yaw || 0; h.pitch = clamp(p.pitch || 0, -0.2, 1.45);
        if ((p.shots || 0) > h.shots) { h.flT = 0.06; audio?.distantShot(tmp.copy(h.g.position).setY(EYE)); }
        h.shots = p.shots || 0;
      }
      for (const [id, h] of peers) if (!seen.has(id)) { scene.remove(h.g); peers.delete(id); }
    },
    resume() { paused = false; lock(); },
    pause,
    fire: () => { if (live()) fire(); },
    reload: () => { if (live()) wantReload(); },
    toggleAim: () => { if (live()) setAim(!aim); },
    dispose() { cancelAnimationFrame(raf); events.forEach(([t, n, f]) => t.removeEventListener(n, f)); renderer.dispose(); },
  };
}
