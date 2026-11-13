// Shotcam: a camera on the barrel, like a ShotKam. It films the hunt in portrait (9:16) with the gun out of view,
// keeps the last few seconds, and once a bird is down turns the 5 s leading up to and just past the kill into a WebM
// clip: the plain picture with one small red dot where the barrel points, jolting with the recoil. Pressing S saves the
// latest clip to a folder the player picks once (their Videos folder, offered first); where the browser cannot, it
// downloads.
import * as THREE from 'three';

const FPS = 30, W = 540, H = 960, BEFORE = 3.5, AFTER = 1.5, KEEP = BEFORE + AFTER + 0.5;
const MAX_BYTES = 5 * 1024 * 1024; // a clip never takes more than 5 MB on disk
const U = W / 324; // drawing sizes below were tuned at 324 px wide
const KICK = [16, 11, 7, 4, 2, 1].map(px => px * U); // how far the picture jumps on each frame after a shot (the muzzle rising)

// renderer/scene: the game's. rig: the gun in hand, hidden while the shotcam films.
export function createShotcam(renderer, scene, rig) {
  const cam = new THREE.PerspectiveCamera(58, W / H, 0.05, 6000); cam.rotation.order = 'YXZ';
  const size = new THREE.Vector2();
  // Frames are kept as JPEGs (~60 KB each) rather than raw pixels (~2 MB each).
  const shot = Object.assign(document.createElement('canvas'), { width: W, height: H }), sg = shot.getContext('2d');
  let ring = []; // { jpg: Promise<Blob>, t, shot }
  let acc = 0, now = 0, pendingShot = false, dir = null;
  let clip = null; // the clip being made: { killT, resolve }
  let ready = null; // the latest clip: Promise<Blob | null>

  // Call right before the game's own render, in the same frame: it borrows a corner of the canvas, copies it, and
  // the game's render then paints over it, so the player never sees it.
  // filming: false once the round is over; a clip still being made then ends with what it has.
  function capture(dt, eye, filming) {
    now += dt; acc += dt;
    if (clip && (now >= clip.killT + AFTER || !filming)) finish();
    if (!filming || acc < 1 / FPS) return;
    acc = 0;
    renderer.getDrawingBufferSize(size);
    if (!size.x || !size.y) return; // the canvas has no size (a hidden or minimised window): nothing to film
    const bh = Math.min(size.y, H) | 0, bw = Math.round(bh * W / H), pr = renderer.getPixelRatio();
    cam.position.copy(eye.position); cam.quaternion.copy(eye.quaternion);
    const shown = rig.visible; rig.visible = false;
    renderer.setScissorTest(true);
    renderer.setViewport(0, 0, bw / pr, bh / pr); renderer.setScissor(0, 0, bw / pr, bh / pr);
    renderer.render(scene, cam);
    sg.drawImage(renderer.domElement, 0, size.y - bh, bw, bh, 0, 0, W, H);
    renderer.setScissorTest(false); renderer.setViewport(0, 0, size.x / pr, size.y / pr);
    rig.visible = shown;
    // toBlob takes its snapshot now, so the one canvas can be drawn over next frame while this one encodes.
    ring.push({ jpg: new Promise(r => shot.toBlob(r, 'image/jpeg', 0.92)), t: now, shot: pendingShot });
    pendingShot = false;
    while (ring.length && ring[0].t < now - KEEP) ring.shift();
  }

  function finish() {
    const { killT, resolve } = clip; clip = null;
    const frames = ring.filter(f => f.t >= killT - BEFORE);
    ring = ring.filter(f => f.t < killT - BEFORE); // the clip keeps its frames; the ring starts afresh
    if (frames.length < 2) { resolve(null); return; }
    encode(frames).then(resolve, () => resolve(null));
  }

  function draw(g, img, kick) {
    g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
    const s = 1 + kick / U * 0.004; // the jolt: the picture jumps and shakes for a few frames
    g.drawImage(img, (W - W * s) / 2 + (kick ? (Math.random() - 0.5) * kick * 0.4 : 0), (H - H * s) / 2 + kick, W * s, H * s);
    const cx = W / 2, cy = H / 2;
    g.fillStyle = 'rgba(255,30,30,0.35)'; g.beginPath(); g.arc(cx, cy, 6.5 * U, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff1a1a'; g.beginPath(); g.arc(cx, cy, 4 * U, 0, Math.PI * 2); g.fill();
  }

  const decode = async f => { const b = await f.jpg; return b && createImageBitmap(b); };

  // MediaRecorder films the canvas as it changes, so the clip plays out in real time: 5 s of hunt takes 5 s to make.
  // The bitrate is aimed at 85% of the 5 MB cap for the clip's length (at most 8 Mbit/s); the recorder can overshoot
  // its target, so a clip that still comes out over the cap is made again at a rate cut to fit.
  async function encode(frames) {
    let k = -1;
    frames.forEach((f, i) => {
      k = f.shot ? 0 : k >= 0 && k < KICK.length - 1 ? k + 1 : -1;
      f.kick = k >= 0 ? KICK[k] : 0; f.dt = (frames[i + 1]?.t ?? f.t + 1 / FPS) - f.t;
    });
    const secs = frames.reduce((a, f) => a + f.dt, 0);
    let bps = Math.min(8e6, MAX_BYTES * 8 * 0.85 / secs);
    for (let tries = 0; ; tries++) {
      const blob = await record(frames, bps);
      if (blob.size <= MAX_BYTES) return blob;
      if (tries === 2) return null; // could not fit: better no clip than one over the cap
      bps *= 0.8 * MAX_BYTES / blob.size;
    }
  }

  async function record(frames, bps) {
    const out = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = out.getContext('2d');
    const type = ['video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t));
    const rec = new MediaRecorder(out.captureStream(FPS), { mimeType: type, videoBitsPerSecond: Math.round(bps) }), parts = [];
    rec.ondataavailable = e => e.data.size && parts.push(e.data);
    const stopped = new Promise(r => { rec.onstop = r; });
    let next = decode(frames[0]);
    rec.start();
    for (let i = 0; i < frames.length; i++) { // each frame held as long as it lasted in the hunt: real speed
      const due = performance.now() + frames[i].dt * 1000, img = await next;
      if (i + 1 < frames.length) next = decode(frames[i + 1]); // decode the next one while this one shows
      if (img) { draw(g, img, frames[i].kick); img.close(); }
      await new Promise(r => setTimeout(r, Math.max(0, due - performance.now())));
    }
    rec.stop(); await stopped;
    return new Blob(parts, { type: 'video/webm' });
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
    capture,
    shot() { pendingShot = true; },
    kill() { // a second bird before the clip is done (a double) moves the clip on to end just past it
      if (clip) { clip.killT = now; return; }
      let resolve; ready = new Promise(r => { resolve = r; });
      clip = { killT: now, resolve };
    },
    clear() { clip?.resolve(null); ring = []; clip = null; ready = null; },
    // Resolves to a message for the HUD. Pressed straight after a kill, it waits for the clip to finish.
    async save() {
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
