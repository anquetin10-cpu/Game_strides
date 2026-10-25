// Arbres procéduraux : squelette (tronc, charpentières, rameaux) en tubes effilés texturés d'écorce,
// feuillage en cartes de rameaux (normales « en couronne » pour un volume doux), occlusion et poids de vent par sommet.
import * as THREE from 'three';
import { mulberry32, clamp, lerp, smoothstep } from '../core/math.js';
import { LEAF, leafCell } from './vegTextures.js';

const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const X = new V3(1, 0, 0);
const DEG = Math.PI / 180;

// Essences : hauteur à l'échelle 1 (m), tronc, deux niveaux de branches, feuillage.
// env : profil de longueur des charpentières le long du tronc (silhouette du houppier).
export const SPECIES = {
  oak: {
    variants: 4, bark: 'fissured', tint: [0.86, 0.8, 0.74], H: 15,
    trunk: { r: 0.5, leader: 0.62, gnarl: 0.09, lean: 0.05, segs: 6, radial: 9 },
    L1: { n: [6, 8], t: [0.3, 1], ang: [34, 80], len: [0.36, 0.48], env: 'dome', r: 0.6, up: 0.06, gnarl: 0.34, segs: 5, radial: 6 },
    L2: { n: [4, 6], t: [0.2, 1], ang: [35, 70], len: [0.42, 0.64], r: 0.5, up: 0.04, gnarl: 0.36, segs: 3, radial: 4 },
    leaves: { per: 7, t0: 0.18, size: [1.9, 2.6], cells: [LEAF.oak, LEAF.oak2], up: 0.15, onL1: 3, tint: [1, 1, 1] },
  },
  beech: {
    variants: 3, bark: 'smooth', tint: [0.82, 0.84, 0.82], H: 19,
    trunk: { r: 0.42, leader: 0.86, gnarl: 0.03, lean: 0.02, segs: 8, radial: 8 },
    L1: { n: [10, 13], t: [0.34, 0.96], ang: [38, 72], len: [0.28, 0.4], env: 'dome', r: 0.42, up: 0.04, gnarl: 0.2, segs: 4, radial: 5 },
    L2: { n: [4, 6], t: [0.3, 1], ang: [45, 70], len: [0.4, 0.6], r: 0.5, up: 0.0, gnarl: 0.22, segs: 3, radial: 3, side: true },
    leaves: { per: 6, t0: 0.2, size: [1.7, 2.3], cells: [LEAF.beech, LEAF.beech2], up: 0.1, flat: 0.55, onL1: 3, tint: [1, 1, 1] },
  },
  ash: {
    variants: 2, bark: 'fissured', tint: [0.9, 0.88, 0.84], H: 18,
    trunk: { r: 0.38, leader: 0.72, gnarl: 0.05, lean: 0.03, segs: 7, radial: 8 },
    L1: { n: [8, 10], t: [0.42, 1], ang: [26, 52], len: [0.32, 0.42], env: 'oval', r: 0.5, up: 0.08, gnarl: 0.22, segs: 5, radial: 5 },
    L2: { n: [3, 5], t: [0.3, 1], ang: [30, 55], len: [0.35, 0.5], r: 0.5, up: 0.06, gnarl: 0.25, segs: 3, radial: 3 },
    leaves: { per: 6, t0: 0.25, size: [1.9, 2.5], cells: [LEAF.ash], up: 0.2, onL1: 2, tint: [1, 1, 1] },
  },
  poplar: {
    variants: 2, bark: 'fissured', tint: [0.78, 0.76, 0.72], H: 24,
    trunk: { r: 0.42, leader: 0.97, gnarl: 0.02, lean: 0.01, segs: 10, radial: 8 },
    L1: { n: [26, 32], t: [0.1, 0.97], ang: [10, 22], len: [0.1, 0.16], env: 'spindle', r: 0.34, up: 0.045, gnarl: 0.12, segs: 3, radial: 4 },
    L2: { n: [2, 3], t: [0.4, 1], ang: [14, 28], len: [0.3, 0.5], r: 0.5, up: 0.04, gnarl: 0.15, segs: 2, radial: 3 },
    leaves: { per: 4, t0: 0.25, size: [1.5, 2.0], cells: [LEAF.poplar], up: 0.55, onL1: 3, tint: [1, 1, 1] },
  },
  birch: {
    variants: 3, bark: 'birch', tint: [1, 1, 1], H: 15,
    trunk: { r: 0.22, leader: 0.92, gnarl: 0.05, lean: 0.05, segs: 8, radial: 7 },
    L1: { n: [10, 14], t: [0.3, 0.95], ang: [40, 65], len: [0.18, 0.27], env: 'oval', r: 0.36, up: -0.015, gnarl: 0.2, segs: 4, radial: 4 },
    L2: { n: [3, 4], t: [0.3, 1], ang: [55, 95], len: [0.4, 0.62], r: 0.5, up: -0.11, gnarl: 0.2, segs: 3, radial: 3 },
    leaves: { per: 5, t0: 0.2, size: [1.3, 1.8], cells: [LEAF.birch], up: -0.55, onL1: 2, tint: [1.04, 1.04, 0.96] },
  },
  pine: {
    variants: 3, bark: 'pine', tint: [0.9, 0.86, 0.84], H: 17,
    trunk: { r: 0.32, leader: 0.9, gnarl: 0.07, lean: 0.07, segs: 9, radial: 8 },
    L1: { n: [14, 18], t: [0.5, 1], ang: [62, 88], len: [0.14, 0.25], env: 'umbrella', r: 0.34, up: 0.06, gnarl: 0.26, segs: 4, radial: 4 },
    L2: { n: [3, 5], t: [0.3, 1], ang: [25, 50], len: [0.3, 0.45], r: 0.5, up: 0.05, gnarl: 0.2, segs: 2, radial: 3 },
    leaves: { per: 3, t0: 0.4, size: [1.3, 1.8], cells: [LEAF.pine], up: 0.6, tuft: 4, onL1: 1, tint: [1, 1, 1] },
  },
  apple: {
    variants: 4, bark: 'fissured', tint: [0.85, 0.82, 0.78], H: 6.5,
    trunk: { r: 0.17, leader: 0, len: 0.3, gnarl: 0.12, lean: 0.1, segs: 3, radial: 7 },
    L1: { n: [4, 5], t: [0.86, 1], ang: [38, 62], len: [0.45, 0.56], env: 'flat', r: 0.62, up: 0.0, gnarl: 0.42, segs: 4, radial: 5 },
    L2: { n: [4, 6], t: [0.25, 1], ang: [40, 80], len: [0.35, 0.55], r: 0.5, up: -0.03, gnarl: 0.4, segs: 3, radial: 3 },
    leaves: { per: 5, t0: 0.2, size: [1.2, 1.6], cells: [LEAF.apple], fruit: LEAF.appleFruit, up: 0.1, onL1: 2, tint: [1, 1, 1] },
  },
  bush: {
    variants: 3, bark: 'smooth', tint: [0.62, 0.56, 0.5], H: 3,
    trunk: { r: 0.07, stems: [4, 7], gnarl: 0.15, segs: 3, radial: 4 },
    L1: { n: [0, 0], ang: [8, 42], len: [0.7, 1.0], r: 1, up: 0.02, gnarl: 0.3, segs: 3, radial: 4 },
    L2: { n: [3, 5], t: [0.25, 1], ang: [30, 60], len: [0.4, 0.6], r: 0.55, up: 0.02, gnarl: 0.3, segs: 2, radial: 3 },
    leaves: { per: 5, t0: 0.15, size: [1.0, 1.4], cells: [LEAF.hawthorn, LEAF.hazel], byVariant: true, up: 0.2, onL1: 2, tint: [1, 1, 1] },
  },
  pollard: {
    variants: 2, bark: 'fissured', tint: [0.8, 0.76, 0.7], H: 9,
    trunk: { r: 0.46, leader: 0, len: 0.32, gnarl: 0.05, lean: 0.03, segs: 4, radial: 9, knob: 1.35 },
    L1: { n: [9, 14], t: [0.94, 1], ang: [6, 40], len: [0.45, 0.66], env: 'flat', r: 0.24, up: 0.03, gnarl: 0.1, segs: 3, radial: 3 },
    L2: { n: [2, 3], t: [0.4, 1], ang: [25, 45], len: [0.28, 0.4], r: 0.5, up: 0.03, gnarl: 0.2, segs: 2, radial: 3 },
    leaves: { per: 4, t0: 0.3, size: [1.4, 1.9], cells: [LEAF.oak, LEAF.ash], byVariant: true, up: 0.3, onL1: 2, tint: [1, 1, 1] },
  },
};

// Profil de longueur des charpentières (u : position relative dans la zone de ramification).
function envelope(kind, u) {
  switch (kind) {
    case 'dome': return 1 - 0.55 * u * u;
    case 'oval': return Math.pow(Math.sin(Math.PI * (0.12 + 0.88 * u)), 0.7) * 0.85 + 0.15;
    case 'spindle': return Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + 0.94 * Math.pow(u, 0.8))), 0.9) * 0.9 + 0.1;
    case 'umbrella': return 0.55 + 0.45 * Math.sin(Math.PI * (0.25 + 0.6 * u));
    default: return 1;
  }
}

// ---------- Accumulateur de géométrie ----------
class Geo {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.c = [];
    this.w = [];
    this.i = [];
  }
  get count() {
    return this.p.length / 3;
  }
  v(p, n, u, v, c, w) {
    this.p.push(p.x, p.y, p.z);
    this.n.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    this.c.push(c[0], c[1], c[2]);
    this.w.push(w[0], w[1], w[2], w[3]);
    return this.count - 1;
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setAttribute('aWind', new THREE.Float32BufferAttribute(this.w, 4));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ---------- Squelette ----------
function grow(list, p0, dir, len, r0, r1, o, rnd) {
  const pts = [p0.clone()];
  const rads = [r0];
  const d = dir.clone().normalize();
  const p = p0.clone();
  const step = len / o.segs;
  for (let i = 1; i <= o.segs; i++) {
    d.x += (rnd() - 0.5) * o.gnarl;
    d.z += (rnd() - 0.5) * o.gnarl;
    d.y += (rnd() - 0.5) * o.gnarl * 0.5 + o.up;
    d.normalize();
    p.addScaledVector(d, step);
    pts.push(p.clone());
    rads.push(lerp(r0, r1, Math.pow(i / o.segs, 0.9)));
  }
  const b = { pts, rads, len, level: o.level, radial: o.radial, phase: o.phase, flex0: o.flex0, flex1: o.flex1 };
  list.push(b);
  return b;
}

// Point, direction, rayon et souplesse au paramètre t ∈ [0, 1] d'une branche.
function at(b, t) {
  const n = b.pts.length - 1;
  const f = clamp(t, 0, 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const k = f - i;
  const p = b.pts[i].clone().lerp(b.pts[i + 1], k);
  const d = b.pts[i + 1].clone().sub(b.pts[i]).normalize();
  return { p, d, r: lerp(b.rads[i], b.rads[i + 1], k), flex: lerp(b.flex0, b.flex1, t) };
}

// Direction inclinée de theta par rapport à pd, azimut phi (0 = côté horizontal, PI/2 = vers le haut).
function tilt(pd, theta, phi) {
  const a = Math.abs(pd.y) < 0.96 ? UP : X;
  const side = new V3().crossVectors(pd, a).normalize();
  const upw = new V3().crossVectors(side, pd).normalize();
  const off = side.multiplyScalar(Math.cos(phi)).addScaledVector(upw, Math.sin(phi));
  return pd.clone().multiplyScalar(Math.cos(theta)).addScaledVector(off, Math.sin(theta)).normalize();
}

const rr = (rnd, [a, b]) => a + rnd() * (b - a);

function skeleton(sp, rnd) {
  const H = sp.H;
  const T = sp.trunk;
  const branches = [];
  const terminals = [];
  const L1 = [];
  const lean = new V3((rnd() - 0.5) * 2 * (T.lean || 0), 1, (rnd() - 0.5) * 2 * (T.lean || 0)).normalize();
  let trunk = null;
  if (T.stems) {
    // Cépée : plusieurs tiges depuis le sol.
    const n = Math.round(rr(rnd, T.stems));
    for (let k = 0; k < n; k++) {
      const phi = (k / n) * Math.PI * 2 + rnd() * 0.6;
      const th = rr(rnd, sp.L1.ang) * DEG;
      const dir = new V3(Math.sin(th) * Math.cos(phi), Math.cos(th), Math.sin(th) * Math.sin(phi));
      const len = H * rr(rnd, sp.L1.len);
      const b = grow(branches, new V3(Math.cos(phi) * 0.15, -0.2, Math.sin(phi) * 0.15), dir, len, T.r * (0.7 + rnd() * 0.5), T.r * 0.25, { ...sp.L1, level: 1, phase: rnd(), flex0: 0, flex1: 0.45 }, rnd);
      L1.push(b);
    }
  } else {
    const len = T.leader ? H * T.leader : H * T.len;
    trunk = grow(branches, new V3(0, -0.45, 0), lean, len + 0.45, T.r * 1.18, T.leader ? T.r * 0.12 : T.r * 0.78, { segs: T.segs, gnarl: T.gnarl, up: 0.012, radial: T.radial, level: 0, phase: 0, flex0: 0, flex1: T.leader ? 0.25 : 0 }, rnd);
    // Empattement : premier anneau élargi.
    trunk.rads[0] = T.r * 1.45;
    if (T.knob) trunk.rads[trunk.rads.length - 1] = T.r * T.knob;
    const P = sp.L1;
    const n = Math.round(rr(rnd, P.n));
    let phi = rnd() * Math.PI * 2;
    for (let k = 0; k < n; k++) {
      const u = n > 1 ? (k + 0.3 + rnd() * 0.4) / n : 0.5;
      const t = lerp(P.t[0], P.t[1], u);
      phi += 2.39996 + (rnd() - 0.5) * 0.6;
      const a = at(trunk, t);
      const theta = lerp(P.ang[1], P.ang[0], u) * DEG + (rnd() - 0.5) * 10 * DEG;
      const dir = new V3(Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi));
      const len = H * rr(rnd, P.len) * envelope(P.env, u);
      const r0 = Math.max(0.03, a.r * P.r);
      const start = a.p.clone().addScaledVector(dir, -a.r * 0.4);
      L1.push(grow(branches, start, dir, len, r0, r0 * 0.3, { ...P, level: 1, phase: rnd(), flex0: a.flex, flex1: a.flex + 0.4 }, rnd));
    }
  }
  // Rameaux secondaires.
  const P2 = sp.L2;
  for (const b of L1) {
    const n = Math.round(rr(rnd, P2.n));
    let side = rnd() < 0.5 ? 1 : -1;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.3 + rnd() * 0.4) / n;
      const t = lerp(P2.t[0], P2.t[1], u);
      const a = at(b, t);
      side = -side;
      const phi = P2.side ? (side > 0 ? 0 : Math.PI) + (rnd() - 0.5) * 0.7 : (side > 0 ? 0.35 : Math.PI - 0.35) + (rnd() - 0.5) * 1.6;
      const dir = tilt(a.d, rr(rnd, P2.ang) * DEG, phi);
      const len = b.len * rr(rnd, P2.len) * (1 - u * 0.35);
      const r0 = Math.max(0.018, a.r * P2.r);
      const c = grow(branches, a.p.clone().addScaledVector(dir, -a.r * 0.3), dir, len, r0, r0 * 0.35, { ...P2, level: 2, phase: b.phase + rnd() * 0.15, flex0: a.flex, flex1: a.flex + 0.45 }, rnd);
      terminals.push(c);
    }
    if (!n) terminals.push(b);
  }
  return { branches, terminals, L1, trunk };
}

// ---------- Feuillage ----------
function cards(sp, sk, rnd, variant) {
  const Lf = sp.leaves;
  const out = [];
  let cells = Lf.cells;
  if (Lf.byVariant) cells = [Lf.cells[variant % Lf.cells.length]];
  const fruit = Lf.fruit !== undefined && variant % 2 === 1;
  const add = (b, t, sizeK = 1) => {
    const a = at(b, t);
    const phi = rnd() * Math.PI * 2;
    const out1 = tilt(a.d, (50 + rnd() * 50) * DEG, phi);
    const up = a.d.clone().multiplyScalar(0.55).addScaledVector(out1, 0.8);
    up.y += Lf.up + (rnd() - 0.5) * 0.3;
    up.normalize();
    // Normale de la carte : aléatoire autour de l'axe, à plat pour les essences à rameaux étagés.
    let nrm = tilt(up, Math.PI / 2, rnd() * Math.PI * 2);
    if (Lf.flat) nrm.lerp(UP, Lf.flat).normalize();
    const right = new V3().crossVectors(up, nrm).normalize();
    nrm = new V3().crossVectors(right, up).normalize();
    const size = rr(rnd, Lf.size) * sizeK * (0.8 + t * 0.3);
    const cell = fruit && rnd() < 0.3 ? Lf.fruit : cells[Math.floor(rnd() * cells.length)];
    out.push({ base: a.p.clone().addScaledVector(up, -size * 0.08), up, right, nrm, size, cell, flex: a.flex + 0.1, phase: b.phase });
  };
  for (const b of sk.terminals) {
    const n = Lf.per;
    for (let i = 0; i < n; i++) add(b, Lf.t0 + (1 - Lf.t0) * ((i + rnd() * 0.9) / n));
    add(b, 1, 1.05);
    if (Lf.tuft) for (let k = 0; k < Lf.tuft; k++) add(b, 0.97, 0.9);
  }
  for (const b of sk.L1) for (let i = 0; i < (Lf.onL1 || 0); i++) add(b, 0.45 + rnd() * 0.5, 0.95);
  return out;
}

// ---------- Maillage ----------
function tube(g, b, H, crown, tint) {
  const R = b.radial;
  const pts = b.pts;
  const n = pts.length;
  const r0 = b.rads[0];
  const uRep = Math.max(1, Math.round((2 * Math.PI * r0) / 0.6));
  const tileH = ((2 * Math.PI * r0) / uRep) * 2;
  let N = null;
  let vAcc = 0;
  const base = g.count;
  const T = new V3(), B = new V3(), dir = new V3(), pos = new V3();
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(n - 1, i + 1)];
    T.copy(c).sub(a).normalize();
    if (!N) N = tilt(T, Math.PI / 2, 0);
    N.addScaledVector(T, -N.dot(T)).normalize();
    B.crossVectors(T, N);
    if (i > 0) vAcc += pts[i].distanceTo(pts[i - 1]) / tileH;
    const r = b.rads[i];
    const flex = lerp(b.flex0, b.flex1, i / (n - 1));
    const p = pts[i];
    const w = [Math.pow(clamp(p.y / H, 0, 1), 1.6), b.level === 0 ? flex * 0.5 : flex, b.phase, 0];
    // Occlusion : intérieur du houppier et pied du tronc plus sombres.
    const e = crown ? crownDist(p, crown) : 1;
    const ao = (0.5 + 0.5 * smoothstep(0.1, 1.05, e)) * (0.72 + 0.28 * smoothstep(-0.3, 1.4, p.y));
    const col = [tint[0] * ao, tint[1] * ao, tint[2] * ao];
    for (let k = 0; k <= R; k++) {
      const th = (k / R) * Math.PI * 2;
      dir.copy(N).multiplyScalar(Math.cos(th)).addScaledVector(B, Math.sin(th));
      pos.copy(p).addScaledVector(dir, r);
      g.v(pos, dir, (k / R) * uRep, vAcc, col, w);
    }
  }
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < R; k++) {
      const a = base + i * (R + 1) + k, b2 = a + R + 1;
      g.i.push(a, b2, a + 1, a + 1, b2, b2 + 1);
    }
  }
}

function crownDist(p, c) {
  const dx = (p.x - c.cx) / c.rh, dy = (p.y - c.cy) / c.rv, dz = (p.z - c.cz) / c.rh;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

// Ellipsoïde du houppier à partir des cartes (centre, rayons horizontal et vertical).
function crownOf(list) {
  let cx = 0, cy = 0, cz = 0;
  for (const c of list) {
    cx += c.base.x + c.up.x * c.size * 0.5;
    cy += c.base.y + c.up.y * c.size * 0.5;
    cz += c.base.z + c.up.z * c.size * 0.5;
  }
  cx /= list.length; cy /= list.length; cz /= list.length;
  const hs = [], vs = [];
  for (const c of list) {
    const x = c.base.x + c.up.x * c.size * 0.5 - cx, y = c.base.y + c.up.y * c.size * 0.5 - cy, z = c.base.z + c.up.z * c.size * 0.5 - cz;
    hs.push(Math.hypot(x, z));
    vs.push(Math.abs(y));
  }
  hs.sort((a, b) => a - b);
  vs.sort((a, b) => a - b);
  const q = (arr) => arr[Math.floor(arr.length * 0.9)] || 1;
  return { cx, cy, cz, rh: q(hs) * 1.08 + 0.3, rv: q(vs) * 1.08 + 0.3 };
}

function leafMesh(g, list, crown, tint, cellUV, rnd) {
  const cn = new V3(), nn = new V3(), p = new V3();
  for (const c of list) {
    const [u0, v0, u1, v1] = cellUV(c.cell);
    const k = 0.86 + rnd() * 0.26;
    const corners = [[-0.5, 0, u0, v0], [0.5, 0, u1, v0], [0.5, 1, u1, v1], [-0.5, 1, u0, v1]];
    const idx = [];
    for (const [sx, sy, u, v] of corners) {
      p.copy(c.base).addScaledVector(c.right, sx * c.size).addScaledVector(c.up, sy * c.size);
      // Normale : surtout celle de l'ellipsoïde du houppier, un peu celle de la carte (orientée vers l'extérieur).
      cn.set((p.x - crown.cx) / (crown.rh * crown.rh), (p.y - crown.cy) / (crown.rv * crown.rv), (p.z - crown.cz) / (crown.rh * crown.rh)).normalize();
      nn.copy(c.nrm);
      if (nn.dot(cn) < 0) nn.negate();
      nn.multiplyScalar(0.35).add(cn).normalize();
      const e = crownDist(p, crown);
      const ao = (0.42 + 0.58 * smoothstep(0.1, 1.0, e)) * (0.78 + 0.22 * smoothstep(-0.9, 0.5, (p.y - crown.cy) / crown.rv)) * k;
      idx.push(g.v(p, nn, u, v, [tint[0] * ao, tint[1] * ao, tint[2] * ao], [Math.pow(clamp(p.y / crown.H, 0, 1), 1.6), c.flex, c.phase, sy]));
    }
    g.i.push(idx[0], idx[1], idx[2], idx[0], idx[2], idx[3]);
  }
}

const cache = new Map();

// Variante d'une essence : { wood, leaves, H, R, bark } (géométries locales, base au sol en 0).
export function treeVariant(kind, variant) {
  const key = `${kind}:${variant}`;
  if (cache.has(key)) return cache.get(key);
  const sp = SPECIES[kind];
  const rnd = mulberry32(1000 + Object.keys(SPECIES).indexOf(kind) * 97 + variant * 13);
  const sk = skeleton(sp, rnd);
  const list = cards(sp, sk, rnd, variant);
  const crown = crownOf(list);
  crown.H = sp.H;
  const wood = new Geo();
  for (const b of sk.branches) tube(wood, b, sp.H, b.level === 0 ? null : crown, sp.tint);
  const leaves = new Geo();
  leafMesh(leaves, list, crown, sp.leaves.tint, leafCell, rnd);
  const wg = wood.build();
  const lg = leaves.build();
  // Ombre portée du feuillage : 40 % des cartes, agrandies (moins de couches à dessiner dans la carte d'ombre).
  const shadow = new Geo();
  const sub = list.filter((c, i) => i % 5 < 2).map((c) => ({ ...c, size: c.size * 1.35, base: c.base.clone().addScaledVector(c.up, -c.size * 0.12) }));
  leafMesh(shadow, sub, crown, sp.leaves.tint, leafCell, mulberry32(7));
  const sg = shadow.build();
  let R = 0, H = 0;
  for (const g of [wg, lg]) {
    const pa = g.attributes.position;
    for (let i = 0; i < pa.count; i++) {
      R = Math.max(R, Math.hypot(pa.getX(i), pa.getZ(i)));
      H = Math.max(H, pa.getY(i));
    }
  }
  const res = { kind, variant, wood: wg, leaves: lg, shadow: sg, H, R, bark: sp.bark, crown };
  cache.set(key, res);
  return res;
}
