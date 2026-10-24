// Voiliers au large de la Côte Fleurie : coque, mât, grand-voile et foc, gîte et tangage à la houle.
import * as THREE from 'three';
import { mulberry32 } from '../core/math.js';
import { shoreZ } from './layout.js';
import { partsToGeo, box, cyl } from './builders.js';

function sailboatGeometry() {
  // Coque (prisme effilé), roof, mât, voiles triangulaires.
  const hull = new THREE.BufferGeometry();
  const L = 8, B = 1.4, H = 0.9;
  const v = [
    0, H, L / 2, -B, H, 0, B, H, 0, -B * 0.8, H, -L / 2, B * 0.8, H, -L / 2,
    0, 0, L / 2 - 0.4, -B * 0.6, 0.1, 0, B * 0.6, 0.1, 0, -B * 0.5, 0.15, -L / 2, B * 0.5, 0.15, -L / 2,
  ];
  const idx = [0, 1, 2, 1, 3, 2, 2, 3, 4, 0, 5, 1, 1, 5, 6, 0, 2, 5, 2, 7, 5, 1, 6, 3, 3, 6, 8, 2, 4, 7, 4, 9, 7, 3, 8, 4, 4, 8, 9, 5, 7, 6, 6, 7, 9, 6, 9, 8];
  hull.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  hull.setIndex(idx);
  hull.computeVertexNormals();
  const sail = (pts) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    g.setIndex([0, 1, 2, 0, 2, 1]);
    g.computeVertexNormals();
    return g;
  };
  return partsToGeo([
    [hull, '#f1f0eb'],
    [box(1.4, 0.45, 2.4), '#e3e1da', { y: H, z: -0.6 }],
    [cyl(0.05, 0.06, 10, 6), '#c9ccd0', { y: H, z: 0.4 }],
    [sail([0.02, H + 0.6, 0.35, 0.02, H + 9.8, 0.4, 0.15, H + 0.8, -3.2]), '#f7f6f1'],
    [sail([0.02, H + 0.5, 0.5, 0.02, H + 8.6, 0.42, 0.1, H + 0.4, 3.6]), '#eceae4'],
  ]);
}

export class Boats {
  constructor(scene, count = 7) {
    const rnd = mulberry32(57);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(sailboatGeometry(), mat, count);
    this.mesh.frustumCulled = false;
    this.boats = [];
    for (let i = 0; i < count; i++) {
      const x = -500 + rnd() * 1000;
      this.boats.push({ x, z: shoreZ(Math.max(-560, Math.min(560, x))) - 220 - rnd() * 600, v: (0.8 + rnd() * 1.6) * (rnd() < 0.5 ? 1 : -1), heel: 0.12 + rnd() * 0.12, ph: rnd() * 6, s: 0.9 + rnd() * 0.4 });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this.t = 0;
    scene.add(this.mesh);
  }

  update(dt) {
    this.t += dt;
    for (let i = 0; i < this.boats.length; i++) {
      const b = this.boats[i];
      b.x += b.v * dt;
      if (b.x > 900) b.x = -900;
      if (b.x < -900) b.x = 900;
      const pitch = Math.sin(this.t * 0.9 + b.ph) * 0.04;
      const roll = Math.sign(b.v) * b.heel + Math.sin(this.t * 0.7 + b.ph) * 0.03;
      this._e.set(pitch, b.v > 0 ? Math.PI / 2 : -Math.PI / 2, roll);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(b.x, Math.sin(this.t * 0.8 + b.ph) * 0.15 - 0.2, b.z), this._q, this._s.setScalar(b.s));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
