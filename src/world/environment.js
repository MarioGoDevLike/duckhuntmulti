// The world round the hunter: sky and light, wind-blown grass, and the map being hunted (world/maps.js).
// Switching map swaps the scenery, terrain and light; the grass is mown short where the dog lays the birds.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { TOUCH } from '../config/platform.js';
import { rnd, TAU } from '../core/math.js';
import { MENU_MAP } from '../config/maps.js';
import { BUILD } from './maps.js';
import { floorH, inWater, setTerrain } from './terrain.js';

const { degToRad } = THREE.MathUtils;

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

// Returns { uTime, mow, growBack, setMap, reachable }. Maps are built the first time they are shown, then kept.
export function createEnvironment(scene, renderer) {
  const sky = new Sky(); sky.scale.setScalar(5000); scene.add(sky);
  const envScene = new THREE.Scene(), envSky = new THREE.Mesh(sky.geometry, sky.material); envSky.scale.setScalar(5000); envScene.add(envSky); // reflections: the sky alone
  const pm = new THREE.PMREMGenerator(renderer);
  const hemi = new THREE.HemisphereLight(); scene.add(hemi);
  const sun = new THREE.DirectionalLight(); scene.add(sun);
  scene.fog = new THREE.FogExp2(0xffffff, 0.003);
  const sunDir = new THREE.Vector3(), dv = new THREE.Vector3(), tex = grassTexture();
  const col = new THREE.Color(), m = new THREE.Object3D();

  const uTime = { value: 0 };
  let applyMow, grassMat; // applyMow([x0, x1, z0, z1]) cuts the grass short inside the rectangle; applyMow(null) lets it all grow back
  { // wind-blown grass around the hunter
    const geo = new THREE.PlaneGeometry(0.1, 1, 1, 4).translate(0, 0.5, 0), p = geo.attributes.position;
    const c = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i), s = 0.35 + 0.65 * y; p.setX(i, p.getX(i) * (1 - y * 0.85)); c.set([s, s, s], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const mat = grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
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
    applyMow = rect => {
      for (let i = 0; i < N; i++) {
        const o = i * 7, x = gd[o], z = gd[o + 1], h = floorH(x, z), cut = rect && x > rect[0] && x < rect[1] && z > rect[2] && z < rect[3];
        const tall = map.grass(x, z, h) ? (cut ? 0.07 : gd[o + 6] * map.grassScale) : 0; // none under water
        m.position.set(x, h, z); m.rotation.set(gd[o + 2], gd[o + 3], gd[o + 4]); m.scale.set(gd[o + 5], tall || 1e-4, 1);
        m.updateMatrix(); grass.setMatrixAt(i, m.matrix);
      }
      grass.instanceMatrix.needsUpdate = true;
    };
  }

  const built = {};
  let map = null, mowRect = null;
  function setMap(id) {
    map = built[id] ||= (() => { const b = BUILD[id](tex); b.group.visible = false; scene.add(b.group); return b; })();
    for (const k in built) built[k].group.visible = built[k] === map;
    setTerrain(map.height, map.water);
    const L = map.light;
    sunDir.setFromSphericalCoords(1, degToRad(L.sun[0]), degToRad(L.sun[1]));
    const u = sky.material.uniforms;
    [u.turbidity.value, u.rayleigh.value, u.mieCoefficient.value, u.mieDirectionalG.value] = L.sky;
    u.sunPosition.value.copy(sunDir);
    scene.environment?.dispose(); scene.environment = pm.fromScene(envScene, 0, 0.1, 6000).texture;
    hemi.color.set(L.hemi[0]); hemi.groundColor.set(L.hemi[1]); hemi.intensity = L.hemi[2];
    sun.color.set(L.sunColor); sun.intensity = L.sunI; sun.position.copy(sunDir).multiplyScalar(100);
    scene.fog.color.set(L.fog[0]); scene.fog.density = L.fog[1];
    grassMat.color.set(map.grassTint ?? 0xffffff);
    applyMow(mowRect);
  }
  setMap(MENU_MAP);

  let mown = false;
  return {
    uTime,
    mow(rect) { mowRect = rect; applyMow(rect); mown = true; },
    growBack() { if (mown) { mowRect = null; applyMow(null); mown = false; } },
    setMap,
    reachable: p => map.reachable(p), // a bird down here can be fetched (not lost in the trees or the valley)
    inWater: p => inWater(p.x, p.z),
    // A bird down on the water drifts in to the bank in front of the line. True once it is ashore.
    drift(p, dt) {
      dv.set(-0.4 * p.x, 0, -2 - p.z); const d = dv.length();
      p.addScaledVector(dv.normalize(), Math.min(d, Math.max(1.2, d / 7) * dt));
      return !inWater(p.x, p.z);
    },
  };
}
