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
  rect(HOME.arena, '#e9dcc0', 2);
  rect(HOME.paddock, '#79a955', 2);
  rect(HARAS.court, '#d4c7a8', 4);
  for (const p of HARAS.paddocks) rect(p, '#80b05b', 2);
  rect({ x: POLE.arena.x, z: POLE.arena.z - 8, w: 210, d: 104 }, '#8fb26a', 6);
  rect(POLE.arena, '#ecdfc3', 2);
  rect(POLE.warmup, '#e3d4b4', 2);
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
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  return { texture: tex, canvas: cv };
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
