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
  // Volets typiques de la côte normande (couleur stable pour un même bâtiment).
  const SHUTTERS = ['#5d7480', '#7d8b6a', '#e9e6de', '#4a5560', '#8c6d55', '#6f8fa0'];
  const shutter = SHUTTERS[Math.floor(Math.abs(Math.sin(w * 12.9898 + d * 78.233) * 43758.5453)) % SHUTTERS.length];
  const isShop = !!(trim && trim.toLowerCase() === '#c8a96e');
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
        if (isDoor) {
          // Porte d'entrée : vantail à panneaux, imposte vitrée, seuil en pierre.
          body.push([box(ww, wh, 0.14), doorColor, tf]);
          body.push([box(ww - 0.3, wh * 0.32, 0.03), doorColor, { ...tf, y: wy + wh * 0.12, z: z + f.nz * 0.08, x: x + f.nx * 0.08 }]);
          body.push([box(ww - 0.3, wh * 0.32, 0.03), doorColor, { ...tf, y: wy + wh * 0.52, z: z + f.nz * 0.08, x: x + f.nx * 0.08 }]);
          body.push([box(ww + 0.5, 0.12, 0.5), '#b9b4a8', { ...tf, y: -0.06 }]);
          body.push([box(ww + 0.3, 0.14, 0.18), trim || PALETTE.white, { ...tf, y: wy + wh }]);
        } else if (windows) {
          const tc = trim || PALETTE.white;
          // Fenêtre : dormant, appui saillant, petits bois (croisillons), volets battants sur les maisons.
          body.push([box(ww + 0.2, wh + 0.2, 0.1), tc, { ...tf, y: wy - 0.1 }]);
          body.push([box(ww + 0.36, 0.08, 0.26), '#c9c4b8', { ...tf, y: wy - 0.16 }]);
          const off = (k) => ({ x: x + f.nx * k, z: z + f.nz * k });
          body.push([box(0.05, wh, 0.05), tc, { ...tf, ...off(0.07) }]);
          body.push([box(ww, 0.05, 0.05), tc, { ...tf, ...off(0.07), y: wy + wh * 0.62 }]);
          if (roofType !== 'flat' && !isShop) {
            const along = (k) => (f.nx === 0 ? { x: x + k * (f.nz > 0 ? 1 : -1), z: z + f.nz * 0.06 } : { x: x + f.nx * 0.06, z: z + k * (f.nx > 0 ? -1 : 1) });
            for (const sd of [-1, 1]) body.push([box(ww * 0.52, wh + 0.12, 0.05), shutter, { ...tf, ...along(sd * (ww * 0.76 + 0.1)), y: wy - 0.06 }]);
          }
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
// Bâtiment d'écurie (boxes extérieurs) : bardage, portes de box à deux vantaux (bas fermé, haut ouvert avec grille),
// plaques nominatives, auvent sur poteaux avec jambes de force, gouttières et descentes, lanterneaux d'aération.
export function stableGeo({ w, d, h = 4.2, boxes = 8, wall = '#26272b', trim = PALETTE.white, roof = '#3a3d42', door = '#3c3f45' }) {
  const parts = [];
  const glass = [];
  const zf = d / 2;
  parts.push([box(w, h + 2, d), wall, { y: -2 }]);
  parts.push([box(w + 0.2, 2.45, d + 0.2), '#8a877f', { y: -2 }]);
  // Toit avec débord formant auvent, rives et faîtage.
  parts.push([gableRoof(w, d * 0.42, d, 1.6), roof, { y: h }]);
  parts.push([box(w + 3.3, 0.12, 0.2), '#2b2d31', { y: h + d * 0.42 - 0.02 }]);
  parts.push([box(w + 0.1, 0.22, d + 0.1), trim, { y: h - 0.22 }]);
  // Gouttières (demi-rondes) et descentes.
  for (const side of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.07, 0.07, w + 3.2, 8, 1, true, 0, Math.PI);
    g.rotateZ(Math.PI / 2);
    parts.push([prep(g), '#8b9096', { y: h - 0.62, z: side * (zf + 1.62) }]);
    for (const sx of [-1, 1]) parts.push([cyl(0.045, 0.045, h - 0.6, 6), '#8b9096', { x: sx * (w / 2 + 1.5), z: side * (zf + 1.62) }]);
  }
  const step = w / boxes;
  for (let i = 0; i < boxes; i++) {
    const x = -w / 2 + step * (i + 0.5);
    const dw = Math.min(1.25, step * 0.42);
    // Encadrement de porte.
    parts.push([box(dw + 0.2, 0.1, 0.12), trim, { x, y: 2.3, z: zf + 0.06 }]);
    parts.push([box(0.1, 2.3, 0.12), trim, { x: x - dw / 2 - 0.05, z: zf + 0.06 }]);
    parts.push([box(0.1, 2.3, 0.12), trim, { x: x + dw / 2 + 0.05, z: zf + 0.06 }]);
    // Vantail bas en planches, renfort en Z, barre de pied en acier.
    parts.push([box(dw, 1.3, 0.06), door, { x, z: zf + 0.04 }]);
    parts.push([box(dw - 0.1, 0.08, 0.03), trim, { x, y: 1.18, z: zf + 0.08 }]);
    parts.push([box(dw - 0.1, 0.08, 0.03), trim, { x, y: 0.08, z: zf + 0.08 }]);
    parts.push([box(Math.hypot(dw - 0.1, 1.0), 0.07, 0.03, false), trim, { x, y: 0.65, z: zf + 0.085, rz: Math.atan2(1.0, dw - 0.1) }]);
    parts.push([box(dw, 0.12, 0.04), '#5b5f64', { x, y: 1.28, z: zf + 0.08 }]);
    // Ouverture haute (intérieur sombre) et grille de box.
    glass.push([box(dw, 0.98, 0.04), '#0a0b0c', { x, y: 1.32, z: zf + 0.01 }]);
    for (let k = 1; k < 9; k++) parts.push([cyl(0.011, 0.011, 0.95, 4), '#4a4d52', { x: x - dw / 2 + (dw / 9) * k, y: 1.33, z: zf + 0.05 }]);
    // Vantail haut ouvert, rabattu contre le mur.
    parts.push([box(0.05, 1.0, dw * 0.5), door, { x: x + dw / 2 + 0.16 + dw * 0.25, y: 1.32, z: zf + 0.05, ry: Math.PI / 2 }]);
    // Plaque nominative et applique.
    parts.push([box(0.32, 0.12, 0.02), '#f2f1ec', { x, y: 2.45, z: zf + 0.13 }]);
    parts.push([box(0.16, 0.22, 0.14), '#1d1e21', { x: x - step * 0.36, y: 2.55, z: zf + 0.07 }]);
    glass.push([box(0.12, 0.08, 0.08), '#fff1c9', { x: x - step * 0.36, y: 2.5, z: zf + 0.11 }]);
    parts.push([box(0.14, h, 0.16), trim, { x: -w / 2 + step * i, y: 0, z: zf + 0.06 }]);
    // Poteaux d'auvent (un sur deux).
    if (i % 2 === 0) parts.push([box(0.16, h - 0.1, 0.16), trim, { x: -w / 2 + step * i, z: zf + 1.45 }]);
    // Fenêtre arrière avec cadre.
    parts.push([box(1.12, 0.82, 0.08), trim, { x, y: 2.54, z: -zf - 0.03 }]);
    glass.push([box(1, 0.7, 0.12), PALETTE.glass, { x, y: 2.6, z: -zf - 0.05 }]);
    // Lanterneaux d'aération sur le faîtage.
    if (i % 3 === 1) {
      parts.push([box(0.9, 0.55, 0.9), wall, { x, y: h + d * 0.42 - 0.15 }]);
      for (let k = 0; k < 3; k++) parts.push([box(0.94, 0.05, 0.94), trim, { x, y: h + d * 0.42 + 0.02 + k * 0.14 }]);
      parts.push([hipRoof(0.9, 0.35, 0.9, 0.12), roof, { x, y: h + d * 0.42 + 0.4 }]);
    }
  }
  parts.push([box(0.14, h, 0.16), trim, { x: w / 2, y: 0, z: zf + 0.06 }]);
  parts.push([box(0.16, h - 0.1, 0.16), trim, { x: w / 2, z: zf + 1.45 }]);
  // Dalle béton devant les boxes.
  parts.push([box(w + 1.2, 0.08, 2.0), '#a6a39b', { y: -0.04, z: zf + 1.0 }]);
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
  // Poteaux : ronds (bois traité) pour les lisses, carrés avec chapeau pour les pare-bottes de carrière.
  const postGeo = board
    ? mergeGeometries([box(0.12, height + 0.3, 0.12), transformed(box(0.16, 0.05, 0.16), { y: height + 0.3 })], false)
    : mergeGeometries([cyl(0.065, 0.075, height + 0.3, 8), transformed(cone(0.07, 0.06, 8), { y: height + 0.3 })], false);
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
        // Pare-bottes plein (légèrement incliné vers l'extérieur) et lisse haute.
        const g = box(0.045, height * 0.55, segLen, false);
        geos.push(paint(transformed(g, { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + height * 0.3, z: (z0 + z1) / 2, ry: ang, rx: -pitch, rz: 0.05 }), color));
        geos.push(paint(transformed(box(0.05, 0.12, segLen, false), { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + height * 0.92, z: (z0 + z1) / 2, ry: ang, rx: -pitch }), color));
      } else {
        for (let r = 0; r < rails; r++) {
          const ry = height * (0.45 + (0.5 * (r + 1)) / rails);
          const g = box(0.04, 0.14, segLen + 0.1, false);
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
// Chandeliers de CSO à ailes (montant intérieur, aile à lattes, pieds en croix, taquets métalliques),
// remplissage (planche ou bac à fleurs) et fanions : rouge à droite, blanc à gauche dans le sens du saut (+z).
export function showJumpGeo(w, h, colors = ['#f2f1ec', '#17181b'], oxer = false) {
  const parts = [];
  const [c0, c1] = colors;
  const postH = h + 0.75;
  const standard = (side, z) => {
    const x = side * (w / 2 + 0.07);
    // Montant intérieur peint, bandes de couleur.
    parts.push([box(0.09, postH, 0.09), c0, { x, z }]);
    for (let y = 0.25; y < postH - 0.2; y += 0.5) parts.push([box(0.095, 0.12, 0.095), c1, { x, y, z }]);
    // Pieds en croix.
    parts.push([box(0.6, 0.07, 0.08), c1, { x: x + side * 0.12, z }]);
    parts.push([box(0.08, 0.07, 0.7), c1, { x, z }]);
    // Aile : montant extérieur, lisse supérieure inclinée, lattes.
    const xo = x + side * 0.95;
    parts.push([box(0.08, postH * 0.72, 0.08), c0, { x: xo, z }]);
    const topY = postH - 0.12, outY = postH * 0.72;
    const len = Math.hypot(0.95, topY - outY);
    parts.push([box(len, 0.08, 0.07, false), c0, { x: x + side * 0.475, y: (topY + outY) / 2, z, rz: side * -Math.atan2(topY - outY, 0.95) }]);
    for (let k = 0; k < 4; k++) {
      const y = 0.18 + k * ((outY - 0.25) / 3.5);
      parts.push([box(0.95, 0.09, 0.035, false), k % 2 ? c1 : c0, { x: x + side * 0.475, y: y + 0.045, z }]);
    }
  };
  standard(-1, 0);
  standard(1, 0);
  if (oxer) {
    standard(-1, 1.2);
    standard(1, 1.2);
  }
  // Taquets (coupelles) sous chaque barre.
  for (const z of oxer ? [0, 1.2] : [0]) {
    for (const hh of z ? [h + 0.05] : [h, h * 0.62, h * 0.3]) {
      for (const side of [-1, 1]) parts.push([box(0.06, 0.05, 0.13), '#9ea3a8', { x: side * (w / 2 + 0.02), y: hh - 0.085, z }]);
    }
  }
  // Remplissage : planche peinte (vertical) ou bac de fleurs (oxer).
  if (!oxer) {
    parts.push([box(w - 0.1, 0.32, 0.04), c1, { y: 0.06, z: 0.02 }]);
    parts.push([box(w - 0.1, 0.05, 0.045), c0, { y: 0.22, z: 0.02 }]);
  } else {
    // Jardinière en bois : buis serrés et fleurs (géraniums, rudbeckias).
    parts.push([box(w * 0.85, 0.32, 0.45), '#6b5039', { y: 0, z: -0.45 }]);
    const n = Math.max(6, Math.floor(w * 4.5));
    for (let i = 0; i < n; i++) {
      const fx = -w * 0.41 + (i / (n - 1)) * w * 0.82;
      const fz = -0.45 + (((i * 7) % 5) - 2) * 0.05;
      parts.push([ico(0.11 + ((i * 3) % 4) * 0.012, 1), i % 2 ? '#2f4424' : '#34502a', { x: fx, y: 0.36, z: fz, sy: 0.75 }]);
      if (i % 2 === 0) parts.push([ico(0.035, 0), i % 6 === 0 ? '#e9c23c' : '#b3262b', { x: fx + 0.04, y: 0.45, z: fz + 0.03 }]);
      if (i % 3 === 1) parts.push([ico(0.03, 0), '#c42e35', { x: fx - 0.05, y: 0.44, z: fz - 0.06 }]);
    }
  }
  // Fanions (rouge à droite, blanc à gauche quand on saute vers +z).
  for (const side of [-1, 1]) {
    const x = side * (w / 2 + 0.07);
    parts.push([cyl(0.012, 0.012, 0.45, 4), '#d9d9d6', { x, y: postH }]);
    parts.push([box(0.01, 0.2, 0.26, false), side < 0 ? '#c62b2b' : '#f4f3ee', { x, y: postH + 0.32, z: 0.13 }]);
  }
  return partsToGeo(parts);
}

// Barre de 10 cm de diamètre, peinte en bandes de ~45 cm, embouts arrondis.
export function railGeo(w, colors = ['#f2f1ec', '#17181b']) {
  const parts = [];
  const n = Math.max(4, Math.round(w / 0.45));
  for (let i = 0; i < n; i++) {
    const g = new THREE.CylinderGeometry(0.05, 0.05, w / n, 14, 1, true);
    g.rotateZ(Math.PI / 2);
    parts.push([prep(g), colors[i % 2], { x: -w / 2 + (w / n) * (i + 0.5) }]);
  }
  for (const side of [-1, 1]) {
    const cap = new THREE.SphereGeometry(0.05, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.rotateZ(-side * Math.PI / 2);
    parts.push([prep(cap), colors[0], { x: side * w / 2 }]);
  }
  return partsToGeo(parts);
}

// Tronc de cross : écorce, cernes aux extrémités, chevalets.
export function logJumpGeo(w, h) {
  const r = h * 0.5;
  const g = new THREE.CylinderGeometry(r * 0.94, r, w, 18, 6);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const a = Math.atan2(pos.getZ(i), pos.getX(i));
    const k = 1 + 0.035 * Math.sin(a * 9 + pos.getY(i) * 2.1) + 0.02 * Math.sin(a * 23);
    pos.setX(i, pos.getX(i) * k);
    pos.setZ(i, pos.getZ(i) * k);
  }
  g.rotateZ(Math.PI / 2);
  g.translate(0, r, 0);
  const parts = [[prep(g), '#5d4a3a']];
  for (const side of [-1, 1]) {
    const end = new THREE.CircleGeometry(r * 0.95, 18);
    end.rotateY(side * Math.PI / 2);
    parts.push([prep(end), '#b8946a', { x: side * (w / 2 + 0.002), y: r }]);
    parts.push([box(0.22, r * 1.1, 0.22), '#4e3d2f', { x: side * (w / 2 - 0.35), z: 0.42, rz: 0 }]);
    parts.push([box(0.22, r * 1.1, 0.22), '#4e3d2f', { x: side * (w / 2 - 0.35), z: -0.42 }]);
  }
  return partsToGeo(parts);
}

// Haie de cross : caisson en bois et brosse de bouleau taillée.
export function brushJumpGeo(w, h) {
  const parts = [[box(w, h * 0.45, 1.1), '#5b4533']];
  parts.push([box(w + 0.04, 0.08, 1.14), '#4a382a', { y: h * 0.45 }]);
  const n = Math.floor(w / 0.18);
  for (let i = 0; i < n; i++) {
    for (const zz of [-0.3, 0, 0.3]) {
      const x = -w / 2 + 0.09 + i * 0.18 + ((i * 13 + zz * 10) % 5) * 0.012;
      parts.push([cone(0.11, h * 0.62 + ((i * 7) % 5) * 0.02, 5), (i + zz * 10) % 3 ? '#4a4b33' : '#57583c', { x, y: h * 0.38, z: zz }]);
    }
  }
  parts.push([box(0.22, h + 0.25, 0.22), '#f2f1ec', { x: -w / 2 - 0.3 }]);
  parts.push([box(0.22, h + 0.25, 0.22), '#f2f1ec', { x: w / 2 + 0.3 }]);
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

// Jardinière de rue : bac en acier, feuillage dense et petites fleurs dispersées.
export function planterGeo(flower) {
  const parts = [[box(1.6, 0.5, 0.6), '#3a3d42'], [box(1.66, 0.05, 0.66), '#2b2d31', { y: 0.5 }]];
  for (let i = 0; i < 9; i++) {
    const x = -0.62 + (i % 5) * 0.31, z = i < 5 ? -0.12 : 0.12;
    parts.push([ico(0.16 + (i % 3) * 0.02, 1), i % 2 ? '#3c5a2c' : '#476a33', { x, y: 0.56, z, sy: 0.6 }]);
  }
  for (let i = 0; i < 14; i++) {
    const x = -0.68 + ((i * 7) % 14) * 0.1, z = ((i * 5) % 5) * 0.09 - 0.18;
    parts.push([ico(0.045, 0), i % 4 === 3 ? '#f2f1ec' : flower, { x, y: 0.66 + (i % 3) * 0.02, z }]);
  }
  return partsToGeo(parts);
}

export { partsToGeo, box, cyl, cone, ico, limb };
