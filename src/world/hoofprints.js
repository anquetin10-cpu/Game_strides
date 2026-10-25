// Empreintes de sabots dans le sable et la terre : décalques multiplicatifs, effacés progressivement.
import * as THREE from 'three';
import { hoofWorldPosition } from '../entities/horseModel.js';

function printTexture() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 64, 64);
  // Empreinte de sabot ferré : fer en U plus marqué, fourchette au centre, bord repoussé clair à l'avant.
  const g = ctx.createRadialGradient(32, 36, 4, 32, 34, 26);
  g.addColorStop(0, '#9a9a9a');
  g.addColorStop(0.7, '#b9b9b9');
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(32, 34, 21, 25, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#6f6f6f';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.ellipse(32, 36, 17, 21, 0, Math.PI * 1.15, Math.PI * 1.85 + Math.PI, false);
  ctx.stroke();
  ctx.fillStyle = '#8a8a8a';
  ctx.beginPath();
  ctx.moveTo(32, 26);
  ctx.lineTo(25, 50);
  ctx.lineTo(39, 50);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Positions locales des sabots (avant/arrière, gauche/droite) et ordre de pose au pas.
const HOOVES = [[-0.17, -0.7], [-0.16, 0.62], [0.17, -0.7], [0.16, 0.62]];

export class HoofPrints {
  constructor(scene, terrain, max = 360) {
    this.terrain = terrain;
    this.max = max;
    const geo = new THREE.PlaneGeometry(0.15, 0.17);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ map: printTexture(), transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false, toneMapped: false, fog: false });
    // La couleur d'instance porte l'intensité de l'empreinte : 1 = fraîche, 0 = effacée (blanc = sans effet).
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '').replace('#include <map_fragment>', '#include <map_fragment>\n#ifdef USE_COLOR\n  diffuseColor.rgb = mix( vec3( 1.0 ), diffuseColor.rgb, vColor.r );\n#endif');
    };
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.born = new Float32Array(max);
    this.cursor = 0;
    this.time = 0;
    this.seq = new Map();
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3(1, 1, 1);
    this._up = new THREE.Vector3(0, 1, 0);
    scene.add(this.mesh);
  }

  // n posers de sabots pour ce cheval (ordre au pas : postérieur gauche, antérieur gauche, postérieur droit, antérieur droit).
  step(horse, n, strength = 1) {
    let k = this.seq.get(horse) ?? 0;
    const h = horse.heading;
    const fx = Math.sin(h), fz = Math.cos(h);
    const rx = -fz, rz = fx;
    for (let i = 0; i < n; i++) {
      const [lat, lon] = HOOVES[k % 4];
      k++;
      const x = horse.pos.x + fx * lon + rx * lat, z = horse.pos.z + fz * lon + rz * lat;
      this.add(x, z, h, strength);
    }
    this.seq.set(horse, k);
  }

  // Empreintes aux positions réelles des sabots posés (indices 0 AG, 1 AD, 2 PG, 3 PD).
  stepAt(horse, list, strength = 1) {
    for (const i of list) {
      const p = hoofWorldPosition(horse.bones, i, this._v);
      this.add(p.x, p.z, horse.heading, strength);
    }
  }

  add(x, z, heading, strength = 1) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    const y = this.terrain.getHeight(x, z) + 0.025;
    this._q.setFromAxisAngle(this._up, heading);
    this._m.compose(this._v.set(x, y, z), this._q, this._s);
    this.mesh.setMatrixAt(i, this._m);
    this.born[i] = this.time - (1 - strength) * 60;
    this.mesh.count = Math.max(this.mesh.count, i + 1);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  // Effacement progressif (les traces disparaissent en ~2 minutes).
  update(dt) {
    this.time += dt;
    if (!this.mesh.count || ((this._t = (this._t || 0) + dt) < 0.5)) return;
    this._t = 0;
    const c = this.mesh.instanceColor.array;
    for (let i = 0; i < this.mesh.count; i++) {
      const age = this.time - this.born[i];
      const f = 1 - Math.min(1, Math.max(0, age / 120));
      c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = f;
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
}
