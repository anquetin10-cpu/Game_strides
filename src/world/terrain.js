import * as THREE from 'three';
import { createNoise2D, fbm } from '../core/noise.js';
import { clamp, lerp, polyDist, smoothstep, pointAlong } from '../core/math.js';
import { WORLD, ZONES, ROADS, POND, SIGN, shoreZ, isCliffRegion, zoneDist } from './layout.js';

const n1 = createNoise2D(11);
const n2 = createNoise2D(23);

function hills(x, z) {
  let h = fbm(n1, x * 0.0035, z * 0.0035, 4) * 9;
  h += Math.max(0, fbm(n2, x * 0.008 + 40, z * 0.008, 3)) * 4;
  h += smoothstep(120, 560, z) * 24 * (0.65 + 0.35 * n2(x * 0.004 + 10, z * 0.004));
  const ds = Math.hypot(x - SIGN.x, z - SIGN.z);
  h += SIGN.h * Math.exp(-(ds * ds) / (2 * (SIGN.r * 0.45) ** 2));
  const edge = Math.max(smoothstep(500, 600, Math.abs(x)), smoothstep(530, 600, z));
  h += edge * 22;
  return h;
}

// Raw height before zone/road shaping.
export function baseHeight(x, z) {
  const d = z - shoreZ(x);
  const land = Math.max(5 + hills(x, z), 2.8);
  const coast = d < 0 ? Math.max(-14, d * 0.07) : Math.min(d * 0.045, 3.2);
  let h = lerp(coast, land, smoothstep(55, 150, d));
  const c = isCliffRegion(x);
  if (c > 0) {
    const plateau = lerp(land, 24 + 4 * n1(x * 0.01, z * 0.01), smoothstep(-200, -330, z));
    const ch = d < 0 ? Math.max(-14, d * 0.09) : d < 10 ? d * 0.05 : lerp(0.5, plateau, smoothstep(10, 22, d));
    h = lerp(h, ch, c);
  }
  return h;
}

for (const z of ZONES) if (z.y === undefined) z.y = Math.max(3, baseHeight(z.x, z.z));

function zonedHeight(x, z) {
  let h = baseHeight(x, z);
  for (const zone of ZONES) {
    const d = zoneDist(x, z, zone);
    if (d < zone.fall) h = lerp(h, zone.y, 1 - smoothstep(0, zone.fall, d));
  }
  return h;
}

// Profil en long lissé de chaque route (évite les rampes trop raides).
const PROFILES = new Map();
function roadProfile(r) {
  if (PROFILES.has(r)) return PROFILES.get(r);
  const cum = [0];
  for (let i = 0; i < r.pts.length - 1; i++) cum.push(cum[i] + Math.hypot(r.pts[i + 1][0] - r.pts[i][0], r.pts[i + 1][1] - r.pts[i][1]));
  const L = cum[cum.length - 1];
  const step = 4;
  const n = Math.ceil(L / step) + 1;
  let hs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const p = pointAlong(r.pts, Math.min(L, i * step));
    hs[i] = zonedHeight(p.x, p.z);
  }
  // Raccords : une route secondaire épouse le profil de la route sur laquelle elle débouche.
  const pins = [];
  const idx = ROADS.indexOf(r);
  for (const [k, pt] of [[0, r.pts[0]], [n - 1, r.pts[r.pts.length - 1]]]) {
    for (let j = 0; j < idx; j++) {
      const q = polyDist(pt[0], pt[1], ROADS[j].pts);
      if (q.d < 3) {
        pins.push([k, profileAt(ROADS[j], q)]);
        break;
      }
    }
  }
  for (const [k, v] of pins) hs[k] = v;
  for (let pass = 0; pass < 6; pass++) {
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0, w = 0;
      for (let k = -3; k <= 3; k++) {
        const j = Math.min(n - 1, Math.max(0, i + k));
        sum += hs[j];
        w++;
      }
      o[i] = sum / w;
    }
    hs = o;
    for (const [k, v] of pins) hs[k] = v;
  }
  const prof = { cum, hs, step, n };
  PROFILES.set(r, prof);
  return prof;
}
function profileAt(r, p) {
  const prof = roadProfile(r);
  const segLen = prof.cum[p.seg + 1] - prof.cum[p.seg];
  const s = prof.cum[p.seg] + p.t * segLen;
  const f = Math.min(prof.n - 1.001, s / prof.step);
  const i = Math.floor(f);
  return prof.hs[i] + (prof.hs[i + 1] - prof.hs[i]) * (f - i);
}

let pondBase = null;
export function analyticHeight(x, z) {
  let h = zonedHeight(x, z);
  for (const r of ROADS) {
    const p = polyDist(x, z, r.pts);
    const inner = r.w / 2 + 1;
    const outer = r.w / 2 + 8;
    if (p.d < outer) h = lerp(h, profileAt(r, p), 1 - smoothstep(inner, outer, p.d));
  }
  const dp = Math.hypot(x - POND.x, z - POND.z);
  if (dp < POND.r + 12) {
    if (pondBase === null) pondBase = zonedHeight(POND.x, POND.z);
    h = lerp(h, pondBase, 1 - smoothstep(POND.r + 3, POND.r + 12, dp));
    h -= 1.15 * (1 - smoothstep(POND.r - 5, POND.r + 2, dp));
  }
  return h;
}

export class Terrain {
  constructor(seg = 200) {
    this.size = WORLD.size;
    this.half = WORLD.half;
    this.seg = seg;
    this.cell = this.size / seg;
    this.n = seg + 1;
    this.heights = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) {
      for (let i = 0; i < this.n; i++) {
        const x = -this.half + i * this.cell;
        const z = -this.half + j * this.cell;
        this.heights[j * this.n + i] = analyticHeight(x, z);
      }
    }
    const rim = analyticHeight(POND.x + POND.r + 6, POND.z);
    POND.level = Math.min(rim, analyticHeight(POND.x - POND.r - 6, POND.z), analyticHeight(POND.x, POND.z + POND.r + 6)) - 0.45;
  }

  // Exact height of the rendered triangle mesh at (x, z).
  getHeight(x, z) {
    const fx = clamp((x + this.half) / this.cell, 0, this.seg - 1e-4);
    const fz = clamp((z + this.half) / this.cell, 0, this.seg - 1e-4);
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    const u = fx - i;
    const v = fz - j;
    const n = this.n;
    const ha = this.heights[j * n + i];
    const hb = this.heights[j * n + i + 1];
    const hc = this.heights[(j + 1) * n + i];
    const hd = this.heights[(j + 1) * n + i + 1];
    if (u + v <= 1) return ha + (hb - ha) * u + (hc - ha) * v;
    return hd + (hc - hd) * (1 - u) + (hb - hd) * (1 - v);
  }

  getSlope(x, z) {
    const e = 1.5;
    const dx = this.getHeight(x + e, z) - this.getHeight(x - e, z);
    const dz = this.getHeight(x, z + e) - this.getHeight(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }

  // Water depth at (x,z): sea or pond. Positive when under water.
  waterDepth(x, z) {
    const h = this.getHeight(x, z);
    let depth = -h;
    const dp = Math.hypot(x - POND.x, z - POND.z);
    if (dp < POND.r + 2) depth = Math.max(depth, POND.level - h);
    return depth;
  }

  buildMesh(texture, detailTexture) {
    const n = this.n;
    const pos = new Float32Array(n * n * 3);
    const uv = new Float32Array(n * n * 2);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        pos[k * 3] = -this.half + i * this.cell;
        pos[k * 3 + 1] = this.heights[k];
        pos[k * 3 + 2] = -this.half + j * this.cell;
        uv[k * 2] = i / this.seg;
        uv[k * 2 + 1] = 1 - j / this.seg;
      }
    }
    const idx = new Uint32Array(this.seg * this.seg * 6);
    let p = 0;
    for (let j = 0; j < this.seg; j++) {
      for (let i = 0; i < this.seg; i++) {
        const a = j * n + i;
        const b = a + 1;
        const c = a + n;
        const d = c + 1;
        idx[p++] = a; idx[p++] = c; idx[p++] = b;
        idx[p++] = b; idx[p++] = c; idx[p++] = d;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ map: texture });
    if (detailTexture) {
      mat.onBeforeCompile = (shader) => {
        shader.uniforms.detailMap = { value: detailTexture };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\nvarying vec2 vWorldXZ;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xz;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform sampler2D detailMap;\nvarying vec2 vWorldXZ;')
          .replace(
            '#include <map_fragment>',
            `#include <map_fragment>
            float dA = texture2D(detailMap, vWorldXZ * 0.11).r;
            float dB = texture2D(detailMap, vWorldXZ * 0.023 + 0.37).g;
            float dC = texture2D(detailMap, vWorldXZ * 0.61 + 0.13).r;
            diffuseColor.rgb *= (0.74 + 0.36 * dA + 0.16 * (dB - 0.5)) * (0.9 + 0.2 * dC);`
          );
      };
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    mesh.renderOrder = -2;
    mesh.name = 'terrain';
    return mesh;
  }
}
