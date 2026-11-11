// The static world: sky and light, the field, wind-blown grass around the hunter, distant trees and the
// thrush grove. Built once; only the scenery toggles and the grass mowing change it afterwards.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { TOUCH } from '../config/platform.js';
import { rnd, TAU } from '../core/math.js';
import { groundH } from './terrain.js';

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

// Returns { uTime, mow, growBack, setScenery, resetScenery }.
export function createEnvironment(scene, renderer) {
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
  let applyMow; // applyMow([x0, x1, z0, z1]) cuts the grass short inside the rectangle; applyMow(null) lets it all grow back
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
    applyMow = rect => {
      for (let i = 0; i < N; i++) {
        const o = i * 7, x = gd[o], z = gd[o + 1], cut = rect && x > rect[0] && x < rect[1] && z > rect[2] && z < rect[3];
        m.position.set(x, 0, z); m.rotation.set(gd[o + 2], gd[o + 3], gd[o + 4]); m.scale.set(gd[o + 5], cut ? 0.07 : gd[o + 6], 1);
        m.updateMatrix(); grass.setMatrixAt(i, m.matrix);
      }
      grass.instanceMatrix.needsUpdate = true;
    };
  }

  const trees = []; // hidden for quarry hunted on open ground
  const addTrees = (geo, n, hue) => {
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial(), n);
    for (let i = 0; i < n; i++) {
      let x, z;
      do { const r = rnd(150, 520), a = rnd(0, TAU); x = Math.cos(a) * r; z = Math.sin(a) * r; } while (Math.sin(x * 0.02) + Math.cos(z * 0.017 + 1) < 0.1);
      const s = rnd(0.7, 1.5);
      m.position.set(x, groundH(x, z), z); m.rotation.set(0, rnd(0, 6), 0); m.scale.set(s, s * rnd(0.9, 1.4), s); m.updateMatrix();
      mesh.setMatrixAt(i, m.matrix); mesh.setColorAt(i, col.setHSL(hue + rnd(-0.03, 0.03), rnd(0.3, 0.5), rnd(0.12, 0.22)));
    }
    scene.add(mesh); trees.push(mesh);
  };
  addTrees(new THREE.ConeGeometry(3, 13, 7).translate(0, 6.5, 0), 700, 0.33);
  addTrees(new THREE.IcosahedronGeometry(4.5, 1).scale(1, 1.2, 1).translate(0, 5, 0), 500, 0.27);

  // Thrush stand: a belt of olive-like trees 34–62 m in front of the line, where the birds come out of.
  const grove = new THREE.Group(); grove.visible = false; scene.add(grove);
  {
    const N = 90, trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 2.6, 7).translate(0, 1.3, 0),
      new THREE.MeshLambertMaterial({ color: 0x5c5248 }), N);
    const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.3, 1).scale(1.25, 0.8, 1.25).translate(0, 3.6, 0),
      new THREE.MeshLambertMaterial(), N);
    for (let i = 0; i < N; i++) {
      const x = -55 + (i % 15) * 7.6 + rnd(-2.4, 2.4), z = -36 - (i / 15 | 0) * 4.6 + rnd(-1.6, 1.6), k = rnd(0.8, 1.25);
      m.position.set(x, groundH(x, z), z); m.rotation.set(0, rnd(0, TAU), 0); m.scale.set(k, k * rnd(0.85, 1.15), k); m.updateMatrix();
      trunk.setMatrixAt(i, m.matrix); crown.setMatrixAt(i, m.matrix);
      crown.setColorAt(i, col.setHSL(rnd(0.2, 0.26), rnd(0.18, 0.3), rnd(0.28, 0.38)));
    }
    grove.add(trunk, crown);
  }

  let mown = false;
  return {
    uTime,
    mow(rect) { applyMow(rect); mown = true; },
    growBack() { if (mown) { applyMow(null); mown = false; } },
    // Open-ground quarry hides the trees; thrushes get their grove.
    setScenery(Q) { trees.forEach(t => { t.visible = !Q.open; }); grove.visible = Q.grove; },
    resetScenery() { trees.forEach(t => { t.visible = true; }); grove.visible = false; },
  };
}
