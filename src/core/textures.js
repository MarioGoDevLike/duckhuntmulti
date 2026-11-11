// Textures painted on a canvas at load time.
import * as THREE from 'three';

export const canvasTex = (w, h, paint, { repeat = 1, srgb = true } = {}) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  return t;
};

// Floating text: first line in the given colour, any further lines smaller and gold.
export function labelSprite(lines, color = '#f1e8d0', width = 1.2) {
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

// Soft radial glow for muzzle flashes.
export function flashTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, '#fff'); r.addColorStop(0.3, 'rgba(255,200,90,.8)'); r.addColorStop(1, 'rgba(255,120,30,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
