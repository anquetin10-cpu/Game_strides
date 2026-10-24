// Touffes d'herbe et fleurs instanciées autour du joueur (balancement au vent).
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { WORLD } from './layout.js';

const MASK = 512;
const UP = new THREE.Vector3(0, 1, 0);

// Masque « herbe » déduit de la texture du sol (vert dominant).
export function buildGrassMask(canvas) {
  const c = document.createElement('canvas');
  c.width = c.height = MASK;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, MASK, MASK);
  const d = ctx.getImageData(0, 0, MASK, MASK).data;
  const m = new Uint8Array(MASK * MASK);
  for (let i = 0; i < MASK * MASK; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    m[i] = g > r * 1.08 && g > b * 1.2 ? 1 : 0;
  }
  return m;
}

function tuftGeometry() {
  const pos = [];
  const col = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + i * 0.7;
    const r = 0.06 + (i % 2) * 0.05;
    const bx = Math.cos(a) * r, bz = Math.sin(a) * r;
    const w = 0.035;
    const tx = Math.cos(a + Math.PI / 2) * w, tz = Math.sin(a + Math.PI / 2) * w;
    const h = 0.24 + (i % 3) * 0.05;
    const lean = 0.06;
    // Lame effilée : un triangle (base large, pointe fine).
    const v = [
      [bx - tx, 0, bz - tz],
      [bx + tx, 0, bz + tz],
      [bx + Math.cos(a) * lean, h, bz + Math.sin(a) * lean],
    ];
    for (const p of v) {
      pos.push(...p);
      const t = p[1] / h;
      col.push(0.5 + t * 0.5, 0.58 + t * 0.42, 0.45 + t * 0.35);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) n[i + 1] = 1;
  // Normales vers le haut : éclairage doux et homogène.
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return g;
}

export class Grass {
  constructor(scene, terrain, mask, count = 2600, radius = 46) {
    this.terrain = terrain;
    this.mask = mask;
    this.radius = radius;
    this.count = count;
    this.rnd = mulberry32(12);
    this.uniforms = { time: { value: 0 } };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.time = this.uniforms.time;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float time;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
          #else
            vec3 ip = vec3(0.0);
          #endif
          float sway = sin(time * 1.7 + ip.x * 0.31 + ip.z * 0.27) * 0.08 + sin(time * 3.1 + ip.x) * 0.02;
          transformed.x += sway * position.y * 3.0;
          transformed.z += sway * position.y * 1.8;`
        );
    };
    this.mesh = new THREE.InstancedMesh(tuftGeometry(), mat, count);
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.pos = new Float32Array(count * 2);
    this.alive = new Uint8Array(count);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._s = new THREE.Vector3();
    this._v = new THREE.Vector3();
    this._c = new THREE.Color();
    this.center = { x: 1e9, z: 1e9 };
    this.cursor = 0;
    scene.add(this.mesh);
  }

  isGrass(x, z) {
    const i = Math.floor(((x + WORLD.half) / WORLD.size) * MASK);
    const j = Math.floor(((z + WORLD.half) / WORLD.size) * MASK);
    if (i < 0 || j < 0 || i >= MASK || j >= MASK) return false;
    return this.mask[j * MASK + i] === 1;
  }

  _place(k, cx, cz, ring) {
    const rnd = this.rnd;
    const a = rnd() * Math.PI * 2;
    const r = ring ? this.radius * (0.82 + rnd() * 0.18) : this.radius * Math.sqrt(rnd());
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    this.pos[k * 2] = x;
    this.pos[k * 2 + 1] = z;
    const ok = this.isGrass(x, z) && this.terrain.waterDepth(x, z) < -0.05;
    this.alive[k] = ok ? 1 : 0;
    const s = ok ? 0.75 + rnd() * 0.6 : 0;
    this._v.set(x, this.terrain.getHeight(x, z) - 0.02, z);
    this._q.setFromAxisAngle(UP, rnd() * Math.PI);
    this._s.set(s, s * (0.8 + rnd() * 0.6), s);
    this._m.compose(this._v, this._q, this._s);
    this.mesh.setMatrixAt(k, this._m);
    const flower = rnd();
    if (flower < 0.035) this._c.set('#f4f1e6');
    else if (flower < 0.05) this._c.set('#d8443a');
    else if (flower < 0.06) this._c.set('#e9c94a');
    else this._c.setRGB(0.36 + rnd() * 0.12, 0.56 + rnd() * 0.12, 0.25 + rnd() * 0.08);
    this.mesh.setColorAt(k, this._c);
  }

  update(dt, focus) {
    this.uniforms.time.value += dt;
    const jump = Math.hypot(focus.x - this.center.x, focus.z - this.center.z);
    if (jump > this.radius) {
      // Téléportation : tout replacer.
      for (let k = 0; k < this.count; k++) this._place(k, focus.x, focus.z, false);
      this.center = { x: focus.x, z: focus.z };
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
      return;
    }
    this.center = { x: focus.x, z: focus.z };
    // Recycler progressivement les touffes sorties du disque.
    let changed = false;
    const r2 = this.radius * this.radius;
    for (let n = 0; n < 400; n++) {
      const k = this.cursor;
      this.cursor = (this.cursor + 1) % this.count;
      const dx = this.pos[k * 2] - focus.x, dz = this.pos[k * 2 + 1] - focus.z;
      if (dx * dx + dz * dz > r2) {
        this._place(k, focus.x, focus.z, true);
        changed = true;
      }
    }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.mesh.instanceColor.needsUpdate = true;
    }
  }
}
