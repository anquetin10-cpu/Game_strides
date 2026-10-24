// Goélands au-dessus de la plage : vol plané en cercles, battements d'ailes intermittents (un seul appel de dessin).
import * as THREE from 'three';
import { shoreZ } from './layout.js';
import { mulberry32 } from '../core/math.js';

function gullGeometry() {
  // Corps fuselé, ailes en deux segments (le segment extérieur bat davantage), extrémités noires.
  const P = [];
  const C = [];
  const W = [0.93, 0.93, 0.92], G = [0.62, 0.64, 0.68], K = [0.08, 0.08, 0.09], Y = [0.85, 0.7, 0.2];
  const tri = (a, b, c, col) => { P.push(...a, ...b, ...c); C.push(...col, ...col, ...col); };
  // Corps (losange allongé).
  const nose = [0, 0, 0.32], tail = [0, 0.02, -0.38], top = [0, 0.07, 0], bot = [0, -0.06, 0.02], l = [-0.07, 0, 0.02], r = [0.07, 0, 0.02];
  for (const [a, b] of [[top, l], [r, top], [l, bot], [bot, r]]) { tri(nose, a, b, W); tri(tail, b, a, W); }
  tri([0, 0, 0.32], [0, -0.01, 0.4], [0.02, -0.01, 0.33], Y);
  // Ailes : intérieur gris, pointes noires (la coordonnée x sert à l'animation).
  for (const s of [-1, 1]) {
    const a0 = [s * 0.06, 0.02, 0.1], a1 = [s * 0.06, 0.02, -0.12], m0 = [s * 0.45, 0.04, 0.06], m1 = [s * 0.45, 0.04, -0.1];
    const t0 = [s * 0.82, 0.02, -0.06];
    if (s > 0) { tri(a0, m0, a1, G); tri(a1, m0, m1, G); tri(m0, t0, m1, K); }
    else { tri(a0, a1, m0, G); tri(a1, m1, m0, G); tri(m0, m1, t0, K); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

export class Birds {
  constructor(scene, count = 28) {
    const rnd = mulberry32(911);
    this.time = { value: 0 };
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = this.time;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
  float ph = float( gl_InstanceID ) * 1.73;
  // Battements par séquences (vol plané entre deux), plus amples en bout d'aile.
  float burst = smoothstep( 0.2, 0.6, sin( uTime * 0.6 + ph * 2.1 ) );
  float flap = sin( uTime * 9.0 + ph ) * burst;
  float ax = abs( position.x );
  transformed.y += flap * ( ax * 0.55 + max( ax - 0.45, 0.0 ) * 0.5 ) - ax * 0.08 * ( 1.0 - burst );`);
    };
    this.mesh = new THREE.InstancedMesh(gullGeometry(), mat, count);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    this.birds = [];
    for (let i = 0; i < count; i++) {
      const x = -280 + rnd() * 560;
      this.birds.push({
        cx: x, cz: shoreZ(x) - 10 - rnd() * 60, r: 12 + rnd() * 35, h: 9 + rnd() * 22,
        a: rnd() * Math.PI * 2, w: (0.18 + rnd() * 0.15) * (rnd() < 0.5 ? 1 : -1), s: 0.9 + rnd() * 0.5,
      });
    }
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler(0, 0, 0, 'YXZ');
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    scene.add(this.mesh);
  }

  update(dt, night = 0) {
    this.time.value += dt;
    this.mesh.visible = night < 0.6;
    if (!this.mesh.visible) return;
    for (let i = 0; i < this.birds.length; i++) {
      const b = this.birds[i];
      b.a += b.w * dt;
      const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r;
      const y = b.h + Math.sin(this.time.value * 0.5 + i) * 1.5;
      // Cap tangent au cercle, inclinaison dans le virage.
      const yaw = Math.atan2(-Math.sin(b.a) * Math.sign(b.w), Math.cos(b.a) * Math.sign(b.w));
      this._e.set(0.05, yaw, -Math.sign(b.w) * 0.35);
      this._q.setFromEuler(this._e);
      this._m.compose(this._p.set(x, y, z), this._q, this._s.setScalar(b.s));
      this.mesh.setMatrixAt(i, this._m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
