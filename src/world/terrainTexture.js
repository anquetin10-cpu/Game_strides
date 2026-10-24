// Peint la texture de couleur du terrain (champs, plage, falaises, sites, chemins).
import * as THREE from 'three';
import { createNoise2D } from '../core/noise.js';
import { clamp, smoothstep } from '../core/math.js';
import { WORLD, ROADS, PATHS, XC_PATH, POND, HIPPO, ZONES, shoreZ, forestDensity, isCliffRegion } from './layout.js';
import { HOME, HARAS, POLE, HIPPO_SITE, DUNES, GATIEN, TOWN, TOWN_BLOCKS } from './sites.js';
import { getFields } from './fields.js';


function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const C = {
  sand: hexToRgb('#e7d7ae'),
  wetSand: hexToRgb('#c4b38a'),
  seabed: hexToRgb('#a89a72'),
  chalk: hexToRgb('#e4e0d4'),
  rock: hexToRgb('#a19d92'),
  forest: hexToRgb('#4d6e38'),
  cliffGrass: hexToRgb('#7fa65a'),
  coastGrass: hexToRgb('#7aa957'),
};

export function paintTerrainCanvas(terrain, size = 2048) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const S = size / WORLD.size;
  const px = (x) => (x + WORLD.half) * S;
  const pz = (z) => (z + WORLD.half) * S;

  const __t = [performance.now()];
  const __m = (l) => { if (globalThis.__debugTimings) console.log('[paint]', l, Math.round(performance.now() - __t[0])); __t[0] = performance.now(); };
  ctx.fillStyle = '#6f9e4f';
  ctx.fillRect(0, 0, size, size);
  const { fields } = getFields();
  for (const f of fields) {
    ctx.fillStyle = f.color;
    ctx.beginPath();
    f.poly.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), pz(p[1])) : ctx.moveTo(px(p[0]), pz(p[1]))));
    ctx.closePath();
    ctx.fill();
    if (f.type === 'wheat' || f.type === 'plowed' || f.type === 'colza') {
      // Sillons.
      ctx.save();
      ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.07)';
      ctx.lineWidth = 1;
      const ang = Math.atan2(f.poly[1][1] - f.poly[0][1], f.poly[1][0] - f.poly[0][0]);
      ctx.translate(px(f.cx), pz(f.cz));
      ctx.rotate(ang);
      for (let k = -60; k < 60; k += 3) {
        ctx.beginPath();
        ctx.moveTo(-80, k);
        ctx.lineTo(80, k);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  __m('fields');
  // Grilles grossières précalculées (forêt, pente) pour une passe pixel rapide.
  const G = 300;
  const gStep = WORLD.size / (G - 1);
  const forestG = new Float32Array(G * G);
  const slopeG = new Float32Array(G * G);
  for (let j = 0; j < G; j++) {
    for (let i = 0; i < G; i++) {
      const x = -WORLD.half + i * gStep;
      const z = -WORLD.half + j * gStep;
      forestG[j * G + i] = z - shoreZ(x) > 60 ? forestDensity(x, z) : 0;
      slopeG[j * G + i] = terrain.getSlope(x, z);
    }
  }
  const bil = (arr, x, z) => {
    const fx = clamp((x + WORLD.half) / gStep, 0, G - 1.001);
    const fz = clamp((z + WORLD.half) / gStep, 0, G - 1.001);
    const i = fx | 0, j = fz | 0, u = fx - i, v = fz - j;
    const a = arr[j * G + i], b = arr[j * G + i + 1], c = arr[(j + 1) * G + i], e = arr[(j + 1) * G + i + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v;
  };
  const M1 = periodicNoise(256, 24, 31);
  const M2 = periodicNoise(256, 96, 37);

  __m('grids');
  // Sols des sites : base herbe (évite que les cultures débordent sous les cours).
  for (const zn of ZONES) {
    if (zn.id === 'town') continue;
    ctx.fillStyle = '#74a552';
    ctx.beginPath();
    const x0 = (zn.x - zn.hw + WORLD.half) * S, z0 = (zn.z - zn.hd + WORLD.half) * S;
    if (ctx.roundRect) ctx.roundRect(x0, z0, zn.hw * 2 * S, zn.hd * 2 * S, 12 * S);
    else ctx.rect(x0, z0, zn.hw * 2 * S, zn.hd * 2 * S);
    ctx.fill();
  }

  // Passe pixel : plage, fonds marins, falaises, forêts, variations.
  const img = ctx.getImageData(0, 0, size, size);
  __m('getImageData');
  const d = img.data;
  const step = WORLD.size / size;
  const col = [0, 0, 0];
  const mixIn = (c, t) => {
    col[0] += (c[0] - col[0]) * t;
    col[1] += (c[1] - col[1]) * t;
    col[2] += (c[2] - col[2]) * t;
  };
  const shoreCol = new Float32Array(size);
  const cliffCol = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = -WORLD.half + (i + 0.5) * step;
    shoreCol[i] = shoreZ(x);
    cliffCol[i] = isCliffRegion(x);
  }
  for (let j = 0; j < size; j++) {
    const z = -WORLD.half + (j + 0.5) * step;
    for (let i = 0; i < size; i++) {
      const x = -WORLD.half + (i + 0.5) * step;
      const k = (j * size + i) * 4;
      col[0] = d[k];
      col[1] = d[k + 1];
      col[2] = d[k + 2];
      const ds = z - shoreCol[i];
      const cliff = cliffCol[i];
      if (ds < 125 && cliff < 0.5) mixIn(C.coastGrass, smoothstep(125, 100, ds));
      const fd = bil(forestG, x, z);
      if (fd > 0.01) mixIn(C.forest, clamp(fd * 1.3, 0, 1));
      if (cliff > 0.2 && ds > 15) mixIn(C.cliffGrass, cliff * 0.6);
      const mi = ((j & 255) << 8) | (i & 255);
      const sandEdge = 60 + (M1[mi] - 0.5) * 14;
      if (ds < sandEdge + 1 && !(cliff > 0.5 && ds > 11)) {
        const h = terrain.getHeight(x, z);
        let s = C.sand;
        if (ds < 7) s = mix(C.wetSand, C.sand, clamp(ds / 7, 0, 1));
        if (h < -0.05) s = mix(C.wetSand, C.seabed, clamp(-h / 4, 0, 1));
        mixIn(s, smoothstep(sandEdge, sandEdge - 8, ds));
      }
      const slope = bil(slopeG, x, z);
      if (slope > 0.75) mixIn(cliff > 0.3 ? C.chalk : C.rock, smoothstep(0.75, 1.2, slope));
      const m = 0.93 + M1[mi] * 0.1 + M2[mi] * 0.05;
      d[k] = clamp(col[0] * m, 0, 255);
      d[k + 1] = clamp(col[1] * m, 0, 255);
      d[k + 2] = clamp(col[2] * m, 0, 255);
    }
  }
  __m('pixels');
  ctx.putImageData(img, 0, 0);
  __m('put');

  const rect = (r, fill, rad = 0) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px(r.x - r.w / 2), pz(r.z - r.d / 2), r.w * S, r.d * S, rad * S);
    else ctx.rect(px(r.x - r.w / 2), pz(r.z - r.d / 2), r.w * S, r.d * S);
    ctx.fill();
  };
  const line = (pts, w, color, cap = 'round') => {
    ctx.strokeStyle = color;
    ctx.lineWidth = w * S;
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(px(p[0]), pz(p[1])) : ctx.moveTo(px(p[0]), pz(p[1]))));
    ctx.stroke();
  };

  // Sites.
  const zone = (id) => ZONES.find((z) => z.id === id);
  const town = zone('town');
  rect({ x: town.x, z: town.z, w: town.hw * 2 - 4, d: town.hd * 2 - 4 }, '#b9b3a7', 8);
  for (const [x0, x1, z0, z1] of TOWN_BLOCKS) {
    const ins = 17;
    if (x1 - x0 > 2 * ins + 4 && z1 - z0 > 2 * ins + 4) rect({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0 - 2 * ins, d: z1 - z0 - 2 * ins }, '#7aa957', 3);
  }
  rect(TOWN.plaza, '#d3cbbb', 4);
  rect({ ...TOWN.plaza, w: 30, d: 30 }, '#c7bfae', 15);
  rect(HOME.yard, '#cdbf9d', 6);
  rect(HOME.arena, '#c6ad86', 2);
  rect(HOME.paddock, '#79a955', 2);
  rect(HARAS.court, '#d4c7a8', 4);
  for (const p of HARAS.paddocks) rect(p, '#80b05b', 2);
  rect({ x: POLE.arena.x, z: POLE.arena.z - 8, w: 210, d: 104 }, '#8fb26a', 6);
  rect(POLE.arena, '#c9b08a', 2);
  rect(POLE.warmup, '#c0a881', 2);
  rect({ x: 330, z: -192, w: 60, d: 16 }, '#c8c1b3', 3);
  rect({ x: HIPPO_SITE.parking.x, z: HIPPO_SITE.parking.z, w: 70, d: 18 }, '#c8c1b3', 3);
  rect(DUNES.paddock, '#86b35e', 2);
  rect({ x: DUNES.barn.x, z: DUNES.barn.z + 6, w: 50, d: 24 }, '#d3c7aa', 4);
  rect({ x: GATIEN.barn.x, z: GATIEN.barn.z + 12, w: 60, d: 46 }, '#d3c7aa', 4);

  // Hippodrome : piste en sable fibré, intérieur en herbe.
  const oval = (r) => {
    ctx.beginPath();
    ctx.moveTo(px(HIPPO.x - HIPPO.half), pz(HIPPO.z - r));
    ctx.lineTo(px(HIPPO.x + HIPPO.half), pz(HIPPO.z - r));
    ctx.arc(px(HIPPO.x + HIPPO.half), pz(HIPPO.z), r * S, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(px(HIPPO.x - HIPPO.half), pz(HIPPO.z + r));
    ctx.arc(px(HIPPO.x - HIPPO.half), pz(HIPPO.z), r * S, Math.PI / 2, (3 * Math.PI) / 2);
    ctx.closePath();
  };
  ctx.fillStyle = '#c9ad82';
  oval(HIPPO.radius + HIPPO.width / 2 + 1);
  ctx.fill();
  ctx.fillStyle = '#7fb455';
  oval(HIPPO.radius - HIPPO.width / 2 - 1);
  ctx.fill();

  // Chemins et piste de cross.
  for (const p of PATHS) line(p, 3.2, '#a88d68');
  line(XC_PATH, 5, '#9c8460');
  ctx.fillStyle = '#5d6b55';
  ctx.beginPath();
  ctx.arc(px(POND.x), pz(POND.z), (POND.r + 1.5) * S, 0, Math.PI * 2);
  ctx.fill();

  // Sous-couche des routes.
  for (const r of ROADS) line(r.pts, r.w + 1.4, '#5b5c5e');

  __m('overlays');
  return cv;
}

export function makeTerrainTexture(terrain, size) {
  const cv = paintTerrainCanvas(terrain, size);
  const splatData = gradeAndClassify(cv);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  // Données brutes (pas de canvas : l'alpha prémultiplié détruirait les canaux indépendants).
  const half = size >> 1;
  const splat = new THREE.DataTexture(splatData, half, half, THREE.RGBAFormat);
  splat.colorSpace = THREE.NoColorSpace;
  splat.generateMipmaps = true;
  splat.minFilter = THREE.LinearMipmapLinearFilter;
  splat.magFilter = THREE.LinearFilter;
  splat.needsUpdate = true;
  return { texture: tex, canvas: cv, splat, splatData, splatSize: half };
}

// Étalonnage réaliste des couleurs peintes (albédos naturels, moins saturés) et carte des matériaux du sol :
// R = herbe, G = terre (labours, chemins, cultures), B = sable (plage, carrières, piste), A = sol dur (gravier, pavés, bitume).
// Couleurs sources de la peinture et leur matériau (0 herbe, 1 culture, 2 terre, 3 sable, 4 gravier/pavés, 5 bitume).
const GROUND_REFS = [
  [0, '#6f9e4f #77a653 #679849 #80ad5b #8db863 #93bd68 #73a252 #4d6e38 #7fa65a #7aa957 #74a552 #79a955 #80b05b #8fb26a #7fb455 #86b35e #5d6b55'],
  [1, '#d3bf78 #cdb56a #dcc843 #e2d052'],
  [2, '#8f7253 #84694b #a88d68 #9c8460'],
  [3, '#e7d7ae #c4b38a #a89a72 #e9dcc0 #ecdfc3 #e3d4b4 #c9ad82 #c6ad86 #c9b08a #c0a881'],
  [4, '#cdbf9d #d4c7a8 #d3c7aa #b9b3a7 #d3cbbb #c7bfae #c8c1b3 #e4e0d4 #a19d92'],
  [5, '#5b5c5e'],
];
let groundLut = null;
function groundClassLut() {
  if (groundLut) return groundLut;
  const refs = [];
  for (const [cls, list] of GROUND_REFS) for (const hex of list.split(' ')) refs.push([...hexToRgb(hex), cls]);
  groundLut = new Uint8Array(32768);
  for (let q = 0; q < 32768; q++) {
    const r = ((q >> 10) & 31) * 8 + 4, g = ((q >> 5) & 31) * 8 + 4, b = (q & 31) * 8 + 4;
    let best = 1e9, cls = 0;
    for (const f of refs) {
      const dd = (f[0] - r) ** 2 + (f[1] - g) ** 2 + (f[2] - b) ** 2;
      if (dd < best) { best = dd; cls = f[3]; }
    }
    groundLut[q] = cls;
  }
  return groundLut;
}

function gradeAndClassify(cv) {
  const size = cv.width;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  const lut = groundClassLut();
  const out = new Uint8Array(size * size * 4);
  for (let k = 0; k < d.length; k += 4) {
    let r = d[k], g = d[k + 1], b = d[k + 2];
    const cls = lut[((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)];
    const lum = 0.3 * r + 0.59 * g + 0.11 * b;
    let wG = 0, wS = 0, wA = 0, wH = 0;
    if (cls === 0) {
      // Prairie normande : vert olive, moins saturé et plus sombre que la peinture d'origine.
      wG = 1;
      r = (lum + (r - lum) * 0.78) * 0.8 + 6;
      g = (lum + (g - lum) * 0.78) * 0.8 + 2;
      b = (lum + (b - lum) * 0.7) * 0.72;
    } else if (cls === 1) {
      wS = 0.55; wG = 0.45; // chaume / culture mûre
      r *= 0.86; g *= 0.82; b *= 0.76;
    } else if (cls === 2) {
      wS = 1;
      r *= 0.8; g *= 0.78; b *= 0.76;
    } else if (cls === 3) {
      wA = 1;
      r *= 0.9; g *= 0.89; b *= 0.86;
    } else {
      wH = 1;
      const k2 = cls === 5 ? 0.72 : 0.86;
      r *= k2; g *= k2; b *= k2 * 0.98;
    }
    d[k] = r; d[k + 1] = g; d[k + 2] = b;
    out[k] = wG * 255; out[k + 1] = wS * 255; out[k + 2] = wA * 255; out[k + 3] = wH * 255;
  }
  ctx.putImageData(img, 0, 0);
  // Demi-résolution (moyenne 2×2), lignes inversées pour suivre l'orientation de la texture du canvas.
  const half = size >> 1;
  const sp = new Uint8Array(half * half * 4);
  for (let j = 0; j < half; j++) {
    const dst = (half - 1 - j) * half * 4;
    for (let i = 0; i < half; i++) {
      const a = ((2 * j) * size + 2 * i) * 4, c = a + size * 4;
      for (let ch = 0; ch < 4; ch++) sp[dst + i * 4 + ch] = (out[a + ch] + out[a + 4 + ch] + out[c + ch] + out[c + 4 + ch]) >> 2;
    }
  }
  return sp;
}

// Bruit cellulaire périodique (distance au point le plus proche) : galets, mottes, grains.
function periodicWorley(size, cells, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pts = new Float32Array(cells * cells * 2).map(() => rnd());
  const out = new Float32Array(size * size);
  const cs = size / cells;
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const cx = Math.floor(i / cs), cy = Math.floor(j / cs);
      let best = 1e9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox, gy = cy + oy;
          const wx = ((gx % cells) + cells) % cells, wy = ((gy % cells) + cells) % cells;
          const px = (gx + pts[(wy * cells + wx) * 2]) * cs, py = (gy + pts[(wy * cells + wx) * 2 + 1]) * cs;
          const dd = (px - i) * (px - i) + (py - j) * (py - j);
          if (dd < best) best = dd;
        }
      }
      out[j * size + i] = Math.min(1, Math.sqrt(best) / cs);
    }
  }
  return out;
}

// Texture de détail du sol (répétable) : R grain fin, G variation moyenne, B cellules (galets/mottes), A touffes d'herbe.
export function makeGroundDetail(size = 256) {
  const n1 = periodicNoise(size, 16, 7), n2 = periodicNoise(size, 32, 13), n3 = periodicNoise(size, 64, 17);
  const m1 = periodicNoise(size, 4, 19), m2 = periodicNoise(size, 8, 23);
  const w = periodicWorley(size, 24, 29);
  const t1 = periodicNoise(size, 48, 31), t2 = periodicNoise(size, 96, 37);
  const data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    data[k * 4] = clamp((n1[k] * 0.25 + n2[k] * 0.35 + n3[k] * 0.4) * 255, 0, 255);
    data[k * 4 + 1] = clamp((m1[k] * 0.6 + m2[k] * 0.4) * 255, 0, 255);
    data[k * 4 + 2] = clamp(w[k] * 255, 0, 255);
    data[k * 4 + 3] = clamp(smoothstep(0.35, 0.75, t1[k] * 0.55 + t2[k] * 0.45) * 255, 0, 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// Bruit de valeur périodique (texture répétable sans couture).
function periodicNoise(size, cells, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = new Float32Array(cells * cells).map(() => rnd());
  const out = new Float32Array(size * size);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const fx = (i / size) * cells;
      const fy = (j / size) * cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (x, y) => g[(y % cells) * cells + (x % cells)];
      const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
      out[j * size + i] = a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
    }
  }
  return out;
}

export function makeDetailTexture(size = 128) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(size, size);
  const o1 = periodicNoise(size, 8, 7);
  const o2 = periodicNoise(size, 16, 13);
  const o3 = periodicNoise(size, 32, 17);
  const o4 = periodicNoise(size, 4, 19);
  for (let k = 0; k < size * size; k++) {
    const v = o1[k] * 0.45 + o2[k] * 0.35 + o3[k] * 0.2;
    img.data[k * 4] = clamp(v * 255, 0, 255);
    img.data[k * 4 + 1] = clamp((o4[k] * 0.7 + o1[k] * 0.3) * 255, 0, 255);
    img.data[k * 4 + 2] = 128;
    img.data[k * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(cv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
