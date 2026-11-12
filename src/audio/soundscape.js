// The soundscape. Recorded mallard, chaffinch and thrush calls are cut into single calls at load time; the guns
// are the recorded reports with synthesised weight and action noise (fully synthesised if a recording fails),
// sent through an outdoor reverb. Everything positional goes through HRTF panners, with the listener on the camera.
import * as THREE from 'three';
import { rnd } from '../core/math.js';
import duckSoundUrl from '../assets/audio/duck_sound.mp3';
import finchSoundUrl from '../assets/audio/fringello_calls.mp3';   // 24 song phrases cut from art-source/audio/fringello_sound.mp3
import thrushSoundUrl from '../assets/audio/thrush_calls.mp3';     // 24 song phrases cut from art-source/audio/thrush_sound.mp3
import semiShotUrl from '../assets/audio/semi_shot.wav';           // one clean shot cut from a semi-automatic recording
import ouShotUrl from '../assets/audio/over_under_shot.wav';      // one clean shot cut from art-source/audio/'SHOTGUN over under.mp3'

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

// Must be created from a user gesture (browsers keep audio suspended until one).
export function createAudio(volume = 1) {
  const ac = new (window.AudioContext || window.webkitAudioContext)();
  // Brick-wall limiter so stacked shots and calls never clip.
  const out = ac.createDynamicsCompressor();
  Object.entries({ threshold: -8, knee: 0, ratio: 20, attack: 0.002, release: 0.2 }).forEach(([k, v]) => { out[k].value = v; });
  const master = ac.createGain(); master.gain.value = volume; out.connect(master).connect(ac.destination);

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

  // Recordings, each decoded once. Bird recordings are split into single calls; any that fails to load falls
  // back to the synthesised sound below.
  const rec = {};
  const load = (key, url, split) => fetch(url).then(r => r.arrayBuffer()).then(b => ac.decodeAudioData(b))
    .then(b => { rec[key] = { b, cuts: split ? findCalls(b) : null }; })
    .catch(e => console.warn(key + ' recording unavailable, using the synthesised sound', e));
  load('duck', duckSoundUrl, true); load('finch', finchSoundUrl, true); load('thrush', thrushSoundUrl, true); load('shot', semiShotUrl, false); load('ouShot', ouShotUrl, false);
  let voices = 0;
  // One random call from a recording, pitched a little per bird.
  const playCall = (key, dst, n) => {
    const { b, cuts } = rec[key], [a, len] = cuts[Math.random() * cuts.length | 0];
    const src = ac.createBufferSource(), g = ac.createGain();
    src.buffer = b; src.playbackRate.value = rnd(0.97, 1.04); // natural speed; just enough variation that birds differ
    const dur = len / src.playbackRate.value;
    g.gain.setValueAtTime(0, n); g.gain.linearRampToValueAtTime(1, n + 0.01);
    g.gain.setValueAtTime(1, n + dur - 0.04); g.gain.linearRampToValueAtTime(0, n + dur);
    src.connect(g).connect(dst); src.start(n, a, len); voices++; src.onended = () => voices--;
  };
  const playBuffer = (key, dst, n, rate = 1) => {
    const src = ac.createBufferSource(); src.buffer = rec[key].b; src.playbackRate.value = rate; src.connect(dst); src.start(n);
  };
  const synthQuack = (dst, n) => {
    const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1150; f.Q.value = 5; f.connect(dst);
    for (let i = 0, c = 2 + (Math.random() * 3 | 0); i < c; i++) {
      const len = 0.13 - i * 0.015; tone(f, n, 1, 560 - i * 25, 360, len, 'sawtooth'); n += len + 0.05;
    }
  };
  // Synthesised report, used only if a gun's recording is unavailable.
  const synthShot = n => {
    const b = bus({ send: 0.55 });
    noise(b, n, 1.0, 'highpass', 3500, 2500, 0.012);             // crack: shock wave off the shot column
    noise(b, n, 1.0, 'lowpass', 9000, 260, 0.45, 0.6, 0.0015);   // muzzle blast
    noise(b, n + 0.004, 0.6, 'bandpass', 1400, 500, 0.22, 0.9); // gas roar off the muzzle
    tone(b, n, 1.0, 120, 38, 0.24);                              // thump felt through the stock
    tone(b, n, 0.5, 62, 30, 0.38);
  };
  const lp = new THREE.Vector3(), lf = new THREE.Vector3();

  return {
    resume: () => ac.resume(),
    setVolume(v) { master.gain.setTargetAtTime(v, ac.currentTime, 0.05); },
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
      const n = ac.currentTime;
      const key = semi ? 'shot' : 'ouShot';
      if (rec[key]) {                                              // the recorded gun, with a little extra weight underneath
        playBuffer(key, bus({ send: 0.22 }), n, rnd(0.98, 1.02));
        tone(bus({ send: 0, gain: 0.55 }), n, 1.0, 85, 34, 0.26);
      } else synthShot(n);
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
      if (rec.shot) playBuffer('shot', b, n, rnd(0.96, 1.02)); // the same report, darker and from where they stand
      else { noise(b, n, 1.0, 'lowpass', 6000, 250, 0.5, 0.6, 0.002); tone(b, n, 0.7, 110, 40, 0.3); }
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
    // Chaffinch flight call: a bright, quick "pink", sometimes doubled.
    chirp(at, vol = 1) { // a phrase from the chaffinch recording, else a synthesised "pink"
      if (voices >= 5 || ac.state !== 'running') return;
      const n = ac.currentTime;
      if (rec.finch) { playCall('finch', bus({ at, send: 0.15, gain: vol * 1.3 }), n); return; }
      const b = bus({ at, send: 0.15, gain: vol * 0.5 });
      for (let i = 0, c = Math.random() < 0.5 ? 1 : 2; i < c; i++) {
        const t = n + i * 0.11, f = rnd(4600, 5400);
        tone(b, t, 0.8, f, f * 0.82, 0.045); tone(b, t, 0.25, f * 2, f * 1.6, 0.03);
      }
    },
    // Song thrush flight call: a thin, high "tsip".
    tsip(at, vol = 1) { // a phrase from the thrush recording, else a synthesised "tsip"
      if (voices >= 5 || ac.state !== 'running') return;
      const n = ac.currentTime;
      if (rec.thrush) { playCall('thrush', bus({ at, send: 0.2, gain: vol * 1.3 }), n); return; }
      const b = bus({ at, send: 0.2, gain: vol * 0.45 }), f = rnd(7000, 7800);
      tone(b, n, 0.8, f, f * 0.9, 0.05); tone(b, n + 0.004, 0.2, f * 1.5, f * 1.3, 0.035);
    },
    // A real call from the recording, played from where the bird is, pitched a little per bird.
    quack(at, vol = 1) {
      if (voices >= 5 || ac.state !== 'running') return;
      const n = ac.currentTime, dst = bus({ at, send: 0.12, gain: vol * 1.6 });
      if (rec.duck) playCall('duck', dst, n); else synthQuack(dst, n);
    },
  };
}
