// Player input: mouse-look under pointer lock, mouse buttons and keys on desktop; drag-to-look on touch screens
// (whose buttons are part of the HUD). Translates DOM events into the handlers' verbs and nothing more.
import { TOUCH } from '../config/platform.js';

// h: { live(), look(dx, dy, sensitivity), fire(), aim(on), reload(), hold(), pause(), lockLost(), key?(code) }
export function createInput(canvas, h) {
  let locked = false;

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
    h.look(dx, dy, 0.0016);
  };
  const onDown = e => {
    if (!h.live() || e.target !== canvas) return;
    if (!TOUCH && !locked) { lock(); return; } // a room's round starts without a click, so the first click grabs the mouse
    if (e.button === 0) h.fire(); else if (e.button === 2) h.aim(true);
  };
  const onUp = e => { if (e.button === 2) h.aim(false); };

  // Touch: drag on the scene to look. preventDefault stops the browser from also sending fake mouse clicks.
  let tid = null, tx = 0, ty = 0;
  const onTS = e => { e.preventDefault(); if (tid === null) { const t = e.changedTouches[0]; tid = t.identifier; tx = t.clientX; ty = t.clientY; } };
  const onTM = e => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === tid) { h.look(t.clientX - tx, t.clientY - ty, 0.0045); tx = t.clientX; ty = t.clientY; }
  };
  const onTE = e => { for (const t of e.changedTouches) if (t.identifier === tid) tid = null; };

  const onHide = () => { if (document.hidden) h.pause(); };
  const onKey = e => {
    if (!h.live()) return;
    if (e.code === 'KeyR') h.reload();
    else if (e.code === 'KeyE') h.hold();
    else if (e.code === 'Escape' || e.code === 'KeyP') h.pause(); // Esc also pauses when the mouse isn't captured
    else h.key?.(e.code); // anything else is the game's to read (the night hunt's lamp, walking and callouts)
  };
  const onMenu = e => e.preventDefault();
  const onLock = () => {
    const l = document.pointerLockElement === canvas;
    if (locked && !l) h.lockLost(); // the browser let go of the mouse (Esc) without us asking
    locked = l;
  };

  // Desktop grabs the mouse. Phones play in landscape; fullscreen there is the player's choice (the app's toggle).
  function lock() {
    try {
      if (TOUCH) return;
      // Raw mouse input: no OS acceleration and none of the movement spikes that come with it. Falls back where unsupported.
      canvas.requestPointerLock({ unadjustedMovement: true })?.catch?.(() => canvas.requestPointerLock()?.catch?.(() => {}));
    } catch { /* falls back to unlocked mouse / windowed play */ }
  }

  const act = { passive: false };
  const events = [[document, 'mousemove', onMove], [document, 'mousedown', onDown], [document, 'mouseup', onUp], [document, 'keydown', onKey],
    [document, 'contextmenu', onMenu], [document, 'pointerlockchange', onLock], [document, 'visibilitychange', onHide],
    [canvas, 'touchstart', onTS, act], [canvas, 'touchmove', onTM, act], [canvas, 'touchend', onTE], [canvas, 'touchcancel', onTE]];
  events.forEach(([t, n, f, o]) => t.addEventListener(n, f, o));

  return {
    lock,
    // We let go of the mouse ourselves (pause, end of round): not reported as lockLost.
    release() { locked = false; document.exitPointerLock?.(); },
    dispose() { events.forEach(([t, n, f]) => t.removeEventListener(n, f)); },
  };
}
