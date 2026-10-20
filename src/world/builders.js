// Primitives de décor : bâtiments, clôtures, haies, arbres, mobilier.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { box, cyl, cone, ico, gableRoof, hipRoof, paint, transformed, prep, limb } from './shapes.js';

export const PALETTE = {
  walls: ['#efe6d2', '#ebe0cc', '#f3eee4', '#e3d3bb', '#d8c0a0'],
  brick: ['#b9765a', '#a86a50', '#c08060'],
  roofs: ['#4a4f57', '#565a61', '#5d4a42', '#7d5242'],
  timber: '#4a3427',
  ink: '#1b1c1f',
  white: '#f2f1ec',
  wood: '#9b7650',
  darkWood: '#5b4330',
  glass: '#2d3c4b',
  glassLit: '#3a4a5a',
};

// Part = [geometry, color, transform]
function partsToGeo(parts) {
  const geos = [];
  for (const [g, color, tf] of parts) {
    const t = tf ? transformed(g, tf) : g.clone();
    paint(t, color);
    geos.push(t);
  }
  return mergeGeometries(geos, false);
}

/**
 * Bâtiment générique, façade principale vers +Z (local).
 * Retourne { body, glass } (géométries locales peintes).
 */
export function buildingGeo({
  w, d, h, wall = PALETTE.walls[0], roof = PALETTE.roofs[0], roofType = 'gable', roofH = null,
  timber = false, floors = null, windows = true, door = true, doorColor = '#3b2f28', plinth = '#8f8a80', trim = null, chimney = false,
}) {
  const body = [];
  const glass = [];
  const fl = floors ?? Math.max(1, Math.floor(h / 3));
  body.push([box(w, h + 2, d), wall, { y: -2 }]);
  body.push([box(w + 0.2, 2.6, d + 0.2), plinth, { y: -2 }]);
  const rh = roofH ?? Math.min(w, d) * 0.45;
  const along = w >= d;
  if (roofType === 'gable') body.push([gableRoof(along ? w : d, rh, along ? d : w, 0.5), roof, { y: h, ry: along ? 0 : Math.PI / 2 }]);
  else if (roofType === 'hip') body.push([hipRoof(along ? w : d, rh, along ? d : w, 0.5), roof, { y: h, ry: along ? 0 : Math.PI / 2 }]);
  else {
    body.push([box(w + 0.3, 0.5, d + 0.3), roof, { y: h }]);
  }
  if (trim) body.push([box(w + 0.15, 0.25, d + 0.15), trim, { y: h - 0.25 }]);
  if (chimney) body.push([box(0.9, rh + 1.4, 0.9), PALETTE.brick[0], { x: w * 0.28, y: h, z: -d * 0.12 }]);
  const fh = h / fl;
  const facades = [
    { len: w, nx: 0, nz: 1, off: d / 2, ry: 0 },
    { len: w, nx: 0, nz: -1, off: d / 2, ry: Math.PI },
    { len: d, nx: 1, nz: 0, off: w / 2, ry: Math.PI / 2 },
    { len: d, nx: -1, nz: 0, off: w / 2, ry: -Math.PI / 2 },
  ];
  facades.forEach((f, fi) => {
    const cols = Math.max(1, Math.floor(f.len / 3.4));
    const span = f.len / cols;
    for (let fl2 = 0; fl2 < fl; fl2++) {
      for (let c = 0; c < cols; c++) {
        const t = -f.len / 2 + span * (c + 0.5);
        const isDoor = door && fi === 0 && fl2 === 0 && c === Math.floor(cols / 2);
        const wy = fl2 * fh + (isDoor ? 0 : fh * 0.32);
        const wh = isDoor ? Math.min(2.4, fh * 0.8) : Math.min(1.5, fh * 0.48);
        const ww = isDoor ? 1.5 : Math.min(1.2, span * 0.45);
        const x = f.nx === 0 ? t * (f.nz > 0 ? 1 : -1) : f.nx * (f.off + 0.04);
        const z = f.nz === 0 ? t * (f.nx > 0 ? -1 : 1) : f.nz * (f.off + 0.04);
        const tf = { x, y: wy, z, ry: f.ry };
        if (isDoor) body.push([box(ww, wh, 0.14), doorColor, tf]);
        else if (windows) {
          body.push([box(ww + 0.24, wh + 0.24, 0.1), trim || PALETTE.white, { ...tf, y: wy - 0.12 }]);
          glass.push([box(ww, wh, 0.16), PALETTE.glass, tf]);
        }
        if (timber && c < cols) {
          const bx = f.nx === 0 ? (t - span / 2) * (f.nz > 0 ? 1 : -1) : f.nx * (f.off + 0.05);
          const bz = f.nz === 0 ? (t - span / 2) * (f.nx > 0 ? -1 : 1) : f.nz * (f.off + 0.05);
          if (c > 0) body.push([box(0.22, fh, 0.12), PALETTE.timber, { x: bx, y: fl2 * fh, z: bz, ry: f.ry }]);
        }
      }
      if (timber) {
        const bx = f.nx * (f.off + 0.05);
        const bz = f.nz * (f.off + 0.05);
        body.push([box(f.len, 0.22, 0.12), PALETTE.timber, { x: bx, y: fl2 * fh + fh - 0.11, z: bz, ry: f.ry }]);
        if (fl2 === 0) body.push([box(f.len, 0.22, 0.12), PALETTE.timber, { x: bx, y: 0.6, z: bz, ry: f.ry }]);
        // Croix de Saint-André décoratives à l'étage.
        if (fl2 > 0) {
          const cols2 = Math.max(1, Math.floor(f.len / 3.4));
          const span2 = f.len / cols2;
          for (let c = 0; c < cols2; c++) {
            const t = -f.len / 2 + span2 * (c + 0.5);
            const lx = f.nx === 0 ? t * (f.nz > 0 ? 1 : -1) : f.nx * (f.off + 0.06);
            const lz = f.nz === 0 ? t * (f.nx > 0 ? -1 : 1) : f.nz * (f.off + 0.06);
            const lowY = fl2 * fh + 0.1;
            body.push([box(0.16, fh * 0.32, 0.1), PALETTE.timber, { x: lx, y: lowY, z: lz, ry: f.ry, rz: 0.6 }]);
          }
        }
      }
    }
  });
  return { body: partsToGeo(body), glass: glass.length ? partsToGeo(glass) : null };
}

// Écurie : rangée de boxes ouvrant vers +Z.
export function stableGeo({ w, d, h = 4.2, boxes = 8, wall = '#26272b', trim = PALETTE.white, roof = '#3a3d42', door = '#3c3f45' }) {
  const parts = [];
  const glass = [];
  parts.push([box(w, h + 2, d), wall, { y: -2 }]);
  parts.push([box(w + 0.2, 2.5, d + 0.2), '#7c7a74', { y: -2 }]);
  parts.push([gableRoof(w, d * 0.42, d, 1.6), roof, { y: h }]);
  parts.push([box(w + 0.1, 0.22, d + 0.1), trim, { y: h - 0.22 }]);
  const step = w / boxes;
  for (let i = 0; i < boxes; i++) {
    const x = -w / 2 + step * (i + 0.5);
    parts.push([box(step * 0.62, 1.35, 0.14), door, { x, y: 0, z: d / 2 + 0.06 }]);
    parts.push([box(step * 0.62 + 0.2, 0.12, 0.2), trim, { x, y: 1.35, z: d / 2 + 0.08 }]);
    glass.push([box(step * 0.62, 1.1, 0.12), '#0d0e10', { x, y: 1.45, z: d / 2 + 0.03 }]);
    parts.push([box(0.14, h, 0.16), trim, { x: -w / 2 + step * i, y: 0, z: d / 2 + 0.06 }]);
    // Fenêtre arrière.
    glass.push([box(1, 0.7, 0.12), PALETTE.glass, { x, y: 2.6, z: -d / 2 - 0.03 }]);
  }
  parts.push([box(0.14, h, 0.16), trim, { x: w / 2, y: 0, z: d / 2 + 0.06 }]);
  return { body: partsToGeo(parts), glass: partsToGeo(glass) };
}

export function shedGeo({ w, d, h = 5, roof = '#5a4a3f', post = PALETTE.darkWood, hay = true }) {
  const parts = [];
  const nx = Math.max(2, Math.round(w / 4));
  for (let i = 0; i <= nx; i++) {
    const x = -w / 2 + (w / nx) * i;
    parts.push([box(0.3, h, 0.3), post, { x, z: -d / 2 }]);
    parts.push([box(0.3, h, 0.3), post, { x, z: d / 2 }]);
  }
  parts.push([gableRoof(w, d * 0.35, d, 0.8), roof, { y: h }]);
  parts.push([box(w, h, 0.2), '#6d5440', { z: -d / 2 }]);
  if (hay) {
    for (let i = 0; i < 18; i++) {
      const x = -w / 2 + 1.6 + (i % 6) * ((w - 3) / 6);
      const y = Math.floor(i / 6) * 0.9;
      parts.push([box(1.8, 0.85, 1.1), i % 3 ? '#d9c27a' : '#cfb66a', { x, y, z: -d / 2 + 1.4 }]);
      parts.push([box(1.8, 0.85, 1.1), '#d4bc72', { x, y, z: -d / 2 + 2.6 }]);
    }
  }
  return partsToGeo(parts);
}

// Clôture : poteaux + lisses entre deux points (coordonnées locales au sol, hauteurs données par getH).
export function fenceGeo(points, getH, { height = 1.15, rails = 2, color = PALETTE.white, post = null, spacing = 3, closed = false, board = false } = {}) {
  const geos = [];
  const pts = closed ? [...points, points[0]] : points;
  const postGeo = box(0.14, height + 0.3, 0.14);
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s];
    const [bx, bz] = pts[s + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / spacing));
    const ang = Math.atan2(bx - ax, bz - az);
    for (let i = 0; i < n; i++) {
      const t0 = i / n;
      const t1 = (i + 1) / n;
      const x0 = ax + (bx - ax) * t0, z0 = az + (bz - az) * t0;
      const x1 = ax + (bx - ax) * t1, z1 = az + (bz - az) * t1;
      const y0 = getH(x0, z0);
      const y1 = getH(x1, z1);
      geos.push(paint(transformed(postGeo, { x: x0, y: y0 - 0.3, z: z0 }), post || color));
      const segLen = Math.hypot(x1 - x0, z1 - z0, y1 - y0);
      const pitch = Math.atan2(y1 - y0, Math.hypot(x1 - x0, z1 - z0));
      if (board) {
        const g = box(0.06, height * 0.55, segLen, false);
        geos.push(paint(transformed(g, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + height * 0.45, z: (z0 + z1) / 2, ry: ang, rx: -pitch }), color));
      } else {
        for (let r = 0; r < rails; r++) {
          const ry = height * (0.45 + (0.5 * (r + 1)) / rails);
          const g = box(0.07, 0.12, segLen, false);
          geos.push(paint(transformed(g, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + ry, z: (z0 + z1) / 2, ry: ang, rx: -pitch }), color));
        }
      }
    }
    if (s === pts.length - 2) {
      geos.push(paint(transformed(postGeo, { x: bx, y: getH(bx, bz) - 0.3, z: bz }), post || color));
    }
  }
  return mergeGeometries(geos, false);
}

// --- Végétation (modèles de base peints une fois) ---
const TREE_CACHE = {};
export function treeTemplate(kind) {
  if (TREE_CACHE[kind]) return TREE_CACHE[kind];
  let parts;
  if (kind === 'oak') {
    parts = [
      [cyl(0.22, 0.34, 3.2, 5), '#5c4634'],
      [ico(2.6), '#4f7f37', { y: 4.6, sx: 1.1, sy: 0.9 }],
      [ico(2.1), '#5b8c3f', { x: 1.3, y: 5.6, z: 0.4 }],
      [ico(1.9), '#47753a', { x: -1.2, y: 5.1, z: -0.6 }],
    ];
  } else if (kind === 'pine') {
    parts = [
      [cyl(0.18, 0.28, 2.4, 5), '#5a4433'],
      [cone(2.6, 4.2, 7), '#2f5a36', { y: 1.9 }],
      [cone(2.0, 3.6, 7), '#356640', { y: 4.1 }],
      [cone(1.3, 2.8, 7), '#3b6e45', { y: 6.2 }],
    ];
  } else if (kind === 'poplar') {
    parts = [
      [cyl(0.16, 0.26, 2.5, 5), '#5f4b3a'],
      [ico(1.6), '#5f9142', { y: 5.2, sy: 2.6 }],
    ];
  } else if (kind === 'apple') {
    parts = [
      [cyl(0.16, 0.24, 1.6, 5), '#6a5240'],
      [ico(1.7), '#6c9c46', { y: 2.8, sx: 1.2, sy: 0.85, sz: 1.2 }],
      [box(0.22, 0.22, 0.22, false), '#c8402e', { x: 1.1, y: 2.5, z: 0.9 }],
      [box(0.22, 0.22, 0.22, false), '#c8402e', { x: -0.9, y: 3.2, z: 1.0 }],
      [box(0.22, 0.22, 0.22, false), '#d65538', { x: 0.4, y: 2.3, z: -1.3 }],
    ];
  } else if (kind === 'bush') {
    parts = [[ico(1), '#4e7d3a', { y: 0.6, sy: 0.75 }]];
  } else if (kind === 'birch') {
    parts = [
      [cyl(0.14, 0.2, 4, 5), '#e8e4da'],
      [ico(1.5), '#7dab4e', { y: 4.4, sy: 1.4 }],
      [ico(1.1), '#86b456', { x: 0.6, y: 5.5, sy: 1.2 }],
    ];
  }
  TREE_CACHE[kind] = partsToGeo(parts);
  return TREE_CACHE[kind];
}

export function hedgeGeo(len, rnd) {
  const parts = [[box(1.5, 1.25, len), '#3f6b33', {}]];
  const n = Math.max(1, Math.floor(len / 3));
  for (let i = 0; i < n; i++) {
    const z = -len / 2 + (i + 0.5) * (len / n);
    parts.push([ico(0.9 + rnd() * 0.4), rnd() > 0.5 ? '#46763a' : '#3a652f', { x: (rnd() - 0.5) * 0.4, y: 1.15, z, sy: 0.6 }]);
  }
  return partsToGeo(parts);
}

export function lampGeo() {
  return {
    body: partsToGeo([
      [cyl(0.07, 0.1, 4.2, 6), '#2a2b2f'],
      [box(0.9, 0.08, 0.08, false), '#2a2b2f', { x: 0.35, y: 4.15 }],
    ]),
    light: partsToGeo([[box(0.36, 0.22, 0.36), '#fff1c9', { x: 0.75, y: 3.88 }]]),
  };
}

export function benchGeo() {
  return partsToGeo([
    [box(1.8, 0.08, 0.5), PALETTE.wood, { y: 0.45 }],
    [box(1.8, 0.45, 0.06), PALETTE.wood, { y: 0.55, z: -0.24 }],
    [box(0.08, 0.45, 0.45), '#2a2b2f', { x: -0.8 }],
    [box(0.08, 0.45, 0.45), '#2a2b2f', { x: 0.8 }],
  ]);
}

export function parasolGeo(c1, c2) {
  const parts = [[cyl(0.04, 0.04, 2.4, 5), '#f2f1ec']];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const g = new THREE.ConeGeometry(1.4, 0.6, 2, 1, true, a, Math.PI / 3);
    prep(g);
    parts.push([g, i % 2 ? c1 : c2, { y: 2.6 }]);
  }
  return partsToGeo(parts);
}

export function roundBaleGeo() {
  const g = new THREE.CylinderGeometry(0.75, 0.75, 1.2, 10);
  g.rotateZ(Math.PI / 2);
  g.translate(0, 0.75, 0);
  return partsToGeo([[prep(g), '#d7c27b']]);
}

// Obstacle de saut d'obstacles (montants + barres), largeur w, hauteur h.
export function showJumpGeo(w, h, colors = ['#f2f1ec', '#17181b'], oxer = false) {
  const parts = [];
  const wing = (x) => {
    parts.push([box(0.18, h + 0.6, 0.18), colors[1], { x, z: 0 }]);
    parts.push([box(0.12, h + 0.2, 0.9), colors[0], { x: x + Math.sign(x) * 0.35, y: 0, z: 0 }]);
    parts.push([box(0.12, 0.12, 1.2), colors[1], { x: x + Math.sign(x) * 0.35, y: h + 0.15, z: 0 }]);
  };
  wing(-w / 2 - 0.2);
  wing(w / 2 + 0.2);
  if (oxer) {
    parts.push([box(0.18, h + 0.6, 0.18), colors[1], { x: -w / 2 - 0.2, z: 1.2 }]);
    parts.push([box(0.18, h + 0.6, 0.18), colors[1], { x: w / 2 + 0.2, z: 1.2 }]);
  }
  return partsToGeo(parts);
}

export function railGeo(w, colors = ['#f2f1ec', '#17181b']) {
  // Barre rayée (segments alternés).
  const parts = [];
  const n = 6;
  for (let i = 0; i < n; i++) {
    const g = new THREE.CylinderGeometry(0.06, 0.06, w / n, 6);
    g.rotateZ(Math.PI / 2);
    parts.push([prep(g), colors[i % 2], { x: -w / 2 + (w / n) * (i + 0.5) }]);
  }
  return partsToGeo(parts);
}

export function logJumpGeo(w, h) {
  const g = new THREE.CylinderGeometry(h * 0.5, h * 0.55, w, 8);
  g.rotateZ(Math.PI / 2);
  g.translate(0, h * 0.5, 0);
  const parts = [[prep(g), '#7a5a3e']];
  parts.push([box(0.35, h * 0.9, 0.35), '#5f4632', { x: -w / 2 + 0.3, z: 0.35 }]);
  parts.push([box(0.35, h * 0.9, 0.35), '#5f4632', { x: w / 2 - 0.3, z: 0.35 }]);
  return partsToGeo(parts);
}

export function brushJumpGeo(w, h) {
  const parts = [[box(w, h * 0.5, 1.2), '#6b5038']];
  const n = Math.floor(w / 0.6);
  for (let i = 0; i < n; i++) {
    parts.push([cone(0.4, h * 0.65, 5), i % 2 ? '#3d6a32' : '#467a39', { x: -w / 2 + 0.3 + i * 0.6, y: h * 0.35 }]);
  }
  parts.push([box(0.3, h + 0.3, 0.3), '#f2f1ec', { x: -w / 2 - 0.3 }]);
  parts.push([box(0.3, h + 0.3, 0.3), '#f2f1ec', { x: w / 2 + 0.3 }]);
  return partsToGeo(parts);
}

export function flagGeo(color) {
  return partsToGeo([
    [cyl(0.05, 0.06, 7, 5), '#d9d9d6'],
    [box(0.04, 1.1, 1.7, false), color, { y: 6.2, z: 0.88 }],
  ]);
}

export function carGeo(color) {
  return partsToGeo([
    [box(1.8, 0.7, 4.2), color, { y: 0.35 }],
    [box(1.6, 0.62, 2.2), color, { y: 1.05, z: -0.2 }],
    [box(1.62, 0.5, 2.0), '#26313b', { y: 1.08, z: -0.2 }],
    [box(0.4, 0.18, 0.06), '#fff3d0', { x: -0.6, y: 0.6, z: 2.1 }],
    [box(0.4, 0.18, 0.06), '#fff3d0', { x: 0.6, y: 0.6, z: 2.1 }],
    [box(0.4, 0.15, 0.06), '#c8302a', { x: -0.6, y: 0.6, z: -2.1 }],
    [box(0.4, 0.15, 0.06), '#c8302a', { x: 0.6, y: 0.6, z: -2.1 }],
    ...[[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]].map(([x, z]) => [cyl(0.36, 0.36, 0.25, 8, false), '#141416', { x, y: 0.36, z, rz: Math.PI / 2 }]),
  ]);
}

// Auvent rayé au-dessus d'une vitrine (façade locale +Z).
export function awningGeo(w, c1, c2) {
  const parts = [];
  const n = Math.max(3, Math.round(w / 0.6));
  for (let i = 0; i < n; i++) {
    parts.push([box(w / n + 0.01, 0.06, 1.5, false), i % 2 ? c1 : c2, { x: -w / 2 + (w / n) * (i + 0.5), y: 3.05, z: 0.72, rx: 0.32 }]);
  }
  parts.push([box(w, 0.25, 0.04, false), c1, { y: 2.72, z: 1.42 }]);
  return partsToGeo(parts);
}

export function planterGeo(flower) {
  return partsToGeo([
    [box(1.6, 0.5, 0.6), '#3a3d42'],
    [ico(0.32), flower, { x: -0.45, y: 0.62, sy: 0.7 }],
    [ico(0.32), '#4f7f37', { x: 0, y: 0.6, sy: 0.7 }],
    [ico(0.32), flower, { x: 0.45, y: 0.62, sy: 0.7 }],
  ]);
}

export { partsToGeo, box, cyl, cone, ico, limb };
