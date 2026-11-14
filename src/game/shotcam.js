// Shotcam: a camera on the barrel, like a ShotKam. While the player has it on (Settings), the last few seconds of the
// hunt are kept as video, and after a kill the 5 s around it can be saved: the plain picture in portrait (9:16), the gun
// out of view, one small red dot where the barrel points, jolting with the recoil.
//
// Built not to cost the game a frame:
// - The world is drawn once. The frame is drawn in two passes, the world and then the gun in hand on top (the usual
//   first-person "viewmodel" pass, which also keeps the barrel out of the reeds), and the shotcam cuts its strip out of
//   the world pass before the gun goes on. No second render of the scene.
// - The strip is copied GPU-side into a small canvas and handed to the browser's video encoder (WebCodecs, hardware
//   where there is one), which works off the main thread. Nothing is read back to the CPU while you play.
// - The encoded frames are kept as they come; saving only wraps the right seconds in a WebM file (core/webm.js), so it
//   is instant and needs no re-encode.
import { muxWebM } from '../core/webm.js';

const FPS = 30, W = 540, H = 960, BEFORE = 3.5, AFTER = 1.5, KEEP = BEFORE + AFTER + 1.5; // s; KEEP covers a GOP's slack
const GOP = FPS; // a key frame every second, so a clip can start within a second of where it should
const MAX_BYTES = 5 * 1024 * 1024; // a clip never takes more than 5 MB on disk
const BITRATE = 4.5e6; // ~3.5 MB for the longest clip (a GOP's slack + 5 s), comfortably under the cap
const U = W / 324; // drawing sizes below were tuned at 324 px wide
const KICK = [16, 11, 7, 4, 2, 1].map(px => px * U); // how far the picture jumps on each frame after a shot (the muzzle rising)
const GUN_LAYER = 1;

// The first codec this browser can encode at this size: VP9, else VP8 (both play in WebM everywhere).
const CODECS = [['vp9', 'vp09.00.10.08'], ['vp8', 'vp8']];
const supported = typeof VideoEncoder === 'undefined' ? Promise.resolve(null) : (async () => {
  for (const [name, codec] of CODECS) {
    const config = { codec, width: W, height: H, bitrate: BITRATE, framerate: FPS, latencyMode: 'realtime' };
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return { name, config }; } catch { /* next */ }
  }
  return null;
})();

// renderer/scene/camera: the game's. rig: the gun in hand (drawn in its own pass while the shotcam is on).
export function createShotcam(renderer, scene, camera, rig) {
  const strip = Object.assign(document.createElement('canvas'), { width: W, height: H });
  const sg = strip.getContext('2d', { alpha: false });
  let on = false, encoder = null, codec = null, frames = []; // frames: { data, ts (µs), key }
  let acc = 0, now = 0, count = 0, kick = -1, dir = null;
  let clip = null; // the clip being waited for: { killT, resolve }
  let ready = null; // the latest clip: Promise<Blob | null>

  // The gun and everything on it on its own layer; lights on every layer, so both passes are lit alike.
  const lightAll = () => scene.traverse(o => { if (o.isLight) o.layers.enableAll(); });
  const gunLayer = l => rig.traverse(o => { if (o.isLight) o.layers.enableAll(); else o.layers.set(l); });

  async function start() {
    const s = await supported;
    if (!s || !on || encoder) return;
    codec = s.name;
    encoder = new VideoEncoder({
      output: chunk => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); frames.push({ data, ts: chunk.timestamp, key: chunk.type === 'key' }); },
      error: () => { encoder = null; }, // a lost encoder (GPU reset): the shotcam just stops filming
    });
    encoder.configure(s.config);
    count = 0;
  }
  function stop() {
    try { encoder?.close(); } catch { /* already closed */ }
    encoder = null; frames = []; clip?.resolve(null); clip = null; ready = null;
  }

  // Keep whole GOPs back to a key frame at or before KEEP seconds ago.
  function trim() {
    const cut = (now - KEEP) * 1e6;
    let k = -1; for (let i = 0; i < frames.length && frames[i].ts <= cut; i++) if (frames[i].key) k = i;
    if (k > 0) frames.splice(0, k);
  }

  // Into the strip: the middle 9:16 of the world pass (whatever field of view the player has), the recoil jolt, the dot.
  function grab() {
    const src = renderer.domElement, sh = src.height, sw = sh * W / H, k = kick >= 0 ? KICK[kick] : 0, s = 1 + k / U * 0.004;
    if (!src.width || !sh) return;
    sg.drawImage(src, (src.width - sw) / 2, 0, sw, sh, (W - W * s) / 2 + (k ? (Math.random() - 0.5) * k * 0.4 : 0), (H - H * s) / 2 + k, W * s, H * s);
    kick = kick >= 0 && kick < KICK.length - 1 ? kick + 1 : -1;
    const cx = W / 2, cy = H / 2;
    sg.fillStyle = 'rgba(255,30,30,0.35)'; sg.beginPath(); sg.arc(cx, cy, 6.5 * U, 0, Math.PI * 2); sg.fill();
    sg.fillStyle = '#ff1a1a'; sg.beginPath(); sg.arc(cx, cy, 4 * U, 0, Math.PI * 2); sg.fill();
    const frame = new VideoFrame(strip, { timestamp: Math.round(now * 1e6) });
    encoder.encode(frame, { keyFrame: count++ % GOP === 0 }); frame.close();
  }

  function finish() {
    const { killT, resolve } = clip; clip = null;
    const from = (killT - BEFORE) * 1e6, to = (killT + AFTER) * 1e6;
    let i = 0; for (let j = 0; j < frames.length && frames[j].ts <= from; j++) if (frames[j].key) i = j; // last key frame before the clip
    let picked = frames.slice(i).filter(f => f.ts <= to);
    while (picked.length && !picked[0].key) picked.shift();
    let blob = picked.length > 1 ? muxWebM(picked, { codec, width: W, height: H }) : null;
    while (blob && blob.size > MAX_BYTES) { // over the cap (it should not be): start a GOP later
      const next = picked.findIndex((f, n) => n > 0 && f.key);
      if (next < 0) { blob = null; break; }
      picked = picked.slice(next); blob = muxWebM(picked, { codec, width: W, height: H });
    }
    resolve(blob);
  }

  // Draws the frame (in place of renderer.render while the shotcam is on). filming: during a hunt.
  function render(dt, filming) {
    now += dt; acc += dt;
    gunLayer(GUN_LAYER); // cheap (a few dozen objects), and catches parts added since (a gun model arriving)
    camera.layers.set(0); renderer.render(scene, camera); // the world
    if (filming && encoder && acc >= 1 / FPS) {
      acc = 0;
      if (encoder.encodeQueueSize <= 2) grab(); // a busy encoder drops a frame rather than queueing up behind the game
    }
    if (clip && (now >= clip.killT + AFTER || !filming)) finish();
    trim();
    // The gun on top: fresh depth, no sky or shadow redraw.
    const bg = scene.background, shadows = renderer.shadowMap.autoUpdate;
    scene.background = null; renderer.autoClear = false; renderer.shadowMap.autoUpdate = false;
    renderer.clearDepth(); camera.layers.set(GUN_LAYER); renderer.render(scene, camera);
    camera.layers.set(0); renderer.autoClear = true; renderer.shadowMap.autoUpdate = shadows; scene.background = bg;
  }

  async function store(blob) {
    const name = `shotcam-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`;
    if (dir) {
      try {
        const w = await (await dir.getFileHandle(name, { create: true })).createWritable();
        await w.write(blob); await w.close();
        return `Shotcam saved: ${dir.name}/${name}`;
      } catch { dir = null; } // the folder went away or lost permission: download instead, and ask again next time
    }
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: name });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return `Shotcam downloaded: ${name}`;
  }

  return {
    render,
    // Turned on or off from Settings. Off puts the gun back in the single world pass and lets go of the encoder.
    setEnabled(v) {
      if (v === on) return;
      on = v;
      if (on) { lightAll(); start(); } else { stop(); gunLayer(0); }
    },
    shot() { kick = 0; },
    kill() { // a second bird before the clip is done (a double) moves the clip on to end just past it
      if (!on) return;
      if (clip) { clip.killT = now; return; }
      let resolve; ready = new Promise(r => { resolve = r; });
      clip = { killT: now, resolve };
    },
    // A new hunt: nothing from the last one, and the new map's lights lit for the gun pass too.
    clear() { clip?.resolve(null); clip = null; ready = null; frames = []; if (on) lightAll(); },
    // Resolves to a message for the HUD. Pressed straight after a kill, it waits the second and a half to the clip's end.
    async save() {
      if (!(await supported)) return 'Shotcam needs a browser that can record video (Chrome or Edge)';
      if (!ready) return 'No kill to replay yet';
      const wait = ready;
      // Ask for the folder now, while the key press still counts as the player's gesture.
      if (!dir && window.showDirectoryPicker) {
        try { dir = await showDirectoryPicker({ id: 'shotcam', mode: 'readwrite', startIn: 'videos' }); }
        catch (e) { if (e.name === 'AbortError') return 'Shotcam not saved'; }
      }
      const blob = await wait;
      return blob ? store(blob) : 'Shotcam failed to record';
    },
  };
}
